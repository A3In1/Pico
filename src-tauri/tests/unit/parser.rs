use super::*;

#[test]
fn test_parse_devices() {
    let output = "List of devices attached\nRF8RC1L57RY\tdevice usb:1234 model:SM_G965U transport_id:1\nABCDEF\tunauthorized\n";
    let devices = parse_devices_output(output);
    assert_eq!(devices.len(), 2);
    assert_eq!(devices[0].serial, "RF8RC1L57RY");
    assert_eq!(devices[0].status, "device");
    assert_eq!(devices[0].model, Some("SM G965U".to_string()));
    assert_eq!(devices[0].connection_type, ConnectionType::Usb);
    assert_eq!(devices[1].status, "unauthorized");
}

#[test]
fn test_parse_devices_wifi() {
    let output =
        "List of devices attached\n192.168.1.5:37000\tdevice model:Pixel_6_Pro transport_id:3\n";
    let devices = parse_devices_output(output);
    assert_eq!(devices.len(), 1);
    assert_eq!(devices[0].connection_type, ConnectionType::Wifi);
    assert_eq!(devices[0].address, Some("192.168.1.5:37000".to_string()));
}

#[test]
fn test_parse_df() {
    let output = "Filesystem     1K-blocks    Used Available Use% Mounted on\n/dev/fuse      112521216 89231360  23289856  79% /storage/emulated\n";
    let (used, total) = parse_df_output(output).unwrap();
    assert_eq!(total, 112521216 * 1024);
    assert_eq!(used, 89231360 * 1024);
}

#[test]
fn test_parse_mdns_services() {
    let output = "List of discovered mdns services\nadb-XXXXXXXX-abc123\t_adb-tls-connect._tcp.\t192.168.1.5:37000\nafp-k3j9x2\t_adb-tls-pairing._tcp.\t192.168.1.5:41234\n";
    let services = parse_mdns_services(output);
    assert_eq!(services.len(), 2);
    assert_eq!(services[0].service_type, MdnsKind::Connect);
    assert_eq!(services[0].ip, "192.168.1.5");
    assert_eq!(services[0].port, 37000);
    assert_eq!(services[1].service_type, MdnsKind::Pairing);
}
