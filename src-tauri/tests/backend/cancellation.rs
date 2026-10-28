use super::*;

#[tokio::test]
async fn cancel_all_stops_current_and_queued_items() {
    let f = Fixture::new(json!({"hold":true}));
    f.put("/sdcard/file", &vec![1; 200000]);
    f.put("/sdcard/queued", b"q");
    SESSION
        .scope(f.session.clone(), async {
            let cancel = async {
                f.started().await;
                transfer::cancel_all_transfers().await.unwrap();
            };
            let (r, ()) = tokio::join!(
                f.download(&["/sdcard/file", "/sdcard/queued"], "replace"),
                cancel
            );
            assert_eq!((r.cancelled, r.completed, r.failed), (2, 0, 0));
        })
        .await;
    assert!(!f.root.join("local/file").exists());
    f.assert_idle().await;
}

#[test]
fn download_sampler_never_follows_links_and_stops_on_cancellation() {
    use std::os::unix::fs::symlink;
    use std::sync::atomic::AtomicBool;
    let f = Fixture::new(json!({}));
    let tree = f.root.join("local");
    std::fs::write(tree.join("data"), b"12345").unwrap();
    symlink(f.root.join("remote"), tree.join("escape")).unwrap();
    f.put("/hidden", b"outside");
    assert_eq!(
        progress::local_written_size(tree.clone(), &AtomicBool::new(false)),
        5
    );
    assert_eq!(
        progress::local_written_size(tree, &AtomicBool::new(true)),
        0
    );
}

#[tokio::test]
async fn cancelled_job_does_not_cancel_a_second_session() {
    let a = Fixture::new(json!({"hold":true}));
    let b = Fixture::new(json!({"hold":true}));
    a.put("/sdcard/file", &vec![1; 200000]);
    b.put("/sdcard/file", &vec![2; 200000]);
    let left = SESSION.scope(a.session.clone(), async {
        let stop = async {
            a.started().await;
            transfer::cancel_all_transfers().await.unwrap();
        };
        let (r, ()) = tokio::join!(a.download(&["/sdcard/file"], "replace"), stop);
        assert_eq!(r.cancelled, 1);
    });
    let right = SESSION.scope(b.session.clone(), async {
        let release = async {
            b.started().await;
            std::fs::write(b.root.join("release"), b"go").unwrap();
        };
        let (r, ()) = tokio::join!(b.download(&["/sdcard/file"], "replace"), release);
        assert_eq!(r.completed, 1);
    });
    tokio::join!(left, right);
    a.assert_idle().await;
    b.assert_idle().await;
}

#[tokio::test]
async fn individual_cancellation_stops_only_its_registered_child() {
    let f = Fixture::new(json!({"hold":true}));
    f.put("/sdcard/file", &vec![1; 200000]);
    f.put("/sdcard/next", b"next");
    SESSION
        .scope(f.session.clone(), async {
            let stop = async {
                f.started().await;
                let id = f
                    .progress()
                    .into_iter()
                    .find(|e| e.status == crate::models::TransferStatus::InProgress)
                    .unwrap()
                    .transfer_id;
                transfer::cancel_transfer(&id).await.unwrap();
                std::fs::write(f.root.join("release"), b"go").unwrap();
            };
            let (r, ()) = tokio::join!(
                f.download(&["/sdcard/file", "/sdcard/next"], "replace"),
                stop
            );
            assert_eq!((r.cancelled, r.completed), (1, 1));
            assert!(transfer::cancel_transfer("not-active").await.is_err());
        })
        .await;
    assert!(!f.root.join("local/file").exists());
    assert_eq!(std::fs::read(f.root.join("local/next")).unwrap(), b"next");
    f.assert_idle().await;
}

#[tokio::test]
async fn terminal_closing_output_early_remains_cancellable() {
    let f = Fixture::new(json!({}));
    SESSION
        .scope(f.session.clone(), async {
            let mut command = tokio::process::Command::new("/bin/sh");
            command.args(["-c", "exec 1>&- 2>&-; exec sleep 30"]);
            let (child, mut out, _) = progress::spawn(command).unwrap();
            f.session
                .jobs
                .children
                .lock()
                .await
                .insert("early-eof".into(), child);
            let drain = async {
                use tokio::io::AsyncReadExt;
                let mut bytes = Vec::new();
                let _ = out.read_to_end(&mut bytes).await;
            };
            let stop = async {
                transfer::cancel_transfer("early-eof").await.unwrap();
            };
            tokio::time::timeout(Duration::from_secs(5), async {
                tokio::join!(drain, stop);
            })
            .await
            .unwrap();
        })
        .await;
    f.assert_idle().await;
}

#[tokio::test]
async fn progress_reporter_bounds_terminal_output_and_preserves_cancelled_bytes() {
    use crate::models::{TransferContext, TransferStatus};
    let f = Fixture::new(json!({}));
    let context = TransferContext {
        preview: false,
        batch_id: "b".into(),
        serial: "s".into(),
        destination: "d".into(),
        destination_name: None,
    };
    let mut e = progress::initial_event(&context, "upload", "job", "/image");
    e.total_known = true;
    e.total_bytes = 1000;
    e.status = TransferStatus::InProgress;
    let reporter = progress::Reporter::new(f.event_sink(), e);
    let mut output = "\u{1b}[2K[100%] /image\r".as_bytes().to_vec();
    output.extend_from_slice(&vec![b'a'; 100000]);
    let diag =
        progress::read_output(Box::new(std::io::Cursor::new(output)), reporter.clone()).await;
    assert!(diag.len() < 21000);
    assert!(!diag.contains('\u{1b}'));
    let e = reporter.snapshot();
    assert_eq!(e.percentage, 99);
    assert_eq!(e.bytes_transferred, 1000);
    assert!(e.bytes_estimated);
    reporter.finish(TransferStatus::Cancelled, Some("cancelled".into()), None);
    let cancelled = reporter.snapshot();
    assert_eq!(cancelled.percentage, 99);
    assert_eq!(cancelled.bytes_transferred, 1000);
    assert_eq!(cancelled.eta_seconds, None);
    assert_eq!(cancelled.speed_bytes_per_sec, 0);
}

#[tokio::test]
async fn upload_cancel_preserves_phone_original_and_removes_staging() {
    let f = Fixture::new(json!({"hold":true}));
    let source = f.root.join("image.jpg");
    std::fs::write(&source, vec![7; 200000]).unwrap();
    f.put("/sdcard/Download/image.jpg", b"original");
    SESSION
        .scope(f.session.clone(), async {
            let stop = async {
                f.started().await;
                transfer::cancel_all_transfers().await.unwrap();
            };
            let (r, ()) = tokio::join!(
                upload::upload_core(
                    "FAKE-USB-1",
                    vec![source.to_string_lossy().into_owned()],
                    "/sdcard/Download",
                    "replace",
                    f.event_sink()
                ),
                stop
            );
            assert_eq!(r.unwrap().cancelled, 1);
        })
        .await;
    assert_eq!(
        std::fs::read(f.root.join("remote/sdcard/Download/image.jpg")).unwrap(),
        b"original"
    );
    assert_eq!(
        std::fs::read_dir(f.root.join("remote/sdcard/Download"))
            .unwrap()
            .count(),
        1
    );
    f.assert_idle().await;
}
