// TypeScript types matching the Rust backend models

export type ConnectionType = 'usb' | 'wifi';

export interface DeviceInfo {
  serial: string;
  status: string; // "device" | "unauthorized" | "offline"
  model: string | null;
  transport_id: string | null;
  connection_type: ConnectionType;
  address: string | null;
}

export interface DeviceDetails {
  serial: string;
  name: string;
  manufacturer: string;
  android_version: string;
  storage_used: number;
  storage_total: number;
  sd_card_path: string | null;
  connection_type: ConnectionType;
}

export interface FileEntry {
  name: string;
  path: string;
  is_directory: boolean;
  size: number;
  modified: string | null;
  file_type: string; // "image" | "video" | "audio" | "document" | "archive" | "folder" | "apk" | "other"
}

export interface FolderSizeUpdate {
  serial: string;
  parent_path: string;
  name: string;
  size: number;
}

export interface StorageStats {
  internal_used: number;
  internal_total: number;
  sd_used: number | null;
  sd_total: number | null;
}

// ── Transfer Types ──

export type TransferStatus = "pending" | "inprogress" | "complete" | "failed" | "cancelled";

export interface TransferProgress {
  context: { preview: boolean; batch_id: string; serial: string; destination: string; destination_name: string | null };
  direction: "download" | "upload";
  transfer_id: string;
  file_name: string;
  file_path: string;
  bytes_transferred: number;
  total_bytes: number;
  percentage: number;
  progress_known: boolean;
  total_known: boolean;
  bytes_estimated: boolean;
  speed_bytes_per_sec: number;
  eta_seconds: number | null;
  status: TransferStatus;
  error: string | null;
}

export interface TransferResult {
  direction: "download" | "upload";
  total_files: number;
  completed: number;
  failed: number;
  cancelled: number;
  total_bytes: number;
  elapsed_seconds: number;
  metadata_preserved: boolean;
}

// ── Wireless Types ──

export type MdnsKind = 'pairing' | 'connect';

export interface MdnsService {
  name: string;
  service_type: MdnsKind;
  ip: string;
  port: number;
}

export type PairingStatus =
  | 'pairing'
  | 'paired'
  | 'connecting'
  | 'connected'
  | { failed: string };

