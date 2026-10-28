use pico_lib::adb::parser::parse_devices_output;
use pico_lib::models::wireless::ConnectionType;

// Preserves the space-separated Wi-Fi example from the former root scratch script.
#[test]
fn space_separated_wifi_device() {
    let output = "192.168.1.5:5555     device product:raven model:Pixel_6_Pro transport_id:3";
    let devices = parse_devices_output(output);
    assert_eq!(devices.len(), 1);
    assert_eq!(devices[0].serial, "192.168.1.5:5555");
    assert_eq!(devices[0].status, "device");
    assert_eq!(devices[0].model.as_deref(), Some("Pixel 6 Pro"));
    assert_eq!(devices[0].transport_id.as_deref(), Some("3"));
    assert_eq!(devices[0].connection_type, ConnectionType::Wifi);
}
