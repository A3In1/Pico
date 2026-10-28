//! Downloads stay private until ADB succeeds. Staging on the destination volume
//! permits atomic publication without exposing partial files or folders.

use std::io;
use std::path::{Path, PathBuf};

pub(super) struct StagedDownload {
    root: PathBuf,
    pub payload: PathBuf,
}

impl StagedDownload {
    pub fn new(destination: &Path, name: &str) -> io::Result<Self> {
        if name.is_empty() || name == "." || name == ".." || name.contains(['/', '\0']) {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "Invalid download name",
            ));
        }
        let root = destination.join(format!(".aft-download-{}", uuid::Uuid::new_v4()));
        let mut builder = std::fs::DirBuilder::new();
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt;
            builder.mode(0o700);
        }
        builder.create(&root)?;
        let payload = root.join(name);
        Ok(Self { root, payload })
    }

    pub fn publish(&self, destination: &Path, replace: bool) -> io::Result<()> {
        // A successful subprocess must actually have created the requested item.
        std::fs::symlink_metadata(&self.payload)?;
        publish(&self.payload, destination, replace)
    }
}

impl Drop for StagedDownload {
    fn drop(&mut self) {
        // Only this transfer's private directory is removed. After a swap, it
        // contains the old destination, which is now safe to remove.
        if let Err(error) = std::fs::remove_dir_all(&self.root) {
            eprintln!(
                "Could not clean download staging directory {:?}: {}",
                self.root, error
            );
        }
    }
}

#[cfg(target_os = "macos")]
fn publish(source: &Path, destination: &Path, replace: bool) -> io::Result<()> {
    use std::ffi::CString;
    use std::os::unix::ffi::OsStrExt;

    extern "C" {
        fn renamex_np(
            from: *const std::os::raw::c_char,
            to: *const std::os::raw::c_char,
            flags: u32,
        ) -> i32;
    }
    // Darwin's public rename flags, defined in <stdio.h>.
    const RENAME_SWAP: u32 = 0x00000002;
    const RENAME_EXCL: u32 = 0x00000004;
    let source = CString::new(source.as_os_str().as_bytes())?;
    let destination = CString::new(destination.as_os_str().as_bytes())?;
    // SAFETY: both pointers refer to live, NUL-terminated C strings. The flags
    // are supported by renamex_np; errors are checked before cleanup proceeds.
    if unsafe { renamex_np(source.as_ptr(), destination.as_ptr(), RENAME_EXCL) } == 0 {
        return Ok(());
    }
    let error = io::Error::last_os_error();
    if !replace || error.kind() != io::ErrorKind::AlreadyExists {
        return Err(error);
    }
    // Swap atomically, including nonempty directories. If the filesystem does
    // not support swaps, fail safely and leave the existing destination intact.
    if unsafe { renamex_np(source.as_ptr(), destination.as_ptr(), RENAME_SWAP) } == 0 {
        Ok(())
    } else {
        Err(io::Error::last_os_error())
    }
}

#[cfg(not(target_os = "macos"))]
fn publish(source: &Path, destination: &Path, replace: bool) -> io::Result<()> {
    let metadata = std::fs::symlink_metadata(source)?;
    if metadata.is_dir() || metadata.file_type().is_symlink() {
        // The application targets macOS. Do not offer a destructive fallback
        // on platforms without an atomic directory publication implementation.
        return Err(io::Error::new(
            io::ErrorKind::Unsupported,
            "Safe folder publication is currently supported only on macOS",
        ));
    }
    if replace {
        std::fs::rename(source, destination)
    } else {
        // Unlike rename, creating a hard link cannot overwrite a late arrival.
        std::fs::hard_link(source, destination)
    }
}
