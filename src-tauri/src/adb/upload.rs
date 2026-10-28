use super::runtime::{self, Events};
use super::transfer::{wait_for_transfer, BatchGuard};
use super::{quote_shell_arg, run_adb_for_device};
use crate::models::{TransferContext, TransferResult, TransferStatus};
use std::path::Path;
use std::time::Instant;
// Serialize publication within this app to avoid competing Keep Both batches
// choosing the same name. ADB transfers themselves can still run concurrently.
static PUBLICATION: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

/// Never follow symlinks or upload sockets/devices. Run tree walks off the UI
/// and async executor threads; an iterative walk also avoids recursion limits.
pub(crate) fn local_size(path: &Path) -> Result<u64, String> {
    let mut pending = vec![path.to_path_buf()];
    let mut total = 0u64;
    while let Some(path) = pending.pop() {
        let meta = std::fs::symlink_metadata(&path).map_err(|e| e.to_string())?;
        if meta.is_file() {
            total = total.saturating_add(meta.len());
        } else if meta.is_dir() {
            for entry in std::fs::read_dir(path).map_err(|e| e.to_string())? {
                pending.push(entry.map_err(|e| e.to_string())?.path());
            }
        } else {
            return Err("Symbolic links and special files are not supported for upload".into());
        }
    }
    Ok(total)
}

async fn shell(serial: &str, script: &str) -> Result<String, String> {
    let (code, out, err) = run_adb_for_device(serial, &["shell", script]).await?;
    if code != 0 {
        Err(format!("{}{}", out, err).trim().to_string())
    } else {
        Ok(out)
    }
}

async fn exists(serial: &str, path: &str) -> Result<bool, String> {
    let p = quote_shell_arg(path)?;
    Ok(shell(
        serial,
        &format!("if [ -e {p} ] || [ -L {p} ]; then echo yes; else echo no; fi"),
    )
    .await?
    .trim()
        == "yes")
}

fn name(path: &str) -> Result<&str, String> {
    let path = Path::new(path);
    if !path.is_absolute() {
        return Err("Upload paths must be absolute".into());
    }
    path.file_name()
        .and_then(|n| n.to_str())
        .filter(|n| !n.is_empty() && !n.contains('\0'))
        .ok_or_else(|| "Invalid upload filename".into())
}

pub async fn check_conflicts(
    serial: &str,
    paths: &[String],
    destination: &str,
) -> Result<Vec<String>, String> {
    let mut conflicts = Vec::new();
    for path in paths {
        let file_name = name(path)?;
        if exists(
            serial,
            &format!("{}/{file_name}", destination.trim_end_matches('/')),
        )
        .await?
        {
            conflicts.push(file_name.into());
        }
    }
    Ok(conflicts)
}

pub async fn upload_files(
    serial: &str,
    paths: Vec<String>,
    destination: &str,
    handling: &str,
    app: tauri::AppHandle,
) -> Result<TransferResult, String> {
    upload_core(serial, paths, destination, handling, Events::app(app)).await
}

pub(crate) async fn upload_core(
    serial: &str,
    paths: Vec<String>,
    destination: &str,
    handling: &str,
    events: Events,
) -> Result<TransferResult, String> {
    if paths.is_empty() {
        return Err("No files selected for upload".into());
    }
    if !destination.starts_with('/') || destination.contains('\0') {
        return Err("Invalid phone destination".into());
    }
    let adb = super::get_adb_path().ok_or("ADB binary not found")?;
    let start = Instant::now();
    let batch = BatchGuard::new();
    let mut result = TransferResult {
        direction: "upload".into(),
        total_files: paths.len() as u32,
        completed: 0,
        failed: 0,
        cancelled: 0,
        total_bytes: 0,
        elapsed_seconds: 0.0,
        metadata_preserved: false,
    };
    let context = TransferContext {
        preview: false,
        batch_id: batch.id().into(),
        serial: serial.into(),
        destination: destination.into(),
        destination_name: None,
    };
    let jobs: Vec<_> = paths
        .into_iter()
        .map(|path| (uuid::Uuid::new_v4().to_string(), path))
        .collect();
    for (id, path) in &jobs {
        events.progress(super::progress::initial_event(&context, "upload", id, path));
    }
    for (id, path) in jobs {
        let mut event = super::progress::initial_event(&context, "upload", &id, &path);
        if batch.is_cancelled() {
            event.status = TransferStatus::Cancelled;
            result.cancelled += 1;
            events.progress(event);
            continue;
        }
        // Private sibling staging prevents cancelled or failed pushes from
        // exposing partial files or modifying the existing destination.
        let stage = format!(
            "{}/.aft-upload-{}",
            destination.trim_end_matches('/'),
            uuid::Uuid::new_v4()
        );
        let payload = format!("{stage}/payload");
        let staged = quote_shell_arg(&stage)?;
        let operation = async {
            let file_name = name(&path)?;
            let tree = std::path::PathBuf::from(&path);
            event.total_bytes = tokio::task::spawn_blocking(move || local_size(&tree)).await.map_err(|e| e.to_string())??;
            event.total_known = true;
            event.progress_known = true;
            if batch.is_cancelled() { return Ok(false); }
            let desired = format!("{}/{file_name}", destination.trim_end_matches('/'));
            if handling == "skip" && exists(serial, &desired).await? { return Err("Skipped — destination already exists".into()); }
            shell(serial, &format!("umask 077; mkdir -- {staged}")).await?;
            let mut command = tokio::process::Command::new(&adb);
            command.args(["-s", serial, "push", &path, &payload]);
            let (mut child, stdout, stderr) = super::progress::spawn(command)?;
            {
                let jobs = runtime::jobs();
                let mut active = jobs.children.lock().await;
                if batch.is_cancelled() { drop(active); let _ = child.kill().await; return Ok(false); }
                active.insert(id.clone(), child);
            }
            event.status = TransferStatus::InProgress;
            events.progress(event.clone());
            let reporter = super::progress::Reporter::new(events.clone(), event.clone());
            let out_task = tokio::spawn(super::progress::read_output(stdout, reporter.clone()));
            let err_reporter = reporter.clone();
            let err_task = tokio::spawn(async move {
                if let Some(stderr) = stderr { super::progress::read_output(stderr, err_reporter).await } else { String::new() }
            });
            // Wait for the child independently of EOF: cancellation also works
            // when a subprocess closes its output before exiting.
            let status = wait_for_transfer(&id, &runtime::jobs()).await;
            let out = out_task.await.unwrap_or_default();
            let err = err_task.await.unwrap_or_default();
            event = reporter.snapshot();
            let Some(status) = status? else { return Ok(false); };
            if batch.is_cancelled() { return Ok(false); }
            if !status.success() { return Err(format!("Upload failed: {out}{err}").trim().to_string()); }
            let _publication = PUBLICATION.lock().await;
            let source = quote_shell_arg(&payload)?;
            let mut counter = 0u32;
            loop {
                if batch.is_cancelled() { return Ok(false); }
                let candidate = if counter == 0 { desired.clone() } else {
                    let p = Path::new(file_name);
                    let stem = p.file_stem().and_then(|v| v.to_str()).unwrap_or(file_name);
                    let ext = p.extension().and_then(|v| v.to_str()).map(|v| format!(".{v}")).unwrap_or_default();
                    format!("{}/{} ({counter}){}", destination.trim_end_matches('/'), stem, ext)
                };
                let dest = quote_shell_arg(&candidate)?;
                // Never merge folders or follow an existing destination link.
                // Android has no portable atomic folder exchange; preserve an
                // existing folder and explain how to keep both instead.
                let script = if handling == "replace" {
                    format!("if [ -d {dest} ] || [ -L {dest} ]; then echo 'Cannot replace a folder or symbolic link; choose Keep Both' >&2; exit 1; fi; mv -f -T -- {source} {dest}")
                } else {
                    format!("mv -n -T -- {source} {dest} && if [ -e {source} ] || [ -L {source} ]; then echo conflict; else echo saved; fi")
                };
                let output = shell(serial, &script).await?;
                if output.trim() != "conflict" { return Ok(true); }
                if handling == "skip" { return Err("Skipped — destination already exists".into()); }
                counter = counter.checked_add(1).filter(|n| *n <= 9999).ok_or("Too many filename conflicts")?;
            }
        }.await;
        // Cleanup only our generated staging directory. A disconnected device
        // may retain this hidden folder until it is connected again.
        let cleanup = shell(serial, &format!("rm -rf -- {staged}")).await;
        match operation {
            Ok(true) => {
                result.completed += 1;
                result.total_bytes += event.total_bytes;
                event.status = TransferStatus::Complete;
                event.percentage = 100;
                event.progress_known = true;
                event.total_known = true;
                event.bytes_estimated = false;
                event.bytes_transferred = event.total_bytes;
                event.eta_seconds = Some(0);
            }
            Ok(false) => {
                result.cancelled += 1;
                event.status = TransferStatus::Cancelled;
            }
            Err(error) => {
                result.failed += 1;
                event.status = TransferStatus::Failed;
                event.error = Some(error);
            }
        }
        if let Err(error) = cleanup {
            eprintln!("Could not clean upload staging {stage}: {error}");
        }
        events.progress(event);
    }
    result.elapsed_seconds = start.elapsed().as_secs_f64();
    events.complete(result.clone());
    events.files_changed(serial);
    Ok(result)
}
