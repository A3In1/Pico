//! "Check for Updates…" in the app menu; becomes "Restart to Update" once a new version is installed.
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::menu::{Menu, MenuItem, MenuItemKind};
use tauri::{AppHandle, Manager, Wry};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_updater::UpdaterExt;

pub const MENU_ID: &str = "check-for-updates";

struct UpdateMenu {
    item: MenuItem<Wry>,
    ready: AtomicBool,
}

/// Default menu with the update item placed under the app's name menu (macOS).
pub fn menu(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let menu = Menu::default(app)?;
    let item = MenuItem::with_id(app, MENU_ID, "Check for Updates…", true, None::<&str>)?;
    if let Some(MenuItemKind::Submenu(app_menu)) = menu.items()?.into_iter().next() {
        app_menu.insert(&item, 1)?; // right after "About Pico"
    }
    app.manage(UpdateMenu {
        item,
        ready: AtomicBool::new(false),
    });
    Ok(menu)
}

pub fn on_click(app: &AppHandle) {
    if !app.state::<UpdateMenu>().ready.load(Ordering::SeqCst) {
        return check(app.clone(), true);
    }
    let busy = !crate::adb::runtime::jobs()
        .batches
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .is_empty();
    if !busy {
        app.restart();
    }
    let app = app.clone();
    app.clone()
        .dialog()
        .message("Transfers are still running. Restarting now will cancel them.")
        .buttons(MessageDialogButtons::OkCancelCustom(
            "Restart Anyway".into(),
            "Later".into(),
        ))
        .show(move |restart| {
            if restart {
                app.restart();
            }
        });
}

/// Downloads and installs any newer release; `manual` reports "up to date" and errors.
pub fn check(app: AppHandle, manual: bool) {
    tauri::async_runtime::spawn(async move {
        let state = app.state::<UpdateMenu>();
        let _ = state.item.set_enabled(false);
        let _ = state.item.set_text("Checking for Updates…");
        let result = async {
            let Some(update) = app.updater()?.check().await? else {
                return Ok(None);
            };
            let _ = state
                .item
                .set_text(format!("Downloading {}…", update.version));
            update.download_and_install(|_, _| {}, || {}).await?;
            Ok::<_, tauri_plugin_updater::Error>(Some(update.version))
        }
        .await;
        let _ = state.item.set_enabled(true);
        match result {
            Ok(Some(version)) => {
                state.ready.store(true, Ordering::SeqCst);
                let _ = state
                    .item
                    .set_text(format!("Restart to Update ({version})"));
            }
            Ok(None) => {
                let _ = state.item.set_text("Check for Updates…");
                if manual {
                    app.dialog()
                        .message("You're running the latest version of Pico.")
                        .show(|_| {});
                }
            }
            Err(e) => {
                let _ = state.item.set_text("Check for Updates…");
                if manual {
                    app.dialog()
                        .message(format!("Couldn't check for updates: {e}"))
                        .show(|_| {});
                }
            }
        }
    });
}
