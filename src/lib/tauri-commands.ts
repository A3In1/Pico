import { invoke } from "@tauri-apps/api/core";
import type { DeviceInfo, DeviceDetails, FileEntry, StorageStats, TransferResult, MdnsService } from "../types";

// ── Device Commands ──

/** Fetch all connected Android devices (USB + Wi-Fi) */
export async function getConnectedDevices(): Promise<DeviceInfo[]> {
  return invoke<DeviceInfo[]>("get_connected_devices");
}

/** Fetch full details for a specific device */
export async function getDeviceDetails(serial: string): Promise<DeviceDetails> {
  return invoke<DeviceDetails>("get_device_details", { serial });
}

/** Check if ADB binary is available and working */
export async function checkAdbStatus(): Promise<string> {
  return invoke<string>("check_adb_status");
}

/** Quit the native application process. */
export async function exitApp(): Promise<void> {
  return invoke<void>("exit_app");
}

// ── File Commands ──

/** List directory contents on the device */
export async function listDirectory(serial: string, path: string): Promise<FileEntry[]> {
  return invoke<FileEntry[]>("list_directory", { serial, path });
}

/** Check if a path exists on the device */
export async function checkPathExists(serial: string, path: string): Promise<boolean> {
  return invoke<boolean>("check_path_exists", { serial, path });
}

/** Get storage statistics */
export async function getStorageStats(serial: string, sdCardPath: string | null): Promise<StorageStats> {
  return invoke<StorageStats>("get_storage_stats", { serial, sdCardPath });
}

/** Get quick access paths that exist on the device */
export async function getQuickAccessPaths(serial: string): Promise<[string, string][]> {
  return invoke<[string, string][]>("get_quick_access_paths", { serial });
}

/** Start background calculation of folder sizes inside a directory */
export async function getFolderSizes(serial: string, path: string): Promise<void> {
  return invoke("get_folder_sizes", { serial, path });
}

// ── Transfer Commands ──

/** Download files from device to local directory */
export async function downloadFiles(
  serial: string,
  remotePaths: string[],
  localDestination: string,
  conflictHandling: string = "keep-both",
  destinationName?: string | null
): Promise<TransferResult> {
  return invoke<TransferResult>("download_files", {
    serial,
    remotePaths,
    localDestination,
    conflictHandling,
    destinationName,
  });
}

/** Names of files that already exist at the download destination */
export async function checkDownloadConflicts(
  remotePaths: string[],
  localDestination: string
): Promise<string[]> {
  return invoke<string[]>("check_download_conflicts", {
    remotePaths,
    localDestination,
  });
}

/** Cancel an active file transfer */
export async function cancelTransfer(transferId: string): Promise<void> {
  return invoke<void>("cancel_transfer", { transferId });
}

/** Cancel running transfers and the remaining backend download queues. */
export async function cancelAllTransfers(): Promise<void> {
  return invoke<void>("cancel_all_transfers");
}

/** Get the default download location */
export async function getDownloadLocation(): Promise<string> {
  return invoke<string>("get_download_location");
}

/** Validate/set a custom download location */
export async function setDownloadLocation(path: string): Promise<string> {
  return invoke<string>("set_download_location", { path });
}

// ── Wireless Commands ──

/** Discover nearby wireless ADB services via mDNS */
export async function discoverWirelessServices(): Promise<MdnsService[]> {
  return invoke<MdnsService[]>("discover_wireless_services");
}

/** Pair with a device using IP:port and a 6-digit pairing code */
export async function pairDevice(addr: string, code: string): Promise<string> {
  return invoke<string>("pair_device", { addr, code });
}

/** Connect to an already-paired wireless device */
export async function connectDevice(addr: string): Promise<string> {
  return invoke<string>("connect_device", { addr });
}

/** Disconnect from a wireless device */
export async function disconnectDevice(addr: string): Promise<string> {
  return invoke<string>("disconnect_device", { addr });
}

/** Switch a USB-connected device to wireless mode. Returns the wireless address. */
export async function enableWirelessFromUsb(serial: string): Promise<string> {
  return invoke<string>("enable_wireless_from_usb", { serial });
}
export async function previewFile(serial: string, remotePath: string): Promise<void> {
  return invoke("preview_file", { serial, remotePath });
}

export async function uploadFiles(serial: string, localPaths: string[], remoteDestination: string, conflictHandling = "keep-both"): Promise<TransferResult> {
  return invoke("upload_files", { serial, localPaths, remoteDestination, conflictHandling });
}

export async function checkUploadConflicts(serial: string, localPaths: string[], remoteDestination: string): Promise<string[]> {
  return invoke("check_upload_conflicts", { serial, localPaths, remoteDestination });
}

export async function startFileDrag(serial: string, entries: FileEntry[]): Promise<void> {
  return invoke("start_file_drag", { serial, entries });
}
