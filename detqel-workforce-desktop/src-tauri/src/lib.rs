use serde::{Deserialize, Serialize};
use std::{
    io::{BufRead, BufReader, Write},
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::{mpsc, Arc, Mutex},
    time::{Duration, Instant},
};
use tauri::Manager;

struct Backend {
    child: Option<Child>,
    address: Option<String>,
    token: String,
    error: Option<String>,
    config_path: PathBuf,
    steps: Vec<StartupStep>,
    started_at: Instant,
    finished_at: Option<Instant>,
    stopping: bool,
}

impl Backend {
    fn fail(&mut self, message: String) {
        self.address = None;
        if self.error.is_none() {
            self.error = Some(sanitize_startup_text(&message, 2048));
        }
        self.finished_at = Some(Instant::now());
        for step in &mut self.steps {
            if matches!(step.status, StartupStepStatus::Running) {
                step.status = StartupStepStatus::Error;
                if step.detail.is_none() {
                    step.detail = self.error.clone();
                }
            }
        }
    }

    fn stop(&mut self) {
        self.stopping = true;
        if let Some(mut child) = self.child.take() {
            if let Some(mut stdin) = child.stdin.take() {
                let _ = stdin.write_all(b"shutdown\n");
            }
            let deadline = Instant::now() + Duration::from_secs(7);
            while Instant::now() < deadline {
                if matches!(child.try_wait(), Ok(Some(_))) {
                    return;
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

impl Drop for Backend {
    fn drop(&mut self) {
        self.stop();
    }
}

type SharedBackend = Arc<Mutex<Backend>>;

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
enum StartupStepStatus {
    Pending,
    Running,
    Complete,
    Error,
}

#[derive(Clone, Deserialize, Serialize)]
struct StartupStep {
    id: String,
    label: String,
    status: StartupStepStatus,
    detail: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BackendStatus {
    ready: bool,
    error: Option<String>,
    config_path: String,
    steps: Vec<StartupStep>,
    elapsed_seconds: u64,
}

#[tauri::command]
fn backend_status(state: tauri::State<'_, SharedBackend>) -> Result<BackendStatus, String> {
    let mut backend = state.lock().map_err(|_| "Backend state unavailable")?;
    // During initialization the stdout supervisor owns errors so a queued, specific
    // service failure is never replaced by a process-exit message from polling.
    let process_error = if backend.address.is_some() && backend.error.is_none() {
        backend.child.as_mut().and_then(|child| match child.try_wait() {
            Ok(Some(status)) => Some(format!("The desktop backend stopped ({status}). Restart the application to reconnect.")),
            Err(error) => Some(format!("Unable to monitor the desktop backend: {error}")),
            Ok(None) => None,
        })
    } else {
        None
    };
    if let Some(error) = process_error {
        backend.fail(error);
    }
    Ok(BackendStatus {
        ready: backend.address.is_some() && backend.error.is_none(),
        error: backend.error.clone(),
        config_path: backend.config_path.display().to_string(),
        steps: backend.steps.clone(),
        elapsed_seconds: backend.finished_at.unwrap_or_else(Instant::now)
            .saturating_duration_since(backend.started_at).as_secs(),
    })
}

fn sanitize_startup_text(value: &str, limit: usize) -> String {
    value.chars().filter(|character| !character.is_control() || matches!(*character, '\n' | '\t'))
        .take(limit).collect()
}

fn valid_backend_address(address: &str) -> bool {
    let Ok(url) = reqwest::Url::parse(address) else {
        return false;
    };
    url.scheme() == "http"
        && url.host_str() == Some("127.0.0.1")
        && url.port().is_some_and(|port| (50_000..=59_999).contains(&port))
        && url.username().is_empty()
        && url.password().is_none()
        && url.path() == "/"
        && url.query().is_none()
        && url.fragment().is_none()
}

fn fail_startup(shared: &SharedBackend, message: String) {
    if let Ok(mut backend) = shared.lock() {
        backend.fail(message);
        backend.stop();
    }
}

fn supervise_startup(shared: SharedBackend, receiver: mpsc::Receiver<serde_json::Value>) {
    let deadline = Instant::now() + Duration::from_secs(60 * 60);
    loop {
        let value = match receiver.recv_timeout(deadline.saturating_duration_since(Instant::now())) {
            Ok(value) => value,
            Err(mpsc::RecvTimeoutError::Timeout) => {
                fail_startup(&shared, "Application startup exceeded 60 minutes. Review Docker and service availability, then restart the application.".into());
                return;
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                fail_startup(&shared, "The startup manager stopped before the application API became ready.".into());
                return;
            }
        };
        if value.get("type").and_then(|value| value.as_str()) == Some("startup") {
            let step = value.get("step").cloned()
                .and_then(|step| serde_json::from_value::<StartupStep>(step).ok());
            let Some(mut step) = step else {
                fail_startup(&shared, "The startup manager reported an invalid progress event.".into());
                return;
            };
            if step.id.is_empty() || step.id.len() > 100 || step.label.trim().is_empty()
                || !step.id.chars().all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.')) {
                fail_startup(&shared, "The startup manager reported an invalid progress identifier or label.".into());
                return;
            }
            step.label = sanitize_startup_text(&step.label, 200);
            step.detail = step.detail.map(|detail| sanitize_startup_text(&detail, 2048));
            if let Ok(mut backend) = shared.lock() {
                if let Some(existing) = backend.steps.iter_mut().find(|existing| existing.id == step.id) {
                    *existing = step;
                } else {
                    backend.steps.push(step);
                }
            }
        }
        if let Some(ready) = value.get("ready") {
            if ready.as_bool() == Some(true) {
                let address = value.get("address").and_then(|address| address.as_str());
                let Some(address) = address.filter(|address| valid_backend_address(address)) else {
                    fail_startup(&shared, "The backend reported an invalid local API address.".into());
                    return;
                };
                if let Ok(mut backend) = shared.lock() {
                    if backend.error.is_none() && !backend.stopping {
                        backend.address = Some(address.trim_end_matches('/').to_owned());
                        backend.finished_at = Some(Instant::now());
                    }
                }
            } else if ready.as_bool() == Some(false) {
                let message = value.get("error").and_then(|error| error.as_str())
                    .filter(|error| !error.trim().is_empty());
                match message {
                    Some(message) => fail_startup(&shared, message.to_owned()),
                    None => fail_startup(&shared, "The startup manager reported failure without an error message.".into()),
                }
            } else {
                fail_startup(&shared, "The startup manager reported an invalid readiness event.".into());
            }
            return;
        }
    }
}

fn valid_api_path(path: &str) -> bool {
    path.starts_with("/api/")
        && !path.contains(['\\', '\r', '\n', '#'])
        && !path.split('?').next().unwrap_or("").split('/').any(|part| {
            let decoded = part.to_ascii_lowercase().replace("%2e", ".");
            decoded == ".." || decoded == "." || decoded.contains("%2f") || decoded.contains("%5c")
        })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ApiResponse {
    status: u16,
    body: String,
    content_type: String,
}

#[tauri::command]
async fn api_request(
    state: tauri::State<'_, SharedBackend>,
    client: tauri::State<'_, reqwest::Client>,
    path: String,
    method: String,
    body: Option<String>,
    authorization: Option<String>,
) -> Result<ApiResponse, String> {
    if !valid_api_path(&path) {
        return Err("Only application API paths are allowed".into());
    }
    if !matches!(method.as_str(), "GET" | "POST" | "PUT" | "PATCH" | "DELETE") {
        return Err("Unsupported API method".into());
    }
    if body.as_ref().is_some_and(|body| body.len() > 1_048_576) {
        return Err("Request exceeds the API body limit".into());
    }
    let (address, token) = {
        let backend = state.lock().map_err(|_| "Backend state unavailable")?;
        (
            backend.address.clone().ok_or("Backend is not ready")?,
            backend.token.clone(),
        )
    };
    let method = reqwest::Method::from_bytes(method.as_bytes()).map_err(|_| "Invalid method")?;
    let mut request = client
        .request(method, format!("{address}{path}"))
        .header("x-detqel-desktop-token", token);
    if let Some(authorization) = authorization {
        if !authorization.starts_with("Bearer ") || authorization.len() > 4096 {
            return Err("Invalid session authorization header".into());
        }
        request = request.header("Authorization", authorization);
    }
    if let Some(body) = body {
        request = request
            .header("Content-Type", "application/json")
            .body(body);
    }
    let response = request
        .send()
        .await
        .map_err(|_| "The local API request failed")?;
    let status = response.status().as_u16();
    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|value| value.to_str().ok())
        .unwrap_or("application/json")
        .to_owned();
    let body = response
        .text()
        .await
        .map_err(|_| "Unable to read API response")?;
    Ok(ApiResponse {
        status,
        body,
        content_type,
    })
}

fn start_backend(
    app: &tauri::AppHandle,
    shared: SharedBackend,
) -> Result<(), Box<dyn std::error::Error>> {
    let resources = app.path().resource_dir()?;
    let runtime_dir = app.path().app_config_dir()?.join("runtime");
    std::fs::create_dir_all(&runtime_dir)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&runtime_dir, std::fs::Permissions::from_mode(0o700))?;
    }
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let (node, entry, working_dir, config_path) = if tauri::is_dev() {
        let backend = manifest.join("../backend");
        let node = manifest.join(format!(
            "binaries/detqel-node-{}{}",
            env!("DETQEL_TARGET"),
            std::env::consts::EXE_SUFFIX
        ));
        (
            node,
            backend.join("src/desktop-entry.ts"),
            backend.clone(),
            backend.join(".env"),
        )
    } else {
        let config_dir = app.path().app_config_dir()?;
        std::fs::create_dir_all(&config_dir)?;
        let config = config_dir.join("backend.env");
        // create_new avoids overwriting user configuration, including on upgrades.
        match std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&config)
        {
            Ok(mut file) => {
                file.write_all(&std::fs::read(resources.join("backend/.env.example"))?)?;
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    file.set_permissions(std::fs::Permissions::from_mode(0o600))?;
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(error) => return Err(error.into()),
        }
        (
            std::env::current_exe()?
                .with_file_name(format!("detqel-node{}", std::env::consts::EXE_SUFFIX)),
            resources.join("backend/dist/desktop-entry.js"),
            resources.join("backend"),
            config,
        )
    };
    let token = {
        let mut backend = shared.lock().map_err(|_| "Backend state unavailable")?;
        if backend.stopping {
            return Err("Application shutdown is in progress".into());
        }
        backend.config_path = config_path.clone();
        backend.token.clone()
    };
    let mut command = Command::new(node);
    if tauri::is_dev() {
        command.arg("--import").arg("tsx");
    }
    command
        .arg(entry)
        .current_dir(working_dir)
        .env_remove("NODE_OPTIONS")
        .env_remove("NODE_PATH")
        .env("DETQEL_CONFIG_PATH", config_path)
        .env("DETQEL_RUNTIME_DIR", runtime_dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    let mut child = command.spawn()?;
    let stdout = child.stdout.take().ok_or("Backend output unavailable")?;
    let initialization = format!("{}\n", serde_json::json!({ "token": token }));
    if let Err(error) = child
        .stdin
        .as_mut()
        .ok_or("Backend input unavailable")?
        .write_all(initialization.as_bytes())
    {
        let _ = child.kill();
        let _ = child.wait();
        return Err(error.into());
    }
    match shared.lock() {
        Ok(mut backend) if !backend.stopping => backend.child = Some(child),
        _ => {
            let _ = child.kill();
            let _ = child.wait();
            return Err("Backend startup interrupted by application shutdown".into());
        }
    }
    let (sender, receiver) = mpsc::channel();
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(&line) {
                // Keep draining stdout after readiness so later process output cannot block it.
                let _ = sender.send(value);
            }
        }
    });
    std::thread::spawn(move || supervise_startup(shared, receiver));
    Ok(())
}

pub fn run() {
    let shared = Arc::new(Mutex::new(Backend {
        child: None,
        address: None,
        token: uuid::Uuid::new_v4().to_string(),
        error: None,
        config_path: PathBuf::new(),
        steps: Vec::new(),
        started_at: Instant::now(),
        finished_at: None,
        stopping: false,
    }));
    let app = tauri::Builder::default()
        .manage(shared.clone())
        .manage(
            reqwest::Client::builder()
                .no_proxy()
                .redirect(reqwest::redirect::Policy::none())
                .timeout(Duration::from_secs(180))
                .build()
                .expect("HTTP client initialization failed"),
        )
        .invoke_handler(tauri::generate_handler![backend_status, api_request])
        .setup(move |app| {
            let handle = app.handle().clone();
            let startup_state = shared.clone();
            std::thread::spawn(move || {
                if let Err(error) = start_backend(&handle, startup_state.clone()) {
                    fail_startup(&startup_state, format!("Unable to start the packaged backend: {error}"));
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Desktop runtime initialization failed");
    app.run(|app, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            if let Ok(mut backend) = app.state::<SharedBackend>().lock() {
                backend.stop();
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::valid_api_path;
    #[test]
    fn restricts_bridge_to_application_paths() {
        assert!(valid_api_path("/api/settings/providers?workspaceId=123"));
        for path in [
            "https://example.com",
            "//example.com/api/",
            "/docs",
            "/api/../docs",
            "/api/%2e%2e/docs",
            "/api/foo%2f..%2fdocs",
            "/api/foo\\bar",
        ] {
            assert!(!valid_api_path(path), "{path}");
        }
    }
}
