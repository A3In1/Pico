use crate::models::wireless::{ConnectionType, MdnsKind, MdnsService};
use crate::models::DeviceInfo;
use regex::Regex;
use std::sync::LazyLock;

static MODEL_REGEX: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"model:(\S+)").unwrap());
static TRANSPORT_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"transport_id:(\S+)").unwrap());

/// Parses the output of `adb devices -l` into a list of DeviceInfo.
///
/// Example input:
/// ```text
/// List of devices attached
/// RF8RC1L57RY          device usb:1234 product:starqltesq model:SM_G965U transport_id:1
/// 192.168.1.5:5555     device product:raven model:Pixel_6_Pro transport_id:3
/// ABCDEF123456         unauthorized usb:5678 transport_id:2
/// ```
pub fn parse_devices_output(output: &str) -> Vec<DeviceInfo> {
    let mut devices = Vec::new();

    for line in output.lines() {
        let line = line.trim();

        // Skip header and empty lines
        if line.is_empty() || line.starts_with("List of devices") || line.starts_with("*") {
            continue;
        }

        // Split into serial + rest
        // Format: <serial>\t<status> [key:value ...]
        let parts: Vec<&str> = line.splitn(2, ['\t', ' ']).collect();
        if parts.len() < 2 {
            continue;
        }

        let serial = parts[0].trim().to_string();
        let rest = parts[1].trim();

        // Extract status (first word after serial)
        let status = rest
            .split_whitespace()
            .next()
            .unwrap_or("unknown")
            .to_string();

        // Extract model from key:value pairs
        let model = MODEL_REGEX
            .captures(rest)
            .map(|caps| caps[1].replace('_', " "));

        // Extract transport_id
        let transport_id = TRANSPORT_REGEX
            .captures(rest)
            .map(|caps| caps[1].to_string());

        // Determine connection type:
        // Wi-Fi serials look like "192.168.1.5:37000" or "adb-XXXX._adb-tls-connect._tcp"
        let is_wifi = serial.contains(':') || serial.contains("_adb-tls-");
        let connection_type = if is_wifi {
            ConnectionType::Wifi
        } else {
            ConnectionType::Usb
        };
        let address = if is_wifi { Some(serial.clone()) } else { None };

        devices.push(DeviceInfo {
            serial,
            status,
            model,
            transport_id,
            connection_type,
            address,
        });
    }

    devices
}

/// Parses the output of `adb mdns services` into a list of MdnsService.
///
/// Example input:
/// ```text
/// List of discovered mdns services
/// adb-XXXXXXXX-abc123    _adb-tls-connect._tcp.    192.168.1.5:37000
/// afp-k3j9x2             _adb-tls-pairing._tcp.    192.168.1.5:41234
/// ```
pub fn parse_mdns_services(output: &str) -> Vec<MdnsService> {
    let mut services = Vec::new();

    for line in output.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with("List of") || line.starts_with("*") {
            continue;
        }

        // Split on whitespace (separator varies between platform-tools versions)
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 3 {
            continue;
        }

        let name = parts[0].to_string();
        let raw_type = parts[1].trim_end_matches('.');
        let addr_str = parts[2];

        let service_type = if raw_type.contains("pairing") {
            MdnsKind::Pairing
        } else if raw_type.contains("connect") {
            MdnsKind::Connect
        } else {
            continue; // skip unknown types
        };

        // Parse ip:port
        if let Some((ip, port_str)) = addr_str.rsplit_once(':') {
            if let Ok(port) = port_str.parse::<u16>() {
                services.push(MdnsService {
                    name,
                    service_type,
                    ip: ip.to_string(),
                    port,
                });
            }
        }
    }

    services
}

/// Parses the output of `adb shell df <path>` to extract used and total bytes.
///
/// Example input:
/// ```text
/// Filesystem     1K-blocks    Used Available Use% Mounted on
/// /dev/fuse      112521216 89231360  23289856  79% /storage/emulated
/// ```
pub fn parse_df_output(output: &str) -> Option<(u64, u64)> {
    for line in output.lines().skip(1) {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 4 {
            // parts[1] = 1K-blocks (total), parts[2] = Used
            if let (Ok(total_kb), Ok(used_kb)) = (parts[1].parse::<u64>(), parts[2].parse::<u64>())
            {
                return Some((used_kb * 1024, total_kb * 1024));
            }
        }
    }
    None
}

/// Parsed progress from `adb pull` stderr output.
#[derive(Debug, Clone)]
pub struct PullProgress {
    pub percentage: u8,
    pub file_path: String,
}

/// Parsed completion line from `adb pull` stderr output.
#[derive(Debug, Clone)]
pub struct PullComplete {
    pub file_path: String,
    pub files_pulled: u32,
    pub files_skipped: u32,
    pub speed_str: Option<String>,
    pub bytes_transferred: Option<u64>,
    pub elapsed_seconds: Option<f64>,
}

/// Parses progress lines from `adb pull -a` stderr.
///
/// ADB emits two types of progress lines:
///
/// In-progress: `[ 45%] /sdcard/DCIM/VID_002.mp4`
/// Completed:   `/sdcard/DCIM/IMG_001.jpg: 1 file pulled, 0 skipped. 45.2 MB/s (4194304 bytes in 0.088s)`
pub fn parse_pull_progress_line(line: &str) -> Option<PullProgress> {
    let line = line.trim();

    // Match: [ XX%] /path/to/file
    static PCT_RE: std::sync::LazyLock<Regex> =
        std::sync::LazyLock::new(|| Regex::new(r"^\[\s*(\d+)%\]\s+(.+)$").unwrap());
    if let Some(caps) = PCT_RE.captures(line) {
        let pct: u8 = caps[1].parse().unwrap_or(0);
        let path = caps[2].trim().to_string();
        return Some(PullProgress {
            percentage: pct,
            file_path: path,
        });
    }

    None
}

/// Parses completion lines from `adb pull -a` stderr.
///
/// Example: `/sdcard/DCIM/IMG_001.jpg: 1 file pulled, 0 skipped. 45.2 MB/s (4194304 bytes in 0.088s)`
pub fn parse_pull_complete_line(line: &str) -> Option<PullComplete> {
    let line = line.trim();

    // Match: <path>: <N> file pulled, <M> skipped. <speed> (<bytes> bytes in <time>s)
    static COMPLETE_RE: std::sync::LazyLock<Regex> = std::sync::LazyLock::new(|| {
        Regex::new(
        r"^(.+?):\s+(\d+)\s+files?\s+(?:pulled|pushed),?\s+(\d+)\s+skipped\.?\s*(?:(\S+\s+\S+/s))?\s*(?:\((\d+)\s+bytes\s+in\s+(\d+\.?\d*)s\))?"
    ).unwrap()
    });

    if let Some(caps) = COMPLETE_RE.captures(line) {
        let file_path = caps[1].trim().to_string();
        let files_pulled: u32 = caps[2].parse().unwrap_or(0);
        let files_skipped: u32 = caps[3].parse().unwrap_or(0);
        let speed_str = caps.get(4).map(|m| m.as_str().to_string());
        let bytes_transferred = caps.get(5).and_then(|m| m.as_str().parse::<u64>().ok());
        let elapsed_seconds = caps.get(6).and_then(|m| m.as_str().parse::<f64>().ok());

        return Some(PullComplete {
            file_path,
            files_pulled,
            files_skipped,
            speed_str,
            bytes_transferred,
            elapsed_seconds,
        });
    }

    // Simpler match: adb pull sometimes just says "N file(s) pulled, M skipped."
    let simple_re = Regex::new(r"^(\d+)\s+files?\s+(?:pulled|pushed),?\s+(\d+)\s+skipped").unwrap();
    if let Some(caps) = simple_re.captures(line) {
        return Some(PullComplete {
            file_path: String::new(),
            files_pulled: caps[1].parse().unwrap_or(0),
            files_skipped: caps[2].parse().unwrap_or(0),
            speed_str: None,
            bytes_transferred: None,
            elapsed_seconds: None,
        });
    }

    None
}

#[cfg(test)]
#[path = "../../tests/unit/parser.rs"]
mod tests;
