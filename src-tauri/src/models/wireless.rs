use serde::{Deserialize, Serialize};

/// Distinguishes how a device is connected
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ConnectionType {
    Usb,
    Wifi,
}

/// An mDNS service discovered by `adb mdns services`
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MdnsService {
    pub name: String,
    pub service_type: MdnsKind,
    pub ip: String,
    pub port: u16,
}

/// Kind of mDNS service
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum MdnsKind {
    Pairing,
    Connect,
}
