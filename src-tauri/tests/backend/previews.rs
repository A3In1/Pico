use super::*;

#[tokio::test]
async fn preview_target_is_marked_and_finder_promised_name_is_validated() {
    let f = Fixture::new(json!({}));
    f.put("/sdcard/image.jpg", b"image");
    SESSION
        .scope(f.session.clone(), async {
            for bad in ["../escape", "/absolute", ".", "..", "nul\0"] {
                let r = transfer::download_core(
                    "FAKE-USB-1",
                    vec!["/sdcard/image.jpg".into()],
                    &f.local(),
                    "replace",
                    transfer::DownloadTarget {
                        name: Some(bad),
                        preview: false,
                    },
                    f.event_sink(),
                    Arc::new(transfer::BatchGuard::new()),
                )
                .await;
                assert!(r.is_err(), "accepted {bad:?}");
            }
            let r = transfer::download_core(
                "FAKE-USB-1",
                vec!["/sdcard/image.jpg".into()],
                &f.local(),
                "replace",
                transfer::DownloadTarget {
                    name: Some("renamed.jpg"),
                    preview: true,
                },
                f.event_sink(),
                Arc::new(transfer::BatchGuard::new()),
            )
            .await
            .unwrap();
            assert_eq!(r.completed, 1);
        })
        .await;
    assert_eq!(
        std::fs::read(f.root.join("local/renamed.jpg")).unwrap(),
        b"image"
    );
    assert!(
        f.progress()
            .iter()
            .all(|e| e.context.preview
                && e.context.destination_name.as_deref() == Some("renamed.jpg"))
    );
    f.assert_idle().await;
}

#[tokio::test]
async fn concurrent_same_name_previews_open_complete_unique_files() {
    let f = Fixture::new(json!({}));
    f.put("/sdcard/a/image.jpg", b"first");
    f.put("/sdcard/b/image.jpg", b"second");
    let opened = Mutex::new(Vec::new());
    let base = f.root.join("previews");
    SESSION
        .scope(f.session.clone(), async {
            let one = crate::commands::transfer_commands::preview_core(
                "FAKE-USB-1",
                "/sdcard/a/image.jpg".into(),
                &base,
                f.event_sink(),
                |p| {
                    assert_eq!(std::fs::read(p).unwrap(), b"first");
                    opened.lock().unwrap().push(p.to_path_buf());
                    Ok(())
                },
            );
            let two = crate::commands::transfer_commands::preview_core(
                "FAKE-USB-1",
                "/sdcard/b/image.jpg".into(),
                &base,
                f.event_sink(),
                |p| {
                    assert_eq!(std::fs::read(p).unwrap(), b"second");
                    opened.lock().unwrap().push(p.to_path_buf());
                    Ok(())
                },
            );
            let (a, b) = tokio::join!(one, two);
            a.unwrap();
            b.unwrap();
        })
        .await;
    {
        let paths = opened.lock().unwrap();
        assert_eq!(paths.len(), 2);
        assert_ne!(paths[0], paths[1]);
    }
    assert!(f.progress().iter().all(|e| e.context.preview));
    f.assert_idle().await;
}

#[tokio::test]
async fn failed_preview_cleans_its_folder_and_never_opens_viewer() {
    let f = Fixture::new(json!({"partial_error":"Permission denied"}));
    f.put("/sdcard/image.jpg", b"image");
    let base = f.root.join("previews");
    SESSION
        .scope(f.session.clone(), async {
            let r = crate::commands::transfer_commands::preview_core(
                "FAKE-USB-1",
                "/sdcard/image.jpg".into(),
                &base,
                f.event_sink(),
                |_| panic!("opened failed download"),
            )
            .await;
            assert!(r.is_err());
        })
        .await;
    assert_eq!(std::fs::read_dir(base).unwrap().count(), 0);
    f.assert_idle().await;
}

#[tokio::test]
async fn native_opener_failure_is_returned_without_touching_other_previews() {
    let f = Fixture::new(json!({}));
    f.put("/sdcard/image.jpg", b"image");
    let base = f.root.join("previews");
    std::fs::create_dir_all(base.join("existing")).unwrap();
    std::fs::write(base.join("existing/image.jpg"), b"existing preview").unwrap();
    SESSION
        .scope(f.session.clone(), async {
            let error = crate::commands::transfer_commands::preview_core(
                "FAKE-USB-1",
                "/sdcard/image.jpg".into(),
                &base,
                f.event_sink(),
                |_| Err("viewer spawn failed".into()),
            )
            .await
            .unwrap_err();
            assert_eq!(error, "viewer spawn failed");
        })
        .await;
    assert_eq!(
        std::fs::read(base.join("existing/image.jpg")).unwrap(),
        b"existing preview"
    );
    f.assert_idle().await;
}
