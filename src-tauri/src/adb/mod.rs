pub mod connection;
mod download_destination;
pub mod filesystem;
pub mod parser;
pub(crate) mod progress;
pub(crate) mod runtime;
pub mod transfer;
pub mod upload;
pub mod wireless;

use std::path::PathBuf;
use std::process::Stdio;
use tokio::process::Command;

/// Quotes one literal argument for the Android POSIX shell. ADB shell arguments
/// are interpreted remotely even when the local process uses an argument array.
pub fn quote_shell_arg(value: &str) -> Result<String, String> {
    if value.contains('\0') {
        return Err("Paths must not contain NUL characters".to_string());
    }
    Ok(format!("'{}'", value.replace('\'', "'\"'\"'")))
}

/// Ensures a file is executable (macOS/Linux).
/// This fixes the common issue where the bundled ADB binary loses +x
/// after git clone or file copy.
#[cfg(unix)]
fn ensure_executable(path: &std::path::Path) {
    use std::os::unix::fs::PermissionsExt;
    if let Ok(meta) = std::fs::metadata(path) {
        let mut perms = meta.permissions();
        let mode = perms.mode();
        if mode & 0o111 == 0 {
            // No execute bits set — add owner+group+other execute
            perms.set_mode(mode | 0o755);
            let _ = std::fs::set_permissions(path, perms);
        }
    }
}

#[cfg(not(unix))]
fn ensure_executable(_path: &std::path::Path) {}

/// Locates the bundled ADB binary.
/// In dev mode: looks in src-tauri/resources/adb
/// In production: looks in the app bundle's Resources directory
/// Falls back to system PATH, Homebrew, and Android SDK paths.
pub fn get_adb_path() -> Option<PathBuf> {
    if let Some(path) = runtime::executable() {
        return Some(path);
    }
    // Try development path first (relative to the binary or CWD)
    let dev_paths = [
        // When running with `cargo tauri dev` from project root
        PathBuf::from("src-tauri/resources/adb"),
        // When running with `cargo run` inside `src-tauri`
        PathBuf::from("resources/adb"),
        // Fallback: relative to the executable
        std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|pp| pp.join("resources/adb")))
            .unwrap_or_default(),
        // macOS app bundle: Contents/Resources/adb
        std::env::current_exe()
            .ok()
            .and_then(|p| {
                p.parent() // MacOS/
                    .and_then(|p| p.parent()) // Contents/
                    .map(|p| p.join("Resources/adb"))
            })
            .unwrap_or_default(),
    ];

    for path in &dev_paths {
        if path.exists() && path.is_file() {
            ensure_executable(path);
            return Some(path.clone());
        }
    }

    // Fallback: try system PATH (if user has adb installed globally)
    if let Ok(output) = std::process::Command::new("which").arg("adb").output() {
        if output.status.success() {
            let path_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path_str.is_empty() {
                let path = PathBuf::from(&path_str);
                if path.exists() {
                    return Some(path);
                }
            }
        }
    }

    // Additional well-known macOS paths
    let extra_paths = [
        PathBuf::from("/opt/homebrew/bin/adb"),
        PathBuf::from("/usr/local/bin/adb"),
        // Android SDK default location
        dirs::home_dir()
            .map(|h| h.join("Library/Android/sdk/platform-tools/adb"))
            .unwrap_or_default(),
    ];

    for path in &extra_paths {
        if path.exists() && path.is_file() {
            return Some(path.clone());
        }
    }

    None
}

/// Runs an ADB command asynchronously and returns (exit_code, stdout, stderr)
pub async fn run_adb(args: &[&str]) -> Result<(i32, String, String), String> {
    let adb_path = get_adb_path().ok_or_else(|| "ADB binary not found".to_string())?;

    let mut command = Command::new(&adb_path);
    runtime::configure(&mut command);
    let output = command
        .kill_on_drop(true)
        .env("ADB_MDNS_OPENSCREEN", "1")
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Failed to execute ADB: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let code = output.status.code().unwrap_or(-1);

    Ok((code, stdout, stderr))
}

/// Runs an ADB command targeting a specific device serial
pub async fn run_adb_for_device(
    serial: &str,
    args: &[&str],
) -> Result<(i32, String, String), String> {
    let mut full_args: Vec<&str> = vec!["-s", serial];
    full_args.extend_from_slice(args);
    run_adb(&full_args).await
}

#[cfg(all(test, unix))]
#[path = "../../tests/backend/mod.rs"]
mod tests;
