use crate::adb::transfer;
use crate::models::TransferResult;

/// Downloads files from the device to a local directory.
/// Emits `transfer-progress` and `transfer-complete` events to the frontend.
#[tauri::command]
pub async fn download_files(
    serial: String,
    remote_paths: Vec<String>,
    local_destination: String,
    conflict_handling: Option<String>,
    destination_name: Option<String>,
    app_handle: tauri::AppHandle,
) -> Result<TransferResult, String> {
    if remote_paths.is_empty() {
        return Err("No files selected for download".to_string());
    }

    let handling = conflict_handling.unwrap_or_else(|| "keep-both".to_string());
    transfer::download_files_to(
        &serial,
        remote_paths,
        &local_destination,
        &handling,
        destination_name.as_deref(),
        app_handle,
    )
    .await
}

/// Returns names of files that would collide in the destination folder.
#[tauri::command]
pub fn check_download_conflicts(
    remote_paths: Vec<String>,
    local_destination: String,
) -> Result<Vec<String>, String> {
    Ok(transfer::check_download_conflicts(
        &remote_paths,
        &local_destination,
    ))
}

/// Cancels an active file transfer.
#[tauri::command]
pub async fn cancel_transfer(transfer_id: String) -> Result<(), String> {
    transfer::cancel_transfer(&transfer_id).await
}

#[tauri::command]
pub async fn cancel_all_transfers() -> Result<(), String> {
    transfer::cancel_all_transfers().await
}

/// Returns the default download location (~/Downloads).
#[tauri::command]
pub async fn get_download_location() -> Result<String, String> {
    Ok(transfer::get_default_download_location())
}

/// Sets and validates a custom download location.
#[tauri::command]
pub async fn set_download_location(path: String) -> Result<String, String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        std::fs::create_dir_all(p).map_err(|e| format!("Cannot create directory: {}", e))?;
    }
    if !p.is_dir() {
        return Err("Path is not a directory".to_string());
    }
    Ok(path)
}

/// Previews a file by downloading it to a temporary directory and opening it.
#[tauri::command]
pub async fn preview_file(
    serial: String,
    remote_path: String,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    preview_core(
        &serial,
        remote_path,
        &std::env::temp_dir().join("Pico_Preview"),
        crate::adb::runtime::Events::app(app_handle),
        open_native_preview,
    )
    .await
}

fn open_native_preview(path: &std::path::Path) -> Result<(), String> {
    use tokio::process::Command;
    #[cfg(target_os = "macos")]
    Command::new("open")
        .arg(path)
        .spawn()
        .map_err(|e| e.to_string())?;
    #[cfg(target_os = "windows")]
    Command::new("cmd")
        .args(["/C", "start", "", &path.to_string_lossy()])
        .spawn()
        .map_err(|e| e.to_string())?;
    #[cfg(target_os = "linux")]
    Command::new("xdg-open")
        .arg(path)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub(crate) async fn preview_core(
    serial: &str,
    remote_path: String,
    preview_root: &std::path::Path,
    events: crate::adb::runtime::Events,
    opener: impl FnOnce(&std::path::Path) -> Result<(), String>,
) -> Result<(), String> {
    let file_name = std::path::Path::new(&remote_path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .ok_or("Invalid path")?;
    // Per-request folders remain alive while the native viewer uses them.
    let temp_dir = preview_root.join(uuid::Uuid::new_v4().to_string());
    std::fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;
    let local_path = temp_dir.join(&file_name);
    let result =
        transfer::download_preview(serial, remote_path, &temp_dir.to_string_lossy(), events).await;
    if result.as_ref().is_ok_and(|r| r.completed == 1) {
        opener(&local_path)
    } else {
        let _ = std::fs::remove_dir_all(&temp_dir);
        result
            .map(|_| ())
            .and(Err("Preview download failed or was cancelled".into()))
    }
}

/// Native macOS file promises download only after the receiving app accepts.
#[tauri::command]
pub async fn start_file_drag(
    serial: String,
    entries: Vec<crate::models::FileEntry>,
    window: tauri::WebviewWindow,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        crate::native_drag::start(window, app_handle, serial, entries).await
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (serial, entries, window, app_handle);
        Err("Dragging to another app currently requires macOS".into())
    }
}

#[tauri::command]
pub async fn upload_files(
    serial: String,
    local_paths: Vec<String>,
    remote_destination: String,
    conflict_handling: Option<String>,
    app_handle: tauri::AppHandle,
) -> Result<TransferResult, String> {
    crate::adb::upload::upload_files(
        &serial,
        local_paths,
        &remote_destination,
        conflict_handling.as_deref().unwrap_or("keep-both"),
        app_handle,
    )
    .await
}

#[tauri::command]
pub async fn check_upload_conflicts(
    serial: String,
    local_paths: Vec<String>,
    remote_destination: String,
) -> Result<Vec<String>, String> {
    crate::adb::upload::check_conflicts(&serial, &local_paths, &remote_destination).await
}
