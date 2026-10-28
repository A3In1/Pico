use crate::adb::wireless;
use crate::models::wireless::MdnsService;

/// Discovers wireless ADB services via mDNS.
#[tauri::command]
pub async fn discover_wireless_services() -> Result<Vec<MdnsService>, String> {
    wireless::discover_services().await
}

/// Pairs with a device using a manual pairing code.
#[tauri::command]
pub async fn pair_device(addr: String, code: String) -> Result<String, String> {
    wireless::pair_device(&addr, &code).await
}

/// Connects to an already-paired wireless device.
#[tauri::command]
pub async fn connect_device(addr: String) -> Result<String, String> {
    wireless::connect_device(&addr).await
}

/// Disconnects from a wireless device.
#[tauri::command]
pub async fn disconnect_device(addr: String) -> Result<String, String> {
    wireless::disconnect_device(&addr).await
}

/// Switches a USB-connected device to wireless mode via `adb tcpip 5555`.
/// Works on all Android versions. Returns the wireless address.
#[tauri::command]
pub async fn enable_wireless_from_usb(serial: String) -> Result<String, String> {
    wireless::enable_wireless_from_usb(&serial).await
}
