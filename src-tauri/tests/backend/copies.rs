use super::*;

#[tokio::test]
async fn downloads_publish_exact_bytes_and_queue_all_selected_items() {
    let f = Fixture::new(json!({"require_tty":true}));
    let data: Vec<u8> = (0..200000).map(|i| (i % 251) as u8).collect();
    f.put("/sdcard/image.jpg", &data);
    f.put("/sdcard/zero", b"");
    SESSION
        .scope(f.session.clone(), async {
            let r = f
                .download(&["/sdcard/image.jpg", "/sdcard/zero"], "keep-both")
                .await;
            assert_eq!(
                (r.completed, r.failed, r.total_bytes),
                (2, 0, data.len() as u64)
            );
            assert_eq!(std::fs::read(f.root.join("local/image.jpg")).unwrap(), data);
            assert_eq!(std::fs::read(f.root.join("local/zero")).unwrap(), b"");
        })
        .await;
    let events = f.progress();
    assert_eq!(events[0].status, crate::models::TransferStatus::Pending);
    assert_eq!(events[1].status, crate::models::TransferStatus::Pending);
    for e in &events {
        assert!(e.percentage <= 100);
        if e.status == crate::models::TransferStatus::InProgress {
            assert!(e.percentage < 100);
        }
    }
    let final_events: Vec<_> = events
        .iter()
        .filter(|e| e.status == crate::models::TransferStatus::Complete)
        .collect();
    assert_eq!(final_events.len(), 2);
    assert!(final_events
        .iter()
        .all(|e| e.percentage == 100 && e.total_known && !e.bytes_estimated));
    f.assert_idle().await;
}

#[tokio::test]
async fn conflict_policies_preserve_or_replace_files_without_merging() {
    let f = Fixture::new(json!({}));
    f.put("/sdcard/image.jpg", b"new");
    std::fs::write(f.root.join("local/image.jpg"), b"old").unwrap();
    SESSION
        .scope(f.session.clone(), async {
            assert_eq!(f.download(&["/sdcard/image.jpg"], "skip").await.failed, 1);
            assert_eq!(
                std::fs::read(f.root.join("local/image.jpg")).unwrap(),
                b"old"
            );
            assert_eq!(
                f.download(&["/sdcard/image.jpg"], "keep-both")
                    .await
                    .completed,
                1
            );
            assert_eq!(
                std::fs::read(f.root.join("local/image (1).jpg")).unwrap(),
                b"new"
            );
            assert_eq!(
                std::fs::read(f.root.join("local/image.jpg")).unwrap(),
                b"old"
            );
            assert_eq!(
                f.download(&["/sdcard/image.jpg"], "replace")
                    .await
                    .completed,
                1
            );
            assert_eq!(
                std::fs::read(f.root.join("local/image.jpg")).unwrap(),
                b"new"
            );
        })
        .await;
    f.assert_idle().await;
}

#[cfg(target_os = "macos")]
#[tokio::test]
async fn folders_are_replaced_atomically_and_empty_children_survive() {
    let f = Fixture::new(json!({}));
    f.put("/sdcard/tree/nested/data", b"new");
    std::fs::create_dir(f.root.join("remote/sdcard/tree/empty")).unwrap();
    std::fs::create_dir_all(f.root.join("local/tree")).unwrap();
    std::fs::write(f.root.join("local/tree/old"), b"old").unwrap();
    SESSION
        .scope(f.session.clone(), async {
            assert_eq!(f.download(&["/sdcard/tree"], "replace").await.completed, 1);
        })
        .await;
    assert!(!f.root.join("local/tree/old").exists());
    assert_eq!(
        std::fs::read(f.root.join("local/tree/nested/data")).unwrap(),
        b"new"
    );
    assert!(f.root.join("local/tree/empty").is_dir());
    f.assert_idle().await;
}

#[tokio::test]
async fn partial_failure_preserves_original_and_settles_queue() {
    let f = Fixture::new(json!({"partial_error":"No space left on device"}));
    f.put("/sdcard/image.jpg", &vec![7; 200000]);
    f.put("/sdcard/second", b"second");
    std::fs::write(f.root.join("local/image.jpg"), b"old").unwrap();
    SESSION
        .scope(f.session.clone(), async {
            assert_eq!(
                f.download(&["/sdcard/image.jpg", "/sdcard/second"], "replace")
                    .await
                    .failed,
                2
            );
        })
        .await;
    assert_eq!(
        std::fs::read(f.root.join("local/image.jpg")).unwrap(),
        b"old"
    );
    let failures: Vec<_> = f
        .progress()
        .into_iter()
        .filter(|e| e.status == crate::models::TransferStatus::Failed)
        .collect();
    assert_eq!(failures.len(), 2);
    assert!(failures
        .iter()
        .all(|e| e.error.as_deref().unwrap().contains("Disk full")));
    f.assert_idle().await;
}

#[tokio::test]
async fn success_without_payload_is_failure_not_false_completion() {
    let f = Fixture::new(json!({"missing_payload":true}));
    f.put("/sdcard/file", b"abc");
    SESSION
        .scope(f.session.clone(), async {
            assert_eq!(f.download(&["/sdcard/file"], "replace").await.failed, 1);
        })
        .await;
    assert!(!f.root.join("local/file").exists());
    f.assert_idle().await;
}

#[tokio::test]
async fn upload_contents_conflicts_and_cleanup_use_real_local_files() {
    let f = Fixture::new(json!({"require_tty":true}));
    let source = f.root.join("image.jpg");
    std::fs::write(&source, b"image bytes").unwrap();
    f.put("/sdcard/Download/image.jpg", b"original");
    SESSION
        .scope(f.session.clone(), async {
            let paths = vec![source.to_string_lossy().into_owned()];
            assert_eq!(
                upload::check_conflicts("FAKE-USB-1", &paths, "/sdcard/Download")
                    .await
                    .unwrap(),
                vec!["image.jpg"]
            );
            let r = upload::upload_core(
                "FAKE-USB-1",
                paths,
                "/sdcard/Download",
                "keep-both",
                f.event_sink(),
            )
            .await
            .unwrap();
            assert_eq!((r.completed, r.failed, r.total_bytes), (1, 0, 11));
        })
        .await;
    assert_eq!(
        std::fs::read(f.root.join("remote/sdcard/Download/image.jpg")).unwrap(),
        b"original"
    );
    assert_eq!(
        std::fs::read(f.root.join("remote/sdcard/Download/image (1).jpg")).unwrap(),
        b"image bytes"
    );
    assert!(!std::fs::read_dir(f.root.join("remote/sdcard/Download"))
        .unwrap()
        .any(|e| e
            .unwrap()
            .file_name()
            .to_string_lossy()
            .starts_with(".aft-upload-")));
    f.assert_idle().await;
}

#[tokio::test]
async fn uploads_reject_links_and_folder_replacement_preserves_original() {
    use std::os::unix::fs::symlink;
    let f = Fixture::new(json!({}));
    let source = f.root.join("tree");
    std::fs::create_dir(&source).unwrap();
    std::fs::write(source.join("new"), b"new").unwrap();
    f.put("/sdcard/Download/tree/old", b"old");
    symlink(source.join("new"), f.root.join("link")).unwrap();
    assert!(upload::local_size(&f.root.join("link"))
        .unwrap_err()
        .contains("Symbolic"));
    SESSION
        .scope(f.session.clone(), async {
            let r = upload::upload_core(
                "FAKE-USB-1",
                vec![source.to_string_lossy().into_owned()],
                "/sdcard/Download",
                "replace",
                f.event_sink(),
            )
            .await
            .unwrap();
            assert_eq!(r.failed, 1);
        })
        .await;
    assert_eq!(
        std::fs::read(f.root.join("remote/sdcard/Download/tree/old")).unwrap(),
        b"old"
    );
    assert!(!f.root.join("remote/sdcard/Download/tree/new").exists());
    f.assert_idle().await;
}

#[tokio::test]
async fn dangling_destination_link_is_a_conflict_and_is_not_followed() {
    use std::os::unix::fs::symlink;
    let f = Fixture::new(json!({}));
    f.put("/sdcard/image.jpg", b"new");
    let outside = f.root.join("outside");
    symlink(&outside, f.root.join("local/image.jpg")).unwrap();
    assert_eq!(
        transfer::check_download_conflicts(&["/sdcard/image.jpg".into()], &f.local()),
        vec!["image.jpg"]
    );
    SESSION
        .scope(f.session.clone(), async {
            assert_eq!(
                f.download(&["/sdcard/image.jpg"], "keep-both")
                    .await
                    .completed,
                1
            );
        })
        .await;
    assert!(!outside.exists());
    assert!(f.root.join("local/image.jpg").is_symlink());
    assert_eq!(
        std::fs::read(f.root.join("local/image (1).jpg")).unwrap(),
        b"new"
    );
    f.assert_idle().await;
}

#[tokio::test]
async fn invalid_upload_requests_fail_before_copying_and_cycles_leave_no_jobs() {
    let f = Fixture::new(json!({}));
    f.put("/sdcard/file", b"small");
    SESSION
        .scope(f.session.clone(), async {
            assert!(upload::upload_core(
                "FAKE-USB-1",
                vec![],
                "/sdcard",
                "replace",
                f.event_sink()
            )
            .await
            .is_err());
            assert!(upload::upload_core(
                "FAKE-USB-1",
                vec!["relative".into()],
                "not-absolute",
                "replace",
                f.event_sink()
            )
            .await
            .is_err());
            for _ in 0..5 {
                assert_eq!(f.download(&["/sdcard/file"], "replace").await.completed, 1);
                f.assert_idle().await;
            }
        })
        .await;
}

#[tokio::test]
async fn spawn_failure_settles_each_queued_item() {
    let mut f = Fixture::new(json!({}));
    f.session.executable = f.root.join("missing-adb");
    SESSION
        .scope(f.session.clone(), async {
            let r = f.download(&["/sdcard/a", "/sdcard/b"], "replace").await;
            assert_eq!(r.failed, 2);
        })
        .await;
    assert_eq!(
        f.progress()
            .iter()
            .filter(|e| e.status == crate::models::TransferStatus::Failed)
            .count(),
        2
    );
    f.assert_idle().await;
}

#[tokio::test]
async fn late_keep_both_collision_never_overwrites_the_arriving_file() {
    let f = Fixture::new(json!({"hold":true}));
    f.put("/sdcard/image.jpg", &vec![4; 100000]);
    SESSION
        .scope(f.session.clone(), async {
            let arrive = async {
                f.started().await;
                std::fs::write(f.root.join("local/image.jpg"), b"late original").unwrap();
                std::fs::write(f.root.join("release"), b"go").unwrap();
            };
            let (r, ()) = tokio::join!(f.download(&["/sdcard/image.jpg"], "keep-both"), arrive);
            assert_eq!(r.completed, 1);
        })
        .await;
    assert_eq!(
        std::fs::read(f.root.join("local/image.jpg")).unwrap(),
        b"late original"
    );
    assert_eq!(
        std::fs::read(f.root.join("local/image (1).jpg")).unwrap(),
        vec![4; 100000]
    );
    f.assert_idle().await;
}

#[tokio::test]
async fn upload_nested_empty_folder_and_replace_skip_policies() {
    let f = Fixture::new(json!({}));
    let source = f.root.join("tree");
    std::fs::create_dir_all(source.join("empty")).unwrap();
    std::fs::create_dir(source.join("nested")).unwrap();
    std::fs::write(source.join("nested/data"), b"abc").unwrap();
    let image = f.root.join("image.jpg");
    std::fs::write(&image, b"new").unwrap();
    f.put("/sdcard/Download/image.jpg", b"old");
    SESSION
        .scope(f.session.clone(), async {
            let r = upload::upload_core(
                "FAKE-USB-1",
                vec![source.to_string_lossy().into_owned()],
                "/sdcard/Download",
                "keep-both",
                f.event_sink(),
            )
            .await
            .unwrap();
            assert_eq!(r.completed, 1);
            let r = upload::upload_core(
                "FAKE-USB-1",
                vec![image.to_string_lossy().into_owned()],
                "/sdcard/Download",
                "skip",
                f.event_sink(),
            )
            .await
            .unwrap();
            assert_eq!(r.failed, 1);
            assert_eq!(
                std::fs::read(f.root.join("remote/sdcard/Download/image.jpg")).unwrap(),
                b"old"
            );
            let r = upload::upload_core(
                "FAKE-USB-1",
                vec![image.to_string_lossy().into_owned()],
                "/sdcard/Download",
                "replace",
                f.event_sink(),
            )
            .await
            .unwrap();
            assert_eq!(r.completed, 1);
        })
        .await;
    assert!(f.root.join("remote/sdcard/Download/tree/empty").is_dir());
    assert_eq!(
        std::fs::read(f.root.join("remote/sdcard/Download/tree/nested/data")).unwrap(),
        b"abc"
    );
    assert_eq!(
        std::fs::read(f.root.join("remote/sdcard/Download/image.jpg")).unwrap(),
        b"new"
    );
    f.assert_idle().await;
}
