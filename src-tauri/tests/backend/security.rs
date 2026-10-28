use super::*;

#[test]
fn quoted_paths_are_literal_in_a_real_shell() {
    let fixture = Fixture::new(json!({}));
    for value in [
        "",
        "plain",
        "a b",
        "quo'te",
        "中文.jpg",
        "a\nb",
        "; touch marker",
        "$(touch marker)",
        "`touch marker`",
    ] {
        let quote = quote_shell_arg(value).unwrap();
        let out = std::process::Command::new("/bin/sh")
            .current_dir(&fixture.root)
            .args(["-c", &format!("printf %s {quote}")])
            .output()
            .unwrap();
        assert!(out.status.success());
        assert_eq!(out.stdout, value.as_bytes());
    }
    assert!(quote_shell_arg("a\0b").is_err());
    assert!(!fixture.root.join("marker").exists());
}
