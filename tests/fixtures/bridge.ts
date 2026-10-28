import { vi } from "vitest";
type Callback = (event: {
    payload: unknown;
}) => void;
export const listeners = new Map<string, Set<Callback>>();
export const invoke = vi.fn<(name: string, args?: unknown) => Promise<any>>();
export const unlisten = vi.fn();
export const listen = vi.fn(async (name: string, callback: Callback) => {
    const callbacks = listeners.get(name) ?? new Set();
    callbacks.add(callback);
    listeners.set(name, callbacks);
    return () => { callbacks.delete(callback); unlisten(name); };
});
export function emit(name: string, payload: unknown) {
    listeners.get(name)?.forEach(callback => callback({ payload }));
}
export const open = vi.fn(async () => null as string | null);
export const closeListeners = new Set<(event: any) => unknown>();
export const dropListeners = new Set<(event: any) => unknown>();
export const windowAPI = {
    onCloseRequested: vi.fn(async (callback: (event: any) => unknown) => {
        closeListeners.add(callback);
        return () => { closeListeners.delete(callback); };
    }),
};
export const webviewAPI = {
    onDragDropEvent: vi.fn(async (callback: (event: any) => unknown) => {
        dropListeners.add(callback);
        return () => { dropListeners.delete(callback); };
    }),
};
export const device = { serial: "FAKE-USB-1", status: "device", model: "Fixture", transport_id: "1", connection_type: "usb", address: null };
export const details = { serial: device.serial, name: "Fixture", manufacturer: "Fixture", android_version: "14", storage_used: 512, storage_total: 1024, sd_card_path: null, connection_type: "usb" };
export function entry(name: string, directory = false, size = 10) {
    return { name, path: `/sdcard/${name}`, is_directory: directory, size, modified: "2024-03-01 10:30", file_type: directory ? "folder" : "image" };
}
export function progress(overrides: Record<string, any> = {}) {
    return {
        context: { preview: false, batch_id: "batch-1", serial: "FAKE-USB-1", destination: "/fixture/mac", destination_name: null },
        direction: "download", transfer_id: "job-1", file_name: "image.jpg", file_path: "/sdcard/image.jpg",
        bytes_transferred: 50, total_bytes: 100, percentage: 50, progress_known: true, total_known: true, bytes_estimated: false,
        speed_bytes_per_sec: 10, eta_seconds: 5, status: "inprogress", error: null, ...overrides,
    };
}
export const result = { direction: "download", total_files: 1, completed: 1, failed: 0, cancelled: 0, total_bytes: 100, elapsed_seconds: 1, metadata_preserved: true };
export function defaults() {
    listeners.clear();
    closeListeners.clear();
    dropListeners.clear();
    listen.mockImplementation(async (name, callback) => {
        const set = listeners.get(name) ?? new Set<Callback>();
        set.add(callback);
        listeners.set(name, set);
        return () => { set.delete(callback); unlisten(name); };
    });
    invoke.mockImplementation(async (name) => {
        switch (name) {
            case "get_connected_devices": return [device];
            case "get_device_details": return details;
            case "get_download_location": return "/fixture/mac";
            case "get_quick_access_paths": return [["Pictures", "/sdcard/Pictures"]];
            case "list_directory": return [entry("Folder", true), entry("image.jpg")];
            case "check_download_conflicts":
            case "check_upload_conflicts":
            case "discover_wireless_services": return [];
            case "download_files":
            case "upload_files": return result;
            default: return undefined;
        }
    });
    open.mockResolvedValue(null);
}
