fn main() {
    println!(
        "cargo:rustc-env=DETQEL_TARGET={}",
        std::env::var("TARGET").unwrap()
    );
    tauri_build::build()
}
