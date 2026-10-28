use super::*;

pub(super) struct Fixture {
    pub(super) root: PathBuf,
    pub(super) session: Session,
    pub(super) events: Arc<Mutex<Vec<(String, Value)>>>,
}

impl Fixture {
    pub(super) fn new(scenario: Value) -> Self {
        use std::os::unix::fs::PermissionsExt;
        let root = std::env::temp_dir().join(format!("aft-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(root.join("remote/sdcard/Download")).unwrap();
        std::fs::create_dir(root.join("local")).unwrap();
        std::fs::write(root.join("scenario.json"), scenario.to_string()).unwrap();
        let executable = root.join("fake-adb");
        std::fs::write(&executable, include_str!("../fixtures/fake_adb.py")).unwrap();
        std::fs::set_permissions(&executable, std::fs::Permissions::from_mode(0o700)).unwrap();
        let events = Arc::new(Mutex::new(Vec::new()));
        let captured = events.clone();
        let session = Session {
            executable,
            environment: vec![("AFT_FAKE_ROOT".into(), root.to_string_lossy().into_owned())],
            jobs: Arc::new(Jobs::default()),
            sink: Arc::new(move |name, value| captured.lock().unwrap().push((name.into(), value))),
        };
        Self {
            root,
            session,
            events,
        }
    }
    pub(super) fn event_sink(&self) -> Events {
        Events::Sink(self.session.sink.clone())
    }
    pub(super) fn local(&self) -> String {
        self.root.join("local").to_string_lossy().into_owned()
    }
    pub(super) fn put(&self, remote: &str, bytes: &[u8]) {
        let path = self
            .root
            .join("remote")
            .join(remote.trim_start_matches('/'));
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, bytes).unwrap();
    }
    pub(super) fn progress(&self) -> Vec<crate::models::TransferProgress> {
        self.events
            .lock()
            .unwrap()
            .iter()
            .filter(|(name, _)| name == "transfer-progress")
            .map(|(_, v)| serde_json::from_value(v.clone()).unwrap())
            .collect()
    }
    pub(super) async fn download(
        &self,
        paths: &[&str],
        policy: &str,
    ) -> crate::models::TransferResult {
        transfer::download_core(
            "FAKE-USB-1",
            paths.iter().map(|s| (*s).into()).collect(),
            &self.local(),
            policy,
            transfer::DownloadTarget {
                name: None,
                preview: false,
            },
            self.event_sink(),
            Arc::new(transfer::BatchGuard::new()),
        )
        .await
        .unwrap()
    }
    pub(super) async fn started(&self) {
        tokio::time::timeout(Duration::from_secs(10), async {
            while !self.root.join("started").exists() {
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .expect("fake ADB never reached its copy barrier");
    }
    pub(super) async fn assert_idle(&self) {
        assert!(self.session.jobs.children.lock().await.is_empty());
        assert!(self.session.jobs.batches.lock().unwrap().is_empty());
        assert!(!std::fs::read_dir(self.root.join("local"))
            .unwrap()
            .any(|e| e
                .unwrap()
                .file_name()
                .to_string_lossy()
                .starts_with(".aft-download-")));
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        std::fs::remove_dir_all(&self.root).unwrap();
    }
}
