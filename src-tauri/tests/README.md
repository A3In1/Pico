# Rust tests

All test bodies live outside `src/`:

- `unit/parser.rs` and `unit/filesystem.rs`: seven original helper tests.
- `parser_regression.rs`: former root scratch example, now an assertion-based Cargo integration test.
- `backend/`: new production-code checks grouped into copies, cancellation, connections, progress, previews and shell security. One shared fixture implementation in `support.rs`, with an executable fixture in `fixtures/fake_adb.py`.

Test-only module declarations attach the unit/backend files to their original modules, retaining private-helper access. No production test bodies or duplicated production implementations are needed. Cargo discovers `parser_regression.rs` separately.

```sh
cargo test --offline --manifest-path src-tauri/Cargo.toml
```

The fake-runner tests require Unix/macOS and `python3`. They use operation-scoped executable/environment/events/job registries, real subprocesses, generated temporary trees and finite simulated ADB responses. They never use the user's ADB executable/server or phone. Actual-byte equality and tree checks verify output contents. Real Android shell, USB/Wi-Fi, Finder and native memory profiling are separate acceptance checks.

See `tests/README.md` in the project root for all commands, reports, coverage limits and explicit USB/Wi-Fi skip reasons.
