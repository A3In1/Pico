use super::*;

#[tokio::test]
async fn discovery_details_storage_and_quick_access_use_fixture_runner() {
    let f = Fixture::new(json!({"sd_card":true}));
    SESSION
        .scope(f.session.clone(), async {
            assert_eq!(
                connection::list_connected_devices().await.unwrap()[0].serial,
                "FAKE-USB-1"
            );
            let d = connection::get_device_details("FAKE-USB-1").await.unwrap();
            assert_eq!(d.name, "Test Phone");
            assert_eq!(d.manufacturer, "Fixture");
            assert_eq!(d.android_version, "14");
            assert_eq!(d.storage_total, 1024 * 1024);
            assert_eq!(d.sd_card_path.as_deref(), Some("/storage/ABCD-1234"));
            let stats = crate::commands::file_commands::get_storage_stats(
                "FAKE-USB-1".into(),
                d.sd_card_path,
            )
            .await
            .unwrap();
            assert_eq!(stats.sd_total, Some(1024 * 1024));
            assert!(crate::commands::device_commands::check_adb_status()
                .await
                .unwrap()
                .contains("1.0.41"));
            assert_eq!(
                crate::commands::file_commands::get_quick_access_paths("FAKE-USB-1".into())
                    .await
                    .unwrap()
                    .len(),
                1
            );
            let rows = filesystem::list_directory("FAKE-USB-1", "/sdcard")
                .await
                .unwrap();
            assert_eq!(rows[0].name, "image.jpg");
        })
        .await;
}

#[tokio::test]
async fn failed_discovery_retries_once_without_starting_real_adb() {
    let f = Fixture::new(json!({"devices_error":true}));
    SESSION
        .scope(f.session.clone(), async {
            assert!(connection::list_connected_devices()
                .await
                .unwrap_err()
                .contains("fixture discovery"));
        })
        .await;
    let calls: Vec<Value> = std::fs::read_to_string(f.root.join("argv.jsonl"))
        .unwrap()
        .lines()
        .map(|s| serde_json::from_str(s).unwrap())
        .collect();
    assert_eq!(
        calls,
        vec![
            json!(["devices", "-l"]),
            json!(["start-server"]),
            json!(["devices", "-l"])
        ]
    );
}

#[tokio::test]
async fn missing_runner_and_listing_permission_fail_actionably() {
    let mut f = Fixture::new(json!({"listing_error":"Permission denied"}));
    SESSION
        .scope(f.session.clone(), async {
            assert!(filesystem::list_directory("FAKE-USB-1", "/sdcard")
                .await
                .unwrap_err()
                .contains("Permission denied"));
        })
        .await;
    f.session.executable = f.root.join("missing");
    SESSION
        .scope(f.session.clone(), async {
            assert!(run_adb(&["version"]).await.is_err());
        })
        .await;
}

#[tokio::test]
async fn wireless_commands_are_simulated_and_pairing_secret_is_not_logged() {
    let f = Fixture::new(json!({}));
    SESSION
        .scope(f.session.clone(), async {
            assert_eq!(wireless::discover_services().await.unwrap().len(), 1);
            assert_eq!(
                wireless::pair_device("192.0.2.1:37001", "123456")
                    .await
                    .unwrap(),
                "Paired successfully"
            );
            assert!(wireless::connect_device("192.0.2.1:5555")
                .await
                .unwrap()
                .contains("Connected"));
            assert!(wireless::disconnect_device("192.0.2.1:5555")
                .await
                .unwrap()
                .contains("disconnected"));
        })
        .await;
    assert!(!std::fs::read_to_string(f.root.join("argv.jsonl"))
        .unwrap()
        .contains("123456"));
}

#[tokio::test]
async fn wireless_failure_messages_and_usb_conversion_are_exercised_without_a_network() {
    let f =
        Fixture::new(json!({"pair_error":"wrong password","connect_error":"connection refused"}));
    SESSION
        .scope(f.session.clone(), async {
            assert!(wireless::pair_device("192.0.2.1:37000", "123456")
                .await
                .unwrap_err()
                .contains("Wrong pairing code"));
            assert!(wireless::connect_device("192.0.2.1:5555")
                .await
                .unwrap_err()
                .contains("Connection refused"));
        })
        .await;
    std::fs::write(f.root.join("scenario.json"), "{}").unwrap();
    SESSION
        .scope(f.session.clone(), async {
            assert_eq!(
                wireless::enable_wireless_from_usb("FAKE-USB-1")
                    .await
                    .unwrap(),
                "192.0.2.1:5555"
            );
        })
        .await;
}

#[tokio::test]
async fn folder_size_stream_emits_parent_name_and_bytes_not_invalid_rows() {
    let f = Fixture::new(json!({}));
    SESSION
        .scope(f.session.clone(), async {
            filesystem::folder_sizes_core(f.event_sink(), "FAKE-USB-1", "/sdcard/Download")
                .await
                .unwrap();
        })
        .await;
    let events = f.events.lock().unwrap();
    let sizes: Vec<_> = events
        .iter()
        .filter(|(name, _)| name == "folder-size-update")
        .map(|(_, v)| v)
        .collect();
    assert_eq!(sizes.len(), 2);
    assert_eq!(sizes[0]["size"], 2048);
    assert_eq!(sizes[0]["serial"], "FAKE-USB-1");
    assert_eq!(sizes[0]["parent_path"], "/sdcard/Download");
    assert_eq!(sizes[0]["name"], "FixtureFolder");
}
