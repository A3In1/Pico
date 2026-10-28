//! Operation-scoped ADB dependencies. Normal app operations use the shared
//! runtime; scoped callers can own their executable, events and transfer jobs.
use crate::models::{TransferProgress, TransferResult};
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{atomic::AtomicBool, Arc, Mutex},
};
use tauri::Emitter;

#[derive(Default)]
pub(crate) struct Jobs {
    pub children: tokio::sync::Mutex<HashMap<String, tokio::process::Child>>,
    pub batches: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

static JOBS: std::sync::LazyLock<Arc<Jobs>> =
    std::sync::LazyLock::new(|| Arc::new(Jobs::default()));

type Sink = Arc<dyn Fn(&str, serde_json::Value) + Send + Sync>;

#[derive(Clone)]
pub(crate) struct Session {
    pub executable: PathBuf,
    pub environment: Vec<(String, String)>,
    pub jobs: Arc<Jobs>,
    pub sink: Sink,
}

tokio::task_local! { pub(crate) static SESSION: Session; }

pub(crate) fn jobs() -> Arc<Jobs> {
    SESSION
        .try_with(|s| s.jobs.clone())
        .unwrap_or_else(|_| JOBS.clone())
}

pub(crate) fn executable() -> Option<PathBuf> {
    SESSION.try_with(|s| s.executable.clone()).ok()
}

pub(crate) fn configure(command: &mut tokio::process::Command) {
    let _ = SESSION.try_with(|s| {
        command.envs(s.environment.iter().map(|(k, v)| (k, v)));
    });
}

#[derive(Clone)]
pub(crate) enum Events {
    App(tauri::AppHandle),
    Window(Arc<tauri::Window>),
    Sink(Sink),
}

impl Events {
    pub(crate) fn app(app: tauri::AppHandle) -> Self {
        SESSION
            .try_with(|s| Self::Sink(s.sink.clone()))
            .unwrap_or(Self::App(app))
    }

    pub(crate) fn window(window: &tauri::Window) -> Self {
        SESSION
            .try_with(|s| Self::Sink(s.sink.clone()))
            .unwrap_or_else(|_| Self::Window(Arc::new(window.clone())))
    }

    pub(crate) fn emit<T: serde::Serialize + Clone>(&self, name: &str, payload: T) {
        match self {
            Self::App(app) => {
                let _ = app.emit(name, payload);
            }
            Self::Window(window) => {
                let _ = window.emit(name, payload);
            }
            Self::Sink(sink) => {
                if let Ok(value) = serde_json::to_value(payload) {
                    sink(name, value);
                }
            }
        }
    }

    pub(crate) fn progress(&self, event: TransferProgress) {
        self.emit("transfer-progress", event);
    }
    pub(crate) fn complete(&self, result: TransferResult) {
        self.emit("transfer-complete", result);
    }
    pub(crate) fn files_changed(&self, serial: &str) {
        self.emit("phone-files-changed", serial);
    }
}
