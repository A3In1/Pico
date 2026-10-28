# Contributing to Pico

First off, thank you for considering contributing to Pico! It's people like you that make open-source software such a great community.

## Setup Your Development Environment

1. **Prerequisites:**
   Ensure you have the latest versions of **Node.js** (v18+) and **Rust** installed on your system. The `adb` binary is bundled in `src-tauri/resources/`.
2. **Clone and Install:**
   ```bash
   git clone https://github.com/A3In1/Pico.git
   cd Pico
   npm install
   ```
3. **Run the App in Dev Mode:**
   ```bash
   npm run tauri dev
   ```

## Code Style Guidelines

- **Frontend (React/TypeScript):**
  - Ensure your code compiles without TypeScript errors (`npm run build`) and tests pass (`npm test`).
  - Use meaningful component names and extract reusable hooks where possible.
  - Prefix boolean variables with `is` or `has` (e.g., `isDrawerOpen`).
- **Backend (Rust):**
  - Run `cargo fmt` before committing.
  - Handle errors gracefully instead of using `.unwrap()` where a failure could crash the application.
  - Document public modules and functions using `///`.

## Branching and Commits

- **Branch Naming:** Create a new branch for your feature or bug fix.
  - Features: `feature/your-feature-name`
  - Bug Fixes: `fix/your-bug-name`
- **Commit Messages:** Try to be descriptive. 
  - Good: `fix: resolve crash when disconnecting wireless device`
  - Bad: `fixed bug`

## Pull Request Process

1. Fork the repository and create your branch from `main`.
2. Make your changes and test them thoroughly with a connected Android device.
3. Add a line under **Unreleased** in `CHANGELOG.md` for user-visible changes.
4. Open a Pull Request with a clear title and description.
5. Maintainers will review your PR and provide feedback or merge it.

Thank you for contributing!
