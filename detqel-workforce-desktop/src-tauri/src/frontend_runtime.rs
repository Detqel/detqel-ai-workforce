use crate::{
    constants::{
        desktop_constants::{
            CREATE_NO_WINDOW, DEVELOPMENT_BINARY_DIRECTORY, FRONTEND_TIMEOUT_SECONDS,
            NODE_BINARY_NAME,
        },
        frontend_constants::{
            FRONTEND_POLL_INTERVAL_MS, FRONTEND_REQUEST_TIMEOUT_SECONDS,
            FRONTEND_SOURCE_DIRECTORY, NEXT_CLI_PATH,
        },
        network_constants::{LOCAL_HTTP_SCHEME, LOOPBACK_HOST},
    },
    desktop_logs::{read_diagnostic_lines, DesktopLogs},
};
use std::{
    io::BufReader,
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::{atomic::{AtomicBool, Ordering}, Arc, Mutex},
    time::{Duration, Instant},
};
use tauri::Manager;

#[derive(Default)]
pub struct FrontendRuntime {
    child: Mutex<Option<Child>>,
    stopped: AtomicBool,
}

impl FrontendRuntime {
    pub fn stop(&self) {
        self.stopped.store(true, Ordering::Release);
        let Ok(mut state) = self.child.lock() else { return; };
        let Some(mut child) = state.take() else { return; };
        if matches!(child.try_wait(), Ok(Some(_))) { return; }
        // Next.js owns a worker process; terminate this owned process tree on exit.
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            let _ = Command::new("taskkill")
                .args(["/PID", &child.id().to_string(), "/T", "/F"])
                .creation_flags(CREATE_NO_WINDOW)
                .stdout(Stdio::null()).stderr(Stdio::null()).status();
        }
        #[cfg(unix)]
        {
            let _ = Command::new("kill").args(["-TERM", "--", &format!("-{}", child.id())])
                .stdout(Stdio::null()).stderr(Stdio::null()).status();
        }
        let _ = child.kill();
        let _ = child.wait();
    }

    pub fn exit_status(&self) -> Result<Option<String>, String> {
        let mut state = self.child.lock().map_err(|_| "Frontend process state unavailable")?;
        match state.as_mut() {
            Some(child) => child.try_wait().map(|status| status.map(|value| value.to_string()))
                .map_err(|error| error.to_string()),
            None => Ok(None),
        }
    }
}

impl Drop for FrontendRuntime {
    fn drop(&mut self) { self.stop(); }
}

pub async fn start(app: &tauri::AppHandle, logs: Arc<DesktopLogs>) -> Result<(), String> {
    if !tauri::is_dev() {
        logs.frontend("info", "Loading the bundled frontend assets.");
        return Ok(());
    }
    let url = app.config().build.dev_url.clone().ok_or("Frontend development URL is missing")?;
    if url.scheme() != LOCAL_HTTP_SCHEME || url.host_str() != Some(LOOPBACK_HOST) || url.port().is_none() {
        return Err("The frontend development URL must use an explicit loopback HTTP port".into());
    }
    // Refuse to attach to an unrelated or manually started frontend process.
    let address = format!("{}:{}", url.host_str().ok_or("Frontend host is missing")?, url.port().ok_or("Frontend port is missing")?);
    let reservation = std::net::TcpListener::bind(&address)
        .map_err(|_| format!("The configured frontend port is occupied ({address}). Stop the conflicting process and restart."))?;
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let node = manifest.join(DEVELOPMENT_BINARY_DIRECTORY).join(format!("{NODE_BINARY_NAME}-{}{}", env!("DETQEL_TARGET"), std::env::consts::EXE_SUFFIX));
    let mut command = Command::new(node);
    command.arg(manifest.join(NEXT_CLI_PATH))
        .args(["dev", "--hostname", url.host_str().ok_or("Frontend host is missing")?, "--port", &url.port().ok_or("Frontend port is missing")?.to_string()])
        .current_dir(manifest.join(FRONTEND_SOURCE_DIRECTORY))
        .env_remove("NODE_OPTIONS").env_remove("NODE_PATH")
        .env("NODE_ENV", "development").env("NEXT_TELEMETRY_DISABLED", "1")
        .stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    let runtime = app.state::<FrontendRuntime>();
    let (stdout, stderr) = {
        let mut state = runtime.child.lock().map_err(|_| "Frontend process state unavailable")?;
        if runtime.stopped.load(Ordering::Acquire) {
            return Err("Frontend startup was cancelled.".into());
        }
        drop(reservation);
        let mut child = command.spawn().map_err(|error| error.to_string())?;
        let stdout = child.stdout.take().ok_or("Frontend stdout is unavailable")?;
        let stderr = child.stderr.take().ok_or("Frontend stderr is unavailable")?;
        *state = Some(child);
        (stdout, stderr)
    };
    logs.frontend("info", "Starting the managed Next.js development process.");
    let output_logs = logs.clone();
    std::thread::spawn(move || {
        if let Err(error) = read_diagnostic_lines(BufReader::new(stdout), |line| output_logs.frontend("info", line)) {
            output_logs.frontend("error", &error.to_string());
        }
    });
    let error_logs = logs.clone();
    std::thread::spawn(move || {
        if let Err(error) = read_diagnostic_lines(BufReader::new(stderr), |line| error_logs.frontend("error", line)) {
            error_logs.frontend("error", &error.to_string());
        }
    });
    let deadline = Instant::now() + Duration::from_secs(FRONTEND_TIMEOUT_SECONDS);
    let client = app.state::<reqwest::Client>().inner().clone();
    while Instant::now() < deadline {
        if runtime.stopped.load(Ordering::Acquire) {
            return Err("Frontend startup was cancelled.".into());
        }
        if let Some(status) = runtime.exit_status()? {
            return Err(format!("The frontend process stopped ({status}). See the frontend logs."));
        }
        match client.get(url.clone()).timeout(Duration::from_secs(FRONTEND_REQUEST_TIMEOUT_SECONDS)).send().await {
            Ok(response) if response.status().is_success() => return Ok(()),
            Ok(response) if response.status().is_server_error() => {
                logs.frontend("error", &format!("Frontend compilation failed (HTTP {}). See the preceding Next.js output.", response.status()));
                return Err("Frontend compilation failed. See the frontend logs.".into());
            }
            _ => {}
        }
        wait_for_next_poll().await;
    }
    Err("The frontend development process did not become ready before its startup deadline.".into())
}

async fn wait_for_next_poll() {
    // Use Tauri's blocking pool without adding a second async runtime dependency.
    let _ = tauri::async_runtime::spawn_blocking(|| std::thread::sleep(Duration::from_millis(FRONTEND_POLL_INTERVAL_MS))).await;
}
