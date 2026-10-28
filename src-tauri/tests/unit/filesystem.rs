use super::*;

#[test]
fn test_parse_ls_output() {
    let output = "total 24\ndrwxrwx--x  2 root sdcard_rw 4096 2024-03-01 10:30 Camera\n-rw-rw----  1 root sdcard_rw 4194304 2024-03-01 10:30 IMG_001.jpg\nlrwxrwxrwx  1 root root 21 2024-01-01 00:00 self -> /storage/emulated/0\n";
    let entries = parse_ls_output(output, "/sdcard/DCIM");
    assert_eq!(entries.len(), 3);
    assert!(entries[0].is_directory);
    assert_eq!(entries[0].name, "Camera");
    assert_eq!(entries[0].path, "/sdcard/DCIM/Camera");
    // Symlink should use basename, not target path
    let self_entry = entries.iter().find(|e| e.name == "self").unwrap();
    assert_eq!(self_entry.path, "/sdcard/DCIM/self");
}

#[test]
fn test_normalize_path() {
    assert_eq!(normalize_path("/sdcard//DCIM"), "/sdcard/DCIM");
    assert_eq!(normalize_path("/sdcard/"), "/sdcard");
    assert_eq!(normalize_path("/sdcard//sdcard"), "/sdcard/sdcard");
    assert_eq!(normalize_path("/"), "/");
}

#[test]
fn test_classify_file_type() {
    assert_eq!(classify_file_type("photo.jpg", false), "image");
    assert_eq!(classify_file_type("video.mp4", false), "video");
    assert_eq!(classify_file_type("song.mp3", false), "audio");
    assert_eq!(classify_file_type("readme.pdf", false), "document");
    assert_eq!(classify_file_type("backup.zip", false), "archive");
    assert_eq!(classify_file_type("app.apk", false), "apk");
    assert_eq!(classify_file_type("random.xyz", false), "other");
    assert_eq!(classify_file_type("Camera", true), "folder");
}
