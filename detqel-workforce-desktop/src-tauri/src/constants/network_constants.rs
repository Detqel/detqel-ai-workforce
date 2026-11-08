pub const LOOPBACK_HOST: &str = "127.0.0.1";
pub const LOCAL_HTTP_SCHEME: &str = "http";
pub const PRIVATE_PORT_MINIMUM: u16 = 50_000;
pub const PRIVATE_PORT_MAXIMUM: u16 = 59_999;
/// Largest request body the webview may send through the API bridge.
pub const API_BODY_LIMIT_BYTES: usize = 1_048_576;
/// A streamed response (a whole discussion turn) may run far longer than an ordinary request.
pub const API_STREAM_TIMEOUT_SECONDS: u64 = 900;
/// Largest piece of a streamed response held while waiting for the end of its line.
pub const API_STREAM_LINE_LIMIT_BYTES: usize = 4 * 1_048_576;
/// Streams open at once; more would only come from a misbehaving page.
pub const API_STREAM_MAX_CONCURRENT: usize = 4;
