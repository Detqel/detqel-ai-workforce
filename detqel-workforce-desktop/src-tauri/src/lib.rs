use serde::Serialize;
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
}

impl Backend {
    fn stop(&mut self) {
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BackendStatus {
    ready: bool,
    error: Option<String>,
    config_path: String,
}

#[tauri::command]
fn backend_status(state: tauri::State<'_, SharedBackend>) -> Result<BackendStatus, String> {
    let mut backend = state.lock().map_err(|_| "Backend state unavailable")?;
    if let Some(child) = backend.child.as_mut() {
        if matches!(child.try_wait(), Ok(Some(_))) {
            backend.address = None;
            if backend.error.is_none() {
                backend.error = Some(
                    "The backend stopped. Check your database configuration and restart the app."
                        .into(),
                );
            }
        }
    }
    Ok(BackendStatus {
        ready: backend.address.is_some() && backend.error.is_none(),
        error: backend.error.clone(),
        config_path: backend.config_path.display().to_string(),
    })
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
    shared
        .lock()
        .map_err(|_| "Backend state unavailable")?
        .child = Some(child);
    let (sender, receiver) = mpsc::channel();
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(&line) {
                if value.get("ready").is_some() {
                    let _ = sender.send(value);
                    break;
                }
            }
        }
    });
    std::thread::spawn(move || {
        let result = receiver.recv_timeout(Duration::from_secs(60));
        if let Ok(mut backend) = shared.lock() {
            match result {
                Ok(value) if value["ready"] == true => {
                    let address = value["address"].as_str().unwrap_or("");
                    if address.starts_with("http://127.0.0.1:") {
                        backend.address = Some(address.to_owned());
                    } else {
                        backend.error = Some("Backend reported an invalid address".into());
                        backend.stop();
                    }
                }
                _ => {
                    backend.error = Some("Backend startup failed. Check your database connection and apply pending migrations, then restart.".into());
                    backend.stop();
                }
            }
        }
    });
    Ok(())
}

pub fn run() {
    let shared = Arc::new(Mutex::new(Backend {
        child: None,
        address: None,
        token: uuid::Uuid::new_v4().to_string(),
        error: None,
        config_path: PathBuf::new(),
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
            if let Err(error) = start_backend(app.handle(), shared.clone()) {
                if let Ok(mut backend) = shared.lock() {
                    backend.error = Some(format!("Unable to start the packaged backend: {error}"));
                }
            }
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
