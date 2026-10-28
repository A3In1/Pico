//! Wireless ADB operations: pair, connect, disconnect, mDNS discovery,
//! and USB-to-Wi-Fi switching.

use crate::adb;
use crate::adb::parser;
use crate::models::wireless::MdnsService;
use std::process::Stdio;

// ── Discovery ──────────────────────────────────────────────────────────

/// Runs `adb mdns services` and returns parsed services.
/// Sets ADB_MDNS_OPENSCREEN=1 as a macOS compatibility workaround.
pub async fn discover_services() -> Result<Vec<MdnsService>, String> {
    let adb_path = adb::get_adb_path().ok_or("ADB binary not found")?;

    let mut command = tokio::process::Command::new(&adb_path);
    adb::runtime::configure(&mut command);
    let output = command
        .env("ADB_MDNS_OPENSCREEN", "1")
        .args(["mdns", "services"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Failed to run adb mdns services: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    // adb mdns may not be supported on all versions
    if !output.status.success() {
        if stderr.contains("mdns") && stderr.contains("unknown") {
            return Err("mDNS discovery is not supported by this ADB version".to_string());
        }
        return Err(format!("adb mdns services failed: {}", stderr));
    }

    Ok(parser::parse_mdns_services(&stdout))
}

// ── Pair (manual) ──────────────────────────────────────────────────────

/// Pairs with a device using `adb pair <addr> <code>`.
pub async fn pair_device(addr: &str, code: &str) -> Result<String, String> {
    let adb_path = adb::get_adb_path().ok_or("ADB binary not found")?;

    // Run `adb pair <addr> <code>`
    let mut command = tokio::process::Command::new(&adb_path);
    adb::runtime::configure(&mut command);
    let output = command
        .args(["pair", addr, code])
        .output()
        .await
        .map_err(|e| format!("Failed to run adb pair: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let combined = format!("{}{}", stdout, stderr);
    let lower = combined.to_lowercase();

    if lower.contains("successfully paired") || lower.contains("paired successfully") {
        Ok("Paired successfully".to_string())
    } else {
        Err(classify_pairing_error(&combined))
    }
}

// ── Connect / Disconnect ───────────────────────────────────────────────

/// Connects to a wireless device: `adb connect <addr>`
pub async fn connect_device(addr: &str) -> Result<String, String> {
    let (code, stdout, stderr) = adb::run_adb(&["connect", addr]).await?;
    let combined = format!("{}{}", stdout, stderr);

    if combined.contains("connected to") || combined.contains("already connected") {
        Ok(format!("Connected to {}", addr))
    } else if code != 0 {
        Err(classify_connect_error(&combined))
    } else {
        Ok(stdout.trim().to_string())
    }
}

/// Disconnects from a wireless device: `adb disconnect <addr>`
pub async fn disconnect_device(addr: &str) -> Result<String, String> {
    let (_code, stdout, _stderr) = adb::run_adb(&["disconnect", addr]).await?;
    Ok(stdout.trim().to_string())
}

// ── USB → Wi-Fi switch ─────────────────────────────────────────────────

/// Switches a USB-connected device to Wi-Fi debugging (Android 10 and below
/// compatible path using `adb tcpip 5555`).
///
/// Returns the address (ip:5555) to connect to.
pub async fn enable_wireless_from_usb(serial: &str) -> Result<String, String> {
    // Step 1: Get device IP from wlan0 FIRST to avoid disconnecting USB if no Wi-Fi
    let (_, ip_out, _) = adb::run_adb_for_device(
        serial,
        &["shell", "ip", "-f", "inet", "addr", "show", "wlan0"],
    )
    .await?;

    let ip = parse_wlan_ip(&ip_out).ok_or_else(|| {
        "Could not determine device Wi-Fi IP. Is the phone connected to Wi-Fi?".to_string()
    })?;

    // Step 2: Enable tcpip mode on port 5555
    let (code, _stdout, stderr) = adb::run_adb_for_device(serial, &["tcpip", "5555"]).await?;
    if code != 0 {
        return Err(format!("Failed to enable tcpip: {}", stderr.trim()));
    }

    // Give the device a moment to switch
    tokio::time::sleep(std::time::Duration::from_secs(2)).await;

    let addr = format!("{}:5555", ip);

    // Step 3: Connect
    if let Err(e) = connect_device(&addr).await {
        // Revert to USB mode if connection failed so we don't leave them disconnected
        let _ = adb::run_adb(&["usb"]).await;
        return Err(format!("Wi-Fi connection failed. If you are on Android 11+, you may need to Pair the device first in the 'Manual' tab. ({})", e));
    }

    Ok(addr)
}

/// Extracts IPv4 address from `ip addr show wlan0` output.
fn parse_wlan_ip(output: &str) -> Option<String> {
    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("inet ") {
            // inet 192.168.1.5/24 brd ...
            let parts: Vec<&str> = trimmed.split_whitespace().collect();
            if parts.len() >= 2 {
                if let Some(ip) = parts[1].split('/').next() {
                    return Some(ip.to_string());
                }
            }
        }
    }
    None
}

// ── Error helpers ──────────────────────────────────────────────────────

fn classify_pairing_error(output: &str) -> String {
    let lower = output.to_lowercase();
    if lower.contains("wrong password") || lower.contains("invalid pairing") {
        "Wrong pairing code — check the code on your phone and try again".to_string()
    } else if lower.contains("connection refused") {
        "Connection refused — is Wireless debugging enabled on your phone?".to_string()
    } else if lower.contains("timeout") || lower.contains("timed out") {
        "Connection timed out — make sure your phone and Mac are on the same Wi-Fi network"
            .to_string()
    } else if lower.contains("not paired") {
        "Device is not paired — pair first before connecting".to_string()
    } else {
        format!("Pairing failed: {}", output.trim())
    }
}

fn classify_connect_error(output: &str) -> String {
    let lower = output.to_lowercase();
    if lower.contains("connection refused") {
        "Connection refused — is Wireless debugging enabled?".to_string()
    } else if lower.contains("timeout") || lower.contains("timed out") {
        "Connection timed out — ensure both devices are on the same Wi-Fi network".to_string()
    } else if lower.contains("not paired") || lower.contains("failed to authenticate") {
        "Not paired — pair the device first".to_string()
    } else {
        format!("Connection failed: {}", output.trim())
    }
}
