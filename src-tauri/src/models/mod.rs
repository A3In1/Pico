pub mod wireless;

use serde::{Deserialize, Serialize};

/// Device info parsed from `adb devices -l`
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceInfo {
    pub serial: String,
    pub status: String, // "device", "unauthorized", "offline"
    pub model: Option<String>,
    pub transport_id: Option<String>,
    pub connection_type: wireless::ConnectionType,
    pub address: Option<String>, // "192.168.1.5:37000" for wifi
}

/// Full device details fetched after connection
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceDetails {
    pub serial: String,
    pub name: String,
    pub manufacturer: String,
    pub android_version: String,
    pub storage_used: u64,
    pub storage_total: u64,
    pub sd_card_path: Option<String>,
    pub connection_type: wireless::ConnectionType,
}

/// Single file/folder entry from the device
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    pub size: u64,
    pub modified: Option<String>, // "2024-03-01 10:30" format from ls -la
    pub file_type: String, // "image", "video", "audio", "document", "archive", "folder", "apk", "other"
}

/// Storage statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageStats {
    pub internal_used: u64,
    pub internal_total: u64,
    pub sd_used: Option<u64>,
    pub sd_total: Option<u64>,
}

// ── Transfer Models ──

/// Status of an individual file transfer
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum TransferStatus {
    Pending,
    InProgress,
    Complete,
    Failed,
    Cancelled,
}

/// Original routing information lets retries target the same device and folder.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferContext {
    pub preview: bool,
    pub batch_id: String,
    pub serial: String,
    pub destination: String,
    pub destination_name: Option<String>,
}

/// Progress update for a single file transfer (emitted as Tauri event)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferProgress {
    pub context: TransferContext,
    pub direction: String,
    pub transfer_id: String,
    pub file_name: String,
    pub file_path: String,
    pub bytes_transferred: u64,
    pub total_bytes: u64,
    pub percentage: u8,
    pub progress_known: bool,
    pub total_known: bool,
    pub bytes_estimated: bool,
    pub speed_bytes_per_sec: u64,
    pub eta_seconds: Option<u32>,
    pub status: TransferStatus,
    pub error: Option<String>,
}

/// Final result of a batch transfer
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferResult {
    pub direction: String,
    pub total_files: u32,
    pub completed: u32,
    pub failed: u32,
    pub cancelled: u32,
    pub total_bytes: u64,
    pub elapsed_seconds: f64,
    pub metadata_preserved: bool,
}

/// Request to start a download
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadRequest {
    pub serial: String,
    pub remote_paths: Vec<String>,
    pub local_destination: String,
}
