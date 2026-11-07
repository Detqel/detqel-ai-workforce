pub const APPLICATION_NAME: &str = "DETQEL Kin";
pub const MAIN_WINDOW: &str = "main";
pub const STARTUP_WINDOW: &str = "startup";
pub const STARTUP_PAGE: &str = "desktop-startup.html";
pub const STARTUP_ASSET_SCHEME: &str = "detqel-startup";
pub const STARTUP_ASSET_HOST: &str = "localhost";
pub const STARTUP_READY_COMMAND: &str = "startup_ready";
pub const BACKEND_STATUS_COMMAND: &str = "backend_status";
pub const FRONTEND_STEP: &str = "frontend-startup";
pub const BACKEND_RUNTIME_STEP: &str = "backend-startup";
pub const BACKEND_API_STEP: &str = "backend-api";
pub const DESKTOP_LOG_DIRECTORY_ENV: &str = "DETQEL_LOG_DIR";
pub const DEVELOPMENT_LOG_DIRECTORY: &str = "logs";
pub const NODE_BINARY_NAME: &str = "detqel-node";
pub const DEVELOPMENT_BINARY_DIRECTORY: &str = "binaries";
pub const CREATE_NO_WINDOW: u32 = 0x08000000;
/// Label every managed container carries (see backend/infrastructure/compose.yaml). Shutdown stops only
/// containers with this label so unrelated containers are never touched.
pub const DOCKER_OWNERSHIP_LABEL: &str = "com.detqel.desktop.runtime";
pub const DOCKER_STOP_TIMEOUT_SECONDS: &str = "5";
/// Environment override forcing a specific container runtime executable during shutdown.
pub const CONTAINER_RUNTIME_ENV: &str = "CONTAINER_RUNTIME";
/// Runtime executables probed in order when stopping owned containers. Rancher Desktop ships nerdctl.
pub const CONTAINER_RUNTIME_EXECUTABLES: &[&str] = &["docker", "podman", "nerdctl"];
pub const FRONTEND_TIMEOUT_SECONDS: u64 = 180;
pub const STARTUP_POLL_INTERVAL_MS: u64 = 1_000;
pub const STARTUP_READY_TIMEOUT_SECONDS: u64 = 30;
pub const STARTUP_WINDOW_WIDTH: f64 = 760.0;
pub const STARTUP_WINDOW_HEIGHT: f64 = 450.0;
pub const STARTUP_WINDOW_MINIMUM_WIDTH: f64 = 680.0;
pub const STARTUP_WINDOW_MINIMUM_HEIGHT: f64 = 400.0;
pub const THEME_STORAGE_KEY: &str = "detqel_theme";
pub const LOGO_LIGHT: &str = "/images/detqel-kin-logo.png";
pub const LOGO_DARK: &str = "/images/detqel-kin-logo-dark.png";
pub const NAME_LOGO_LIGHT: &str = "/images/detqel-kin-name-logo.png";
pub const NAME_LOGO_DARK: &str = "/images/detqel-kin-name-logo-dark.png";
pub const STARTUP_STEPS: &[(&str, &str)] = &[
    (FRONTEND_STEP, "Frontend startup"),
    (BACKEND_RUNTIME_STEP, "Backend startup"),
    ("docker", "Container runtime"),
    ("litellm-database", "LiteLLM database"),
    ("milvus", "Milvus vector store"),
    ("litellm", "LiteLLM gateway"),
    ("ollama", "Ollama embeddings"),
    ("application-database", "Application database"),
    (BACKEND_API_STEP, "Backend API"),
];
