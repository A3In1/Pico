use crate::adb;
use crate::adb::parser;
use crate::models::wireless::ConnectionType;
use crate::models::{DeviceDetails, DeviceInfo};

/// Queries `adb devices -l` and returns parsed device list.
pub async fn list_connected_devices() -> Result<Vec<DeviceInfo>, String> {
    let (code, stdout, _stderr) = adb::run_adb(&["devices", "-l"]).await?;

    if code != 0 {
        // ADB server might not be running — try starting it
        let _ = adb::run_adb(&["start-server"]).await;
        // Retry
        let (code2, stdout2, _stderr2) = adb::run_adb(&["devices", "-l"]).await?;
        if code2 != 0 {
            return Err(format!("adb devices failed: {}", _stderr2));
        }
        return Ok(parser::parse_devices_output(&stdout2));
    }

    // Ignore daemon startup messages in stderr

    Ok(parser::parse_devices_output(&stdout))
}

/// Fetches full device details for a connected device.
/// Runs getprop commands in parallel for speed.
pub async fn get_device_details(serial: &str) -> Result<DeviceDetails, String> {
    // Run all getprop commands concurrently
    let (model_result, manufacturer_result, version_result, df_result, sd_result) = tokio::join!(
        adb::run_adb_for_device(serial, &["shell", "getprop", "ro.product.model"]),
        adb::run_adb_for_device(serial, &["shell", "getprop", "ro.product.manufacturer"]),
        adb::run_adb_for_device(serial, &["shell", "getprop", "ro.build.version.release"]),
        adb::run_adb_for_device(serial, &["shell", "df", "/storage/emulated"]),
        detect_sd_card(serial),
    );

    let name = model_result
        .map(|(_, out, _)| out.trim().to_string())
        .unwrap_or_else(|_| "Unknown Device".to_string());

    let manufacturer = manufacturer_result
        .map(|(_, out, _)| {
            let m = out.trim().to_string();
            // Capitalize first letter
            let mut chars = m.chars();
            match chars.next() {
                None => m,
                Some(c) => c.to_uppercase().to_string() + chars.as_str(),
            }
        })
        .unwrap_or_else(|_| "Unknown".to_string());

    let android_version = version_result
        .map(|(_, out, _)| out.trim().to_string())
        .unwrap_or_else(|_| "Unknown".to_string());

    let (storage_used, storage_total) = df_result
        .ok()
        .and_then(|(_, out, _)| parser::parse_df_output(&out))
        .unwrap_or((0, 0));

    let sd_card_path = sd_result.ok().flatten();

    // Detect connection type from serial
    let is_wifi = serial.contains(':') || serial.contains("_adb-tls-");
    let connection_type = if is_wifi {
        ConnectionType::Wifi
    } else {
        ConnectionType::Usb
    };

    Ok(DeviceDetails {
        serial: serial.to_string(),
        name,
        manufacturer,
        android_version,
        storage_used,
        storage_total,
        sd_card_path,
        connection_type,
    })
}

/// Detects if an SD card is inserted by listing /storage/ and looking for
/// non-standard mount points (not "emulated" or "self").
async fn detect_sd_card(serial: &str) -> Result<Option<String>, String> {
    let (code, stdout, _) = adb::run_adb_for_device(serial, &["shell", "ls", "/storage/"]).await?;

    if code != 0 {
        return Ok(None);
    }

    for line in stdout.lines() {
        let name = line.trim();
        if !name.is_empty() && name != "emulated" && name != "self" && !name.starts_with('.') {
            return Ok(Some(format!("/storage/{}", name)));
        }
    }

    Ok(None)
}
