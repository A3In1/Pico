use super::runtime::{self, Events, Jobs};
use crate::adb;
use crate::adb::download_destination::StagedDownload;
use crate::models::{TransferContext, TransferProgress, TransferResult, TransferStatus};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;
use tokio::process::Command;

pub(crate) struct BatchGuard {
    id: String,
    cancelled: Arc<AtomicBool>,
    jobs: Arc<Jobs>,
}

impl BatchGuard {
    pub(crate) fn new() -> Self {
        let id = uuid::Uuid::new_v4().to_string();
        let cancelled = Arc::new(AtomicBool::new(false));
        let jobs = runtime::jobs();
        jobs.batches
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(id.clone(), cancelled.clone());
        Self {
            id,
            cancelled,
            jobs,
        }
    }

    pub(super) fn id(&self) -> &str {
        &self.id
    }

    pub(crate) fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }
}

impl Drop for BatchGuard {
    fn drop(&mut self) {
        self.jobs
            .batches
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(&self.id);
    }
}

fn emit_cancelled(context: &TransferContext, events: &Events, id: &str, name: &str, path: &str) {
    events.progress(TransferProgress {
        direction: "download".into(),
        context: context.clone(),
        transfer_id: id.to_string(),
        file_name: name.to_string(),
        file_path: path.to_string(),
        bytes_transferred: 0,
        total_bytes: 0,
        percentage: 0,
        progress_known: false,
        total_known: false,
        bytes_estimated: false,
        speed_bytes_per_sec: 0,
        eta_seconds: None,
        status: TransferStatus::Cancelled,
        error: Some("Transfer cancelled".to_string()),
    });
}

/// Downloads files from the device using `adb pull -a`.
/// Emits progress events to the frontend via the Tauri app handle.
///
/// Strategy:
/// - Each file/folder gets its own `adb pull -a` command
/// - Progress is parsed from both output streams in real-time
/// - Events batched every 200ms to avoid overwhelming the UI
pub async fn download_files(
    serial: &str,
    remote_paths: Vec<String>,
    local_destination: &str,
    conflict_handling: &str,
    app_handle: tauri::AppHandle,
) -> Result<TransferResult, String> {
    download_files_to(
        serial,
        remote_paths,
        local_destination,
        conflict_handling,
        None,
        app_handle,
    )
    .await
}

/// A file promise supplies the exact receiver-selected filename, which may differ
/// from the name on the phone. Only that one destination may be replaced.
pub(crate) async fn download_files_to(
    serial: &str,
    remote_paths: Vec<String>,
    local_destination: &str,
    conflict_handling: &str,
    promised_name: Option<&str>,
    app_handle: tauri::AppHandle,
) -> Result<TransferResult, String> {
    download_files_in_batch(
        serial,
        remote_paths,
        local_destination,
        conflict_handling,
        DownloadTarget {
            name: promised_name,
            preview: false,
        },
        app_handle,
        Arc::new(BatchGuard::new()),
    )
    .await
}

pub(crate) struct DownloadTarget<'a> {
    pub name: Option<&'a str>,
    pub preview: bool,
}

pub(crate) async fn download_preview(
    serial: &str,
    remote_path: String,
    destination: &str,
    events: Events,
) -> Result<TransferResult, String> {
    download_core(
        serial,
        vec![remote_path],
        destination,
        "replace",
        DownloadTarget {
            name: None,
            preview: true,
        },
        events,
        Arc::new(BatchGuard::new()),
    )
    .await
}

pub(crate) async fn download_files_in_batch(
    serial: &str,
    remote_paths: Vec<String>,
    local_destination: &str,
    conflict_handling: &str,
    target: DownloadTarget<'_>,
    app_handle: tauri::AppHandle,
    batch: Arc<BatchGuard>,
) -> Result<TransferResult, String> {
    download_core(
        serial,
        remote_paths,
        local_destination,
        conflict_handling,
        target,
        Events::app(app_handle),
        batch,
    )
    .await
}

pub(crate) async fn download_core(
    serial: &str,
    remote_paths: Vec<String>,
    local_destination: &str,
    conflict_handling: &str,
    target: DownloadTarget<'_>,
    events: Events,
    batch: Arc<BatchGuard>,
) -> Result<TransferResult, String> {
    let promised_name = target.name;
    if let Some(name) = promised_name {
        if Path::new(name).file_name().and_then(|n| n.to_str()) != Some(name) || name.contains('\0')
        {
            return Err("Invalid receiver destination filename".into());
        }
    }
    let context = TransferContext {
        preview: target.preview,
        batch_id: batch.id().into(),
        serial: serial.into(),
        destination: local_destination.into(),
        destination_name: promised_name.map(str::to_owned),
    };
    let adb_path = adb::get_adb_path().ok_or_else(|| "ADB binary not found".to_string())?;
    let start_time = Instant::now();
    let mut completed: u32 = 0;
    let mut failed: u32 = 0;
    let mut cancelled: u32 = 0;
    let mut total_bytes: u64 = 0;
    let total_files = remote_paths.len() as u32;

    // Ensure local destination exists
    std::fs::create_dir_all(local_destination).map_err(|e| {
        if is_disk_full_io(&e) {
            "Disk full on Mac — free up space and try again".to_string()
        } else {
            format!("Cannot create download folder: {}", e)
        }
    })?;

    let jobs: Vec<_> = remote_paths
        .iter()
        .map(|path| (uuid::Uuid::new_v4().to_string(), path))
        .collect();
    for (id, path) in &jobs {
        let event = super::progress::initial_event(&context, "download", id, path);
        events.progress(event);
    }
    for (transfer_id, remote_path) in jobs {
        let file_name = Path::new(remote_path)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| remote_path.clone());

        // Cancel All covers the remaining queue, not just the current child.
        if batch.is_cancelled() {
            cancelled += 1;
            emit_cancelled(&context, &events, &transfer_id, &file_name, remote_path);
            continue;
        }

        let desired_path = Path::new(local_destination)
            .join(promised_name.unwrap_or(&file_name))
            .to_string_lossy()
            .into_owned();

        let local_path = match resolve_destination(&desired_path, conflict_handling) {
            DestAction::Skip => {
                failed += 1;
                events.progress(TransferProgress {
                    direction: "download".into(),
                    context: context.clone(),
                    transfer_id: transfer_id.clone(),
                    file_name: file_name.clone(),
                    file_path: remote_path.clone(),
                    bytes_transferred: 0,
                    total_bytes: 0,
                    percentage: 0,
                    progress_known: false,
                    total_known: false,
                    bytes_estimated: false,
                    speed_bytes_per_sec: 0,
                    eta_seconds: None,
                    status: TransferStatus::Failed,
                    error: Some("Skipped — file already exists".to_string()),
                });
                continue;
            }
            DestAction::Path(p) => p,
        };

        let staged = match StagedDownload::new(Path::new(local_destination), &file_name) {
            Ok(staged) => staged,
            Err(error) => {
                failed += 1;
                super::progress::Reporter::new(
                    events.clone(),
                    super::progress::initial_event(&context, "download", &transfer_id, remote_path),
                )
                .finish(
                    TransferStatus::Failed,
                    Some(format!("Cannot stage download: {error}")),
                    None,
                );
                continue;
            }
        };

        let known_size = super::progress::remote_file_size(serial, remote_path).await;
        if batch.is_cancelled() {
            cancelled += 1;
            emit_cancelled(&context, &events, &transfer_id, &file_name, remote_path);
            continue;
        }
        let mut command = Command::new(&adb_path);
        command
            .args(["-s", serial, "pull", "-a", remote_path])
            .arg(&staged.payload);
        let (mut child, stdout, stderr) = match super::progress::spawn(command) {
            Ok(process) => process,
            Err(error) => {
                failed += 1;
                super::progress::Reporter::new(
                    events.clone(),
                    super::progress::initial_event(&context, "download", &transfer_id, remote_path),
                )
                .finish(TransferStatus::Failed, Some(error), None);
                continue;
            }
        };

        // Store child for potential cancellation — child stays in the map
        // until the process finishes or is cancelled
        {
            let mut active = batch.jobs.children.lock().await;
            // Cancellation sets the flag before taking this same lock. This
            // closes the race between starting a subprocess and registering it.
            if batch.is_cancelled() {
                drop(active);
                let _ = child.kill().await;
                cancelled += 1;
                emit_cancelled(&context, &events, &transfer_id, &file_name, remote_path);
                continue;
            }
            active.insert(transfer_id.clone(), child);
        }

        let event = TransferProgress {
            context: context.clone(),
            direction: "download".into(),
            transfer_id: transfer_id.clone(),
            file_name: file_name.clone(),
            file_path: remote_path.clone(),
            bytes_transferred: 0,
            total_bytes: known_size.unwrap_or(0),
            percentage: 0,
            progress_known: known_size.is_some(),
            total_known: known_size.is_some(),
            bytes_estimated: false,
            speed_bytes_per_sec: 0,
            eta_seconds: None,
            status: TransferStatus::InProgress,
            error: None,
        };
        events.progress(event.clone());
        let reporter = super::progress::Reporter::new(events.clone(), event);
        let out_task = tokio::spawn(super::progress::read_output(stdout, reporter.clone()));
        let err_reporter = reporter.clone();
        let err_task = tokio::spawn(async move {
            if let Some(stderr) = stderr {
                super::progress::read_output(stderr, err_reporter).await
            } else {
                String::new()
            }
        });
        let stop = Arc::new(AtomicBool::new(false));
        let done = Arc::new(tokio::sync::Notify::new());
        let monitor = tokio::spawn(reporter.clone().monitor_download(
            staged.payload.clone(),
            stop.clone(),
            done.clone(),
        ));
        // Keep the process cancellable independently of when output reaches EOF.
        let status = wait_for_transfer(&transfer_id, &batch.jobs).await;
        stop.store(true, Ordering::Relaxed);
        done.notify_one();
        let _ = monitor.await;
        let collected_stdout = out_task.await.unwrap_or_default();
        let collected_stderr = err_task.await.unwrap_or_default();
        let status = match status {
            Ok(Some(status)) => status,
            Err(error) => {
                failed += 1;
                reporter.finish(TransferStatus::Failed, Some(error), None);
                continue;
            }
            Ok(None) => {
                cancelled += 1;
                reporter.finish(
                    TransferStatus::Cancelled,
                    Some("Transfer cancelled".into()),
                    None,
                );
                continue;
            }
        };

        if batch.is_cancelled() {
            cancelled += 1;
            reporter.finish(
                TransferStatus::Cancelled,
                Some("Transfer cancelled".into()),
                None,
            );
            continue;
        }

        let publish_result = if status.success() {
            publish_download(&staged, &local_path, conflict_handling)
        } else {
            Err(classify_pull_error(
                &format!("{collected_stdout}{collected_stderr}"),
                &staged.payload.to_string_lossy(),
                status.code(),
            ))
        };

        if let Ok(ref published_path) = publish_result {
            completed += 1;
            // Try to get file size
            let size_path = std::path::PathBuf::from(published_path);
            let file_bytes = tokio::task::spawn_blocking(move || {
                super::progress::local_written_size(size_path, &AtomicBool::new(false))
            })
            .await
            .unwrap_or(0);
            total_bytes += file_bytes;

            reporter.finish(TransferStatus::Complete, None, Some(file_bytes));
        } else {
            failed += 1;
            reporter.finish(
                TransferStatus::Failed,
                Some(publish_result.unwrap_err()),
                None,
            );
        }
    }

    let elapsed = start_time.elapsed().as_secs_f64();

    let result = TransferResult {
        direction: "download".into(),
        total_files,
        completed,
        failed,
        cancelled,
        total_bytes,
        elapsed_seconds: elapsed,
        metadata_preserved: true, // We always use -a flag
    };

    // Emit completion event
    events.complete(result.clone());

    Ok(result)
}

/// Cancels a running transfer by killing the ADB process.
pub async fn cancel_transfer(transfer_id: &str) -> Result<(), String> {
    let jobs = runtime::jobs();
    let child = jobs.children.lock().await.remove(transfer_id);
    if let Some(mut child) = child {
        child
            .kill()
            .await
            .map_err(|e| format!("Failed to kill transfer: {}", e))?;
        Ok(())
    } else {
        Err("Transfer not found or already completed".to_string())
    }
}

/// Cancels every registered batch, including files that have not started yet.
pub async fn cancel_all_transfers() -> Result<(), String> {
    let jobs = runtime::jobs();
    let mut active = jobs.children.lock().await;
    {
        let batches = jobs.batches.lock().unwrap_or_else(|e| e.into_inner());
        for flag in batches.values() {
            flag.store(true, Ordering::SeqCst);
        }
    }
    let children: Vec<_> = active.drain().map(|(_, child)| child).collect();
    drop(active);
    let mut errors = Vec::new();
    for mut child in children {
        if let Err(error) = child.kill().await {
            errors.push(error.to_string());
        }
    }
    if errors.is_empty() {
        Ok(())
    } else {
        Err(format!(
            "Could not stop all transfer processes: {}",
            errors.join("; ")
        ))
    }
}

pub(super) async fn wait_for_transfer(
    id: &str,
    jobs: &Jobs,
) -> Result<Option<std::process::ExitStatus>, String> {
    loop {
        {
            let mut active = jobs.children.lock().await;
            let Some(child) = active.get_mut(id) else {
                return Ok(None);
            };
            match child.try_wait() {
                Ok(Some(status)) => {
                    active.remove(id);
                    return Ok(Some(status));
                }
                Ok(None) => {}
                Err(error) => {
                    active.remove(id);
                    return Err(format!("Failed to wait for ADB transfer: {}", error));
                }
            }
        }
        tokio::time::sleep(std::time::Duration::from_millis(20)).await;
    }
}

/// Returns the default download location (~/Downloads)
pub fn get_default_download_location() -> String {
    dirs::download_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| {
            dirs::home_dir()
                .map(|p| format!("{}/Downloads", p.to_string_lossy()))
                .unwrap_or_else(|| "/tmp".to_string())
        })
}

/// Returns dest file names that already exist under `local_destination`.
pub fn check_download_conflicts(remote_paths: &[String], local_destination: &str) -> Vec<String> {
    let dest = local_destination.trim_end_matches('/');
    remote_paths
        .iter()
        .filter_map(|remote| {
            let name = Path::new(remote)
                .file_name()
                .map(|n| n.to_string_lossy().to_string())?;
            let local = format!("{}/{}", dest, name);
            if path_exists(&local) {
                Some(name)
            } else {
                None
            }
        })
        .collect()
}

enum DestAction {
    Path(String),
    Skip,
}

fn path_exists(path: &str) -> bool {
    // A dangling symlink is still a destination conflict.
    std::fs::symlink_metadata(path).is_ok()
}

fn publish_download(
    staged: &StagedDownload,
    local_path: &str,
    handling: &str,
) -> Result<String, String> {
    let mut destination = local_path.to_string();
    loop {
        match staged.publish(Path::new(&destination), handling == "replace") {
            Ok(()) => return Ok(destination),
            Err(error)
                if error.kind() == std::io::ErrorKind::AlreadyExists
                    && handling != "replace"
                    && handling != "skip" =>
            {
                destination = resolve_conflict(local_path);
            }
            Err(error) => {
                return Err(format!(
                    "Cannot save completed download; existing destination was preserved: {}",
                    error
                ))
            }
        }
    }
}

/// Applies the user's conflict policy to a destination path.
fn resolve_destination(path: &str, handling: &str) -> DestAction {
    match handling {
        "replace" => DestAction::Path(path.to_string()),
        "skip" => {
            if path_exists(path) {
                DestAction::Skip
            } else {
                DestAction::Path(path.to_string())
            }
        }
        // "keep-both" and "ask" (ask is resolved on the frontend before download)
        _ => DestAction::Path(resolve_conflict(path)),
    }
}

fn is_disk_full_io(err: &std::io::Error) -> bool {
    err.raw_os_error() == Some(28) || err.to_string().to_lowercase().contains("no space")
}

fn classify_pull_error(stderr: &str, local_path: &str, exit_code: Option<i32>) -> String {
    let lower = stderr.to_lowercase();
    if lower.contains("no space") || lower.contains("enospc") || lower.contains("disk full") {
        return "Disk full on Mac — free up space and try again".to_string();
    }
    if lower.contains("permission denied") {
        return "Permission denied on device".to_string();
    }
    if lower.contains("no such file") || lower.contains("does not exist") {
        return "File not found on device".to_string();
    }

    if let Ok(meta) = std::fs::metadata(local_path) {
        if meta.len() == 0 {
            return "Download failed — check disk space or device connection".to_string();
        }
        return format!("adb pull exited with code {}", exit_code.unwrap_or(-1));
    }

    let code = exit_code.unwrap_or(-1);
    if code == 1 {
        "Download failed — file not found or permission denied on device".to_string()
    } else {
        format!("adb pull exited with code {}", code)
    }
}

/// Resolves file name conflicts by appending " (N)" before the extension.
/// e.g., "IMG_001.jpg" → "IMG_001 (1).jpg" → "IMG_001 (2).jpg"
fn resolve_conflict(path: &str) -> String {
    let path = Path::new(path);
    if std::fs::symlink_metadata(path).is_err() {
        return path.to_string_lossy().to_string();
    }

    let stem = path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    let ext = path
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default();
    let parent = path
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    let mut counter = 1;
    loop {
        let new_name = format!("{}/{} ({}){}", parent, stem, counter, ext);
        if !path_exists(&new_name) {
            return new_name;
        }
        counter += 1;
        if counter > 999 {
            // Safety valve
            return format!(
                "{}/{}_{}_{}{}",
                parent,
                stem,
                uuid::Uuid::new_v4(),
                counter,
                ext
            );
        }
    }
}
