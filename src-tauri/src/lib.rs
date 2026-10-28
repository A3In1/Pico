pub mod adb;
pub mod commands;
pub mod models;
#[cfg(target_os = "macos")]
mod native_drag;
pub mod updates;

use commands::{device_commands, file_commands, transfer_commands, wireless_commands};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .menu(updates::menu)
        .on_menu_event(|app, event| {
            if event.id() == updates::MENU_ID {
                updates::on_click(app);
            }
        })
        .setup(|app| {
            updates::check(app.handle().clone(), false);
            tauri::async_runtime::spawn(async move {
                if let Some(adb_path) = adb::get_adb_path() {
                    // Try to kill any existing server
                    let _ = tokio::process::Command::new(&adb_path)
                        .args(["kill-server"])
                        .output()
                        .await;

                    // Start the server with openscreen mDNS enabled
                    let _ = tokio::process::Command::new(&adb_path)
                        .env("ADB_MDNS_OPENSCREEN", "1")
                        .args(["start-server"])
                        .output()
                        .await;
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Device commands
            device_commands::get_connected_devices,
            device_commands::get_device_details,
            device_commands::check_adb_status,
            device_commands::exit_app,
            // File commands
            file_commands::list_directory,
            file_commands::check_path_exists,
            file_commands::get_storage_stats,
            file_commands::get_quick_access_paths,
            file_commands::get_folder_sizes,
            // Transfer commands
            transfer_commands::download_files,
            transfer_commands::upload_files,
            transfer_commands::check_upload_conflicts,
            transfer_commands::start_file_drag,
            transfer_commands::cancel_transfer,
            transfer_commands::cancel_all_transfers,
            transfer_commands::get_download_location,
            transfer_commands::set_download_location,
            transfer_commands::check_download_conflicts,
            transfer_commands::preview_file,
            // Wireless commands
            wireless_commands::discover_wireless_services,
            wireless_commands::pair_device,
            wireless_commands::connect_device,
            wireless_commands::disconnect_device,
            wireless_commands::enable_wireless_from_usb,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_, event| {
            if matches!(event, tauri::RunEvent::ExitRequested { .. }) {
                if let Some(adb_path) = adb::get_adb_path() {
                    let _ = std::process::Command::new(adb_path)
                        .args(["kill-server"])
                        .output();
                }
            }
        });
}
