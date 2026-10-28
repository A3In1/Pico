use crate::adb;
use crate::models::FileEntry;
use regex::Regex;
use std::sync::LazyLock;

/// Compiled regex for parsing `ls -la` output.
/// Format: drwxrwx--x  2 root sdcard_rw 4096 2024-03-01 10:30 Camera
/// or:     -rw-rw----  1 root sdcard_rw 4194304 2024-03-01 10:30 IMG_001.jpg
static LS_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"^([d\-l])([rwxsStT\-]{9})\s+\d+\s+\S+\s+\S+\s+(\d+)\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\s+(.+)$"
    ).unwrap()
});

/// Determines file type category from file extension.
fn classify_file_type(name: &str, is_dir: bool) -> String {
    if is_dir {
        return "folder".to_string();
    }

    let lower = name.to_lowercase();
    let ext = lower.rsplit('.').next().unwrap_or("");

    match ext {
        "jpg" | "jpeg" | "png" | "gif" | "webp" | "bmp" | "heic" | "heif" | "svg" | "raw"
        | "cr2" | "nef" | "dng" => "image",
        "mp4" | "mkv" | "avi" | "mov" | "webm" | "flv" | "wmv" | "3gp" | "m4v" => "video",
        "mp3" | "wav" | "flac" | "aac" | "ogg" | "wma" | "m4a" | "opus" => "audio",
        "pdf" | "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" | "txt" | "csv" | "rtf"
        | "odt" | "ods" => "document",
        "zip" | "rar" | "7z" | "tar" | "gz" | "bz2" | "xz" | "zst" => "archive",
        "apk" | "xapk" | "aab" => "apk",
        _ => "other",
    }
    .to_string()
}

/// Returns a human-readable type label for display.
pub fn file_type_label(file_type: &str) -> String {
    match file_type {
        "folder" => "Folder",
        "image" => "Image",
        "video" => "Video",
        "audio" => "Audio",
        "document" => "Document",
        "archive" => "Archive",
        "apk" => "APK",
        "other" => "File",
        _ => "File",
    }
    .to_string()
}

/// Normalizes a path: removes double slashes, trailing slashes (except root).
fn normalize_path(path: &str) -> String {
    let mut result: String = path
        .split('/')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("/");

    if !result.starts_with('/') {
        result = format!("/{}", result);
    }

    result
}

/// Parses `ls -la` output into a Vec<FileEntry>.
/// Filters out `.` and `..` entries.
pub fn parse_ls_output(output: &str, parent_path: &str) -> Vec<FileEntry> {
    let mut entries = Vec::new();
    let clean_parent = parent_path.trim_end_matches('/');

    for line in output.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with("total") {
            continue;
        }

        if let Some(caps) = LS_REGEX.captures(line) {
            let file_type_char = &caps[1];
            let size: u64 = caps[3].parse().unwrap_or(0);
            let modified = caps[4].to_string();
            let name = caps[5].to_string();

            // Skip . and ..
            if name == "." || name == ".." {
                continue;
            }

            // Handle symlinks: "name -> target"
            let display_name = if file_type_char == "l" {
                name.split(" -> ")
                    .next()
                    .unwrap_or(&name)
                    .trim()
                    .to_string()
            } else {
                name.clone()
            };

            // Skip if display_name is empty or is the parent dir itself
            if display_name.is_empty() {
                continue;
            }

            // Determine if this is a directory
            // For symlinks, we'll treat them as dirs (most Android symlinks point to dirs)
            let is_dir = file_type_char == "d" || file_type_char == "l";
            let ft = classify_file_type(&display_name, is_dir);

            // Build the full path — use only the basename, never a full path from display_name
            let basename = display_name.rsplit('/').next().unwrap_or(&display_name);
            let path = normalize_path(&format!("{}/{}", clean_parent, basename));

            entries.push(FileEntry {
                name: basename.to_string(),
                path,
                is_directory: is_dir,
                size: if is_dir { 0 } else { size },
                modified: Some(modified),
                file_type: ft,
            });
        }
    }

    // Sort: directories first, then alphabetical by name (case-insensitive)
    entries.sort_by(|a, b| {
        b.is_directory
            .cmp(&a.is_directory)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    entries
}

/// Lists directory contents on the device.
pub async fn list_directory(serial: &str, path: &str) -> Result<Vec<FileEntry>, String> {
    // Normalize path to prevent double slashes
    let clean_path = normalize_path(path);

    let (code, stdout, stderr) = adb::run_adb_for_device(
        serial,
        // Append trailing slash to force listing directory contents for symlinks (like /sdcard)
        &[
            "shell",
            &format!(
                "ls -la -- {}",
                adb::quote_shell_arg(&format!("{}/", clean_path))?
            ),
        ],
    )
    .await?;

    if code != 0 {
        if stderr.contains("Permission denied") {
            return Err(format!("Permission denied: {}", clean_path));
        }
        if stderr.contains("No such file") || stderr.contains("not found") {
            return Err(format!("Path not found: {}", clean_path));
        }
        return Err(format!("Failed to list directory: {}", stderr.trim()));
    }

    Ok(parse_ls_output(&stdout, &clean_path))
}

/// Checks if a path exists on the device.
pub async fn check_path_exists(serial: &str, path: &str) -> Result<bool, String> {
    let clean_path = normalize_path(path);
    let (code, stdout, _) = adb::run_adb_for_device(
        serial,
        &[
            "shell",
            &format!(
                "[ -e {} ] && echo 1 || echo 0",
                adb::quote_shell_arg(&clean_path)?
            ),
        ],
    )
    .await?;

    if code != 0 {
        return Ok(false);
    }

    Ok(stdout.trim() == "1")
}

/// Retrieves the sizes of all files/folders inside a directory.
/// Emits live updates to the frontend via `folder-size-update` event.
pub async fn get_folder_sizes(
    window: &tauri::Window,
    serial: &str,
    path: &str,
) -> Result<(), String> {
    folder_sizes_core(super::runtime::Events::window(window), serial, path).await
}

pub(crate) async fn folder_sizes_core(
    events: super::runtime::Events,
    serial: &str,
    path: &str,
) -> Result<(), String> {
    use std::process::Stdio;
    use tokio::io::AsyncBufReadExt;

    let clean_path = normalize_path(path);
    let adb_path = adb::get_adb_path().ok_or("ADB binary not found")?;

    // cd into the dir and run `du -sk *`. Ignore errors for unreadable files.
    let cmd = format!(
        "cd {} && du -sk -- * 2>/dev/null",
        adb::quote_shell_arg(&clean_path)?
    );

    let mut command = tokio::process::Command::new(&adb_path);
    super::runtime::configure(&mut command);
    let mut child = command
        .args(["-s", serial, "shell", &cmd])
        .stdout(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;

    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let mut reader = tokio::io::BufReader::new(stdout).lines();

    while let Ok(Some(line)) = reader.next_line().await {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        if let Some((kb_str, name)) = line.split_once(|c: char| c.is_whitespace()) {
            if let Ok(kb) = kb_str.parse::<u64>() {
                events.emit(
                    "folder-size-update",
                    serde_json::json!({
                        "serial": serial,
                        "parent_path": clean_path,
                        "name": name.trim_start(),
                        "size": kb * 1024
                    }),
                );
            }
        }
    }

    Ok(())
}

#[cfg(test)]
#[path = "../../tests/unit/filesystem.rs"]
mod tests;
