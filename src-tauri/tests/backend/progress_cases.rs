use super::*;

#[tokio::test]
async fn sampling_reports_actual_bytes_without_adb_percentages() {
    let f = Fixture::new(json!({"hold":true,"silent_progress":true}));
    f.put("/sdcard/large", &vec![3; 200000]);
    SESSION
        .scope(f.session.clone(), async {
            let release = async {
                f.started().await;
                tokio::time::timeout(Duration::from_secs(5), async {
                    while !f.progress().iter().any(|e| {
                        e.bytes_transferred == 65536 && e.percentage > 0 && !e.bytes_estimated
                    }) {
                        tokio::time::sleep(Duration::from_millis(10)).await;
                    }
                })
                .await
                .expect("sampler did not publish actual written bytes");
                std::fs::write(f.root.join("release"), b"go").unwrap();
            };
            let (r, ()) = tokio::join!(f.download(&["/sdcard/large"], "replace"), release);
            assert_eq!(r.completed, 1);
        })
        .await;
    f.assert_idle().await;
}

#[test]
fn progress_parsers_accept_completion_and_reject_diagnostics() {
    assert_eq!(
        parser::parse_pull_progress_line("[ 45%] /sdcard/a b.jpg")
            .unwrap()
            .percentage,
        45
    );
    assert!(parser::parse_pull_progress_line("adb: error: offline").is_none());
    let done = parser::parse_pull_complete_line(
        "/sdcard/a.jpg: 1 file pulled, 0 skipped. 45.2 MB/s (4194304 bytes in 0.088s)",
    )
    .unwrap();
    assert_eq!(done.bytes_transferred, Some(4194304));
    assert_eq!(done.elapsed_seconds, Some(0.088));
}
