use crate::adb::connection;
use crate::models::{DeviceDetails, DeviceInfo};

/// Returns all connected devices (USB and Wi-Fi).
/// Called by the frontend every 2 seconds for device polling.
#[tauri::command]
pub async fn get_connected_devices() -> Result<Vec<DeviceInfo>, String> {
    connection::list_connected_devices().await
}

/// Fetches full details for a specific device by serial.
#[tauri::command]
pub async fn get_device_details(serial: String) -> Result<DeviceDetails, String> {
    connection::get_device_details(&serial).await
}

/// Checks if ADB is available and working.
#[tauri::command]
pub async fn check_adb_status() -> Result<String, String> {
    crate::adb::get_adb_path().ok_or_else(|| {
        "ADB binary not found. Please ensure the app is properly installed.".to_string()
    })?;

    let (code, stdout, _) = crate::adb::run_adb(&["version"]).await?;
    if code != 0 {
        return Err("ADB binary found but failed to execute.".to_string());
    }

    // Extract version line
    let version = stdout
        .lines()
        .next()
        .unwrap_or("Unknown version")
        .to_string();
    Ok(version)
}

#[tauri::command]
pub fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}
