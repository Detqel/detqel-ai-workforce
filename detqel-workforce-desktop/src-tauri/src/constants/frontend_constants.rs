pub const NEXT_CLI_PATH: &str = "../node_modules/next/dist/bin/next";
pub const FRONTEND_SOURCE_DIRECTORY: &str = "../frontend";
pub const FRONTEND_REQUEST_TIMEOUT_SECONDS: u64 = 5;
pub const FRONTEND_POLL_INTERVAL_MS: u64 = 500;
pub const FRONTEND_RUNTIME_FAILURE: &str = "The frontend could not start. See the frontend logs.";
pub const STARTUP_ASSET_CSP: &str = "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src ipc: http://ipc.localhost; object-src 'none'; base-uri 'none'; frame-src 'none'";

pub const FRONTEND_DIAGNOSTICS_SCRIPT: &str = r#"
(() => {
  const serialize = value => {
    if (value instanceof Error) return value.stack || value.message;
    if (value === null) return 'null';
    if (['string', 'number', 'boolean', 'undefined', 'bigint'].includes(typeof value)) return String(value);
    return `[${typeof value} omitted]`;
  };
  const report = (level, values) => {
    const invoke = window.__TAURI__?.core?.invoke;
    if (invoke) void invoke('frontend_log', { level, message: values.map(serialize).join(' ') }).catch(() => {});
  };
  window.addEventListener('error', event => {
    report('error', [event.error || `${event.message} (${event.filename}:${event.lineno}:${event.colno})`]);
  });
  window.addEventListener('unhandledrejection', event => report('error', ['Unhandled promise rejection:', event.reason]));
  for (const level of ['error', 'warn']) {
    const original = console[level].bind(console);
    console[level] = (...values) => { report(level, values); original(...values); };
  }
})();
"#;
