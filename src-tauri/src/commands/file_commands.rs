use crate::adb::parser;
use crate::adb::{self, filesystem};
use crate::models::{FileEntry, StorageStats};

/// Lists directory contents on the connected device.
/// Returns sorted entries: folders first, then files alphabetically.
#[tauri::command]
pub async fn list_directory(serial: String, path: String) -> Result<Vec<FileEntry>, String> {
    filesystem::list_directory(&serial, &path).await
}

/// Checks if a path exists on the device.
/// Used by sidebar to show/hide quick access items.
#[tauri::command]
pub async fn check_path_exists(serial: String, path: String) -> Result<bool, String> {
    filesystem::check_path_exists(&serial, &path).await
}

/// Retrieves the sizes of all folders inside a directory.
#[tauri::command]
pub async fn get_folder_sizes(
    window: tauri::Window,
    serial: String,
    path: String,
) -> Result<(), String> {
    filesystem::get_folder_sizes(&window, &serial, &path).await
}

/// Gets storage stats for internal storage (and SD card if present).
#[tauri::command]
pub async fn get_storage_stats(
    serial: String,
    sd_card_path: Option<String>,
) -> Result<StorageStats, String> {
    let (_, internal_out, _) =
        adb::run_adb_for_device(&serial, &["shell", "df", "/storage/emulated"]).await?;

    let (internal_used, internal_total) = parser::parse_df_output(&internal_out).unwrap_or((0, 0));

    let (sd_used, sd_total) = if let Some(ref sd_path) = sd_card_path {
        let (_, sd_out, _) = adb::run_adb_for_device(
            &serial,
            &[
                "shell",
                &format!("df -- {}", adb::quote_shell_arg(sd_path)?),
            ],
        )
        .await?;
        let stats = parser::parse_df_output(&sd_out);
        (stats.map(|(u, _)| u), stats.map(|(_, t)| t))
    } else {
        (None, None)
    };

    Ok(StorageStats {
        internal_used,
        internal_total,
        sd_used,
        sd_total,
    })
}

/// Checks which quick access paths exist on the device.
/// Returns a list of paths that exist (for sidebar).
#[tauri::command]
pub async fn get_quick_access_paths(serial: String) -> Result<Vec<(String, String)>, String> {
    let paths = vec![
        ("DCIM", "/sdcard/DCIM"),
        ("Downloads", "/sdcard/Download"),
        ("Pictures", "/sdcard/Pictures"),
        ("Music", "/sdcard/Music"),
        ("Documents", "/sdcard/Documents"),
        ("Movies", "/sdcard/Movies"),
    ];

    let mut existing = Vec::new();

    for (label, path) in paths {
        if let Ok(true) = filesystem::check_path_exists(&serial, path).await {
            existing.push((label.to_string(), path.to_string()));
        }
    }

    Ok(existing)
}
