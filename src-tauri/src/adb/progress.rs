use super::parser;
use super::runtime::Events;
use crate::models::{TransferContext, TransferProgress, TransferStatus};
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::Instant,
};
use tokio::{
    io::{AsyncRead, AsyncReadExt},
    process::{Child, Command},
};

type Reader = Box<dyn AsyncRead + Send + Unpin>;

pub(super) fn initial_event(
    context: &TransferContext,
    direction: &str,
    id: &str,
    path: &str,
) -> TransferProgress {
    TransferProgress {
        context: context.clone(),
        direction: direction.into(),
        transfer_id: id.into(),
        file_name: std::path::Path::new(path)
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| path.into()),
        file_path: path.into(),
        bytes_transferred: 0,
        total_bytes: 0,
        percentage: 0,
        progress_known: false,
        total_known: false,
        bytes_estimated: false,
        speed_bytes_per_sec: 0,
        eta_seconds: None,
        status: TransferStatus::Pending,
        error: None,
    }
}

/// ADB's terminal progress must also work when launched by a desktop app.
/// A private PTY merges both streams and enables its normal progress output.
pub(super) fn spawn(mut command: Command) -> Result<(Child, Reader, Option<Reader>), String> {
    super::runtime::configure(&mut command);
    command
        .kill_on_drop(true)
        .stdin(std::process::Stdio::null());
    #[cfg(unix)]
    {
        use std::os::fd::{AsRawFd, FromRawFd};
        let mut master = -1;
        let mut slave = -1;
        // SAFETY: openpty initializes two owned descriptors; optional name,
        // terminal settings and window size pointers may be null.
        if unsafe {
            libc::openpty(
                &mut master,
                &mut slave,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
            )
        } != 0
        {
            return Err(format!(
                "Cannot create transfer terminal: {}",
                std::io::Error::last_os_error()
            ));
        }
        // SAFETY: Each descriptor returned by openpty is adopted exactly once.
        let master = unsafe { std::fs::File::from_raw_fd(master) };
        let slave = unsafe { std::fs::File::from_raw_fd(slave) };
        for file in [&master, &slave] {
            // Prevent the child retaining the read end and delaying EOF.
            if unsafe { libc::fcntl(file.as_raw_fd(), libc::F_SETFD, libc::FD_CLOEXEC) } < 0 {
                return Err(std::io::Error::last_os_error().to_string());
            }
        }
        command
            .env("TERM", "xterm")
            .stdout(slave.try_clone().map_err(|e| e.to_string())?)
            .stderr(slave);
        let child = command.spawn().map_err(|e| e.to_string())?;
        // Dropping Command closes the parent's copies of the slave handles.
        Ok((child, Box::new(tokio::fs::File::from_std(master)), None))
    }
    #[cfg(not(unix))]
    {
        command
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());
        let mut child = command.spawn().map_err(|e| e.to_string())?;
        let out = child.stdout.take().ok_or("Missing ADB stdout")?;
        let err = child.stderr.take().ok_or("Missing ADB stderr")?;
        Ok((child, Box::new(out), Some(Box::new(err))))
    }
}

#[derive(Clone)]
pub(super) struct Reporter {
    events: Events,
    event: Arc<Mutex<TransferProgress>>,
    start: Instant,
}

impl Reporter {
    pub fn new(events: Events, event: TransferProgress) -> Self {
        Self {
            events,
            event: Arc::new(Mutex::new(event)),
            start: Instant::now(),
        }
    }
    pub fn snapshot(&self) -> TransferProgress {
        self.event.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }
    fn update(&self, change: impl FnOnce(&mut TransferProgress)) {
        let event = {
            let mut event = self.event.lock().unwrap_or_else(|e| e.into_inner());
            change(&mut event);
            if event.status == TransferStatus::InProgress {
                event.speed_bytes_per_sec = (event.bytes_transferred as f64
                    / self.start.elapsed().as_secs_f64().max(0.001))
                    as u64;
                event.eta_seconds = if event.total_known {
                    event
                        .total_bytes
                        .saturating_sub(event.bytes_transferred)
                        .checked_div(event.speed_bytes_per_sec)
                        .map(|n| n.min(u32::MAX as u64) as u32)
                } else {
                    None
                };
            }
            event.clone()
        };
        self.events.progress(event);
    }
    fn percentage(&self, percentage: u8) {
        self.update(|e| {
            if e.direction == "upload" {
                e.percentage = e.percentage.max(percentage.min(99));
                e.bytes_transferred = e
                    .bytes_transferred
                    .max(e.total_bytes.saturating_mul(percentage.min(100) as u64) / 100);
                e.bytes_estimated = true;
                e.progress_known = true;
            } else if !e.total_known {
                e.percentage = e.percentage.max(percentage.min(99));
                e.progress_known = true;
            }
        });
    }
    pub fn finish(&self, status: TransferStatus, error: Option<String>, actual_bytes: Option<u64>) {
        self.update(|e| {
            e.status = status;
            e.error = error;
            e.speed_bytes_per_sec = 0;
            e.eta_seconds = None;
            if e.status == TransferStatus::Complete {
                e.percentage = 100;
                e.progress_known = true;
                e.bytes_estimated = false;
                if let Some(bytes) = actual_bytes {
                    e.total_bytes = bytes;
                    e.bytes_transferred = bytes;
                    e.total_known = true;
                }
                e.eta_seconds = Some(0);
            }
        });
    }
    /// Actual bytes written locally give image downloads progress even when
    /// an ADB version emits no intermediate terminal percentages.
    pub async fn monitor_download(
        self,
        path: PathBuf,
        stop: Arc<AtomicBool>,
        done: Arc<tokio::sync::Notify>,
    ) {
        let mut interval = tokio::time::interval(std::time::Duration::from_millis(500));
        while !stop.load(Ordering::Relaxed) {
            tokio::select! {
                _ = done.notified() => break,
                _ = interval.tick() => {}
            }
            if stop.load(Ordering::Relaxed) {
                break;
            }
            let path = path.clone();
            let flag = stop.clone();
            let bytes = tokio::task::spawn_blocking(move || local_written_size(path, &flag))
                .await
                .unwrap_or(0);
            if stop.load(Ordering::Relaxed) {
                break;
            }
            self.update(|e| {
                e.bytes_transferred = e.bytes_transferred.max(bytes);
                e.bytes_estimated = false;
                if e.total_known && e.total_bytes > 0 {
                    e.bytes_transferred = e.bytes_transferred.min(e.total_bytes);
                    e.percentage =
                        ((e.bytes_transferred as u128 * 100 / e.total_bytes as u128).min(99)) as u8;
                    e.progress_known = true;
                }
            });
        }
    }
}

pub(super) fn local_written_size(root: PathBuf, stop: &AtomicBool) -> u64 {
    let mut paths = vec![root];
    let mut bytes = 0u64;
    while let Some(path) = paths.pop() {
        if stop.load(Ordering::Relaxed) {
            break;
        }
        let Ok(metadata) = std::fs::symlink_metadata(&path) else {
            continue;
        };
        if metadata.is_file() {
            bytes = bytes.saturating_add(metadata.len());
        } else if metadata.is_dir() {
            if let Ok(entries) = std::fs::read_dir(path) {
                for entry in entries.flatten() {
                    if stop.load(Ordering::Relaxed) {
                        break;
                    }
                    paths.push(entry.path());
                }
            }
        }
    }
    bytes
}

/// Best-effort size lookup for a single remote file. Folders use ADB's own
/// overall percentage, avoiding an extra full walk of the phone filesystem.
pub(super) async fn remote_file_size(serial: &str, path: &str) -> Option<u64> {
    let quoted = super::quote_shell_arg(path).ok()?;
    let script = format!("if [ -f {quoted} ]; then stat -L -c %s -- {quoted}; fi");
    let output = tokio::time::timeout(
        std::time::Duration::from_secs(3),
        super::run_adb_for_device(serial, &["shell", &script]),
    )
    .await
    .ok()?
    .ok()?;
    (output.0 == 0)
        .then(|| output.1.trim().parse().ok())
        .flatten()
}

/// Strip terminal control sequences and bound diagnostics while draining.
pub(super) async fn read_output(mut reader: Reader, reporter: Reporter) -> String {
    let mut buffer = [0u8; 4096];
    let mut line = String::new();
    let mut diagnostic = String::new();
    let mut escape = 0;
    let mut last = Instant::now();
    while let Ok(n) = reader.read(&mut buffer).await {
        if n == 0 {
            break;
        }
        for c in String::from_utf8_lossy(&buffer[..n]).chars() {
            if escape == 1 {
                escape = if c == '[' { 2 } else { 0 };
                continue;
            }
            if escape == 2 {
                if ('@'..='~').contains(&c) {
                    escape = 0;
                }
                continue;
            }
            if c == '\u{1b}' {
                escape = 1;
                continue;
            }
            if c == '\r' || c == '\n' {
                if let Some(p) = parser::parse_pull_progress_line(&line) {
                    if last.elapsed().as_millis() >= 200 || p.percentage == 100 {
                        reporter.percentage(p.percentage);
                        last = Instant::now();
                    }
                }
                if diagnostic.len() < 16384 {
                    diagnostic.push_str(&line);
                    diagnostic.push('\n');
                }
                line.clear();
            } else if line.len() < 4096 {
                line.push(c);
            }
        }
    }
    if diagnostic.len() < 16384 {
        diagnostic.push_str(&line);
    }
    diagnostic
}
