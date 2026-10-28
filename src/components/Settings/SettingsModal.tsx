import { useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { Theme, ConflictHandling } from "../../hooks/useSettings";
import "./SettingsModal.css";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  downloadLocation: string;
  onDownloadLocationChange: (path: string) => void;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  conflictHandling: ConflictHandling;
  onConflictHandlingChange: (handling: ConflictHandling) => void;
  remindBeforeQuit: boolean;
  onRemindBeforeQuitChange: (remind: boolean) => void;
}

export function SettingsModal({
  isOpen,
  onClose,
  downloadLocation,
  onDownloadLocationChange,
  theme,
  onThemeChange,
  conflictHandling,
  onConflictHandlingChange,
  remindBeforeQuit,
  onRemindBeforeQuitChange,
}: SettingsModalProps) {
  const handlePickFolder = useCallback(async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Choose download location",
      });

      if (selected && typeof selected === "string") {
        onDownloadLocationChange(selected);
      }
    } catch (e) {
      console.error("Folder picker error:", e);
    }
  }, [onDownloadLocationChange]);

  if (!isOpen) return null;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="settings-header">
          <h2 className="settings-title">Settings</h2>
          <button className="settings-close-btn" onClick={onClose}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="settings-body">
          {/* Download Location */}
          <div className="settings-section">
            <label className="settings-label">Download Location</label>
            <p className="settings-description">
              Files will be downloaded to this folder on your Mac.
            </p>
            <div className="settings-path-row">
              <div className="settings-path-display">
                <svg
                  className="settings-path-icon"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                <span className="settings-path-text">{displayPath(downloadLocation)}</span>
              </div>
              <button className="settings-change-btn" onClick={handlePickFolder}>
                Change
              </button>
            </div>
          </div>

          {/* Theme */}
          <div className="settings-section">
            <label className="settings-label">Theme</label>
            <p className="settings-description">
              Choose how the app looks. System follows your macOS preference.
            </p>
            <div className="theme-options">
              <ThemeOption
                value="system"
                label="System"
                icon={
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                }
                isActive={theme === "system"}
                onClick={() => onThemeChange("system")}
              />
              <ThemeOption
                value="dark"
                label="Dark"
                icon={
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                  </svg>
                }
                isActive={theme === "dark"}
                onClick={() => onThemeChange("dark")}
              />
              <ThemeOption
                value="light"
                label="Light"
                icon={
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="5" />
                    <line x1="12" y1="1" x2="12" y2="3" />
                    <line x1="12" y1="21" x2="12" y2="23" />
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                    <line x1="1" y1="12" x2="3" y2="12" />
                    <line x1="21" y1="12" x2="23" y2="12" />
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                  </svg>
                }
                isActive={theme === "light"}
                onClick={() => onThemeChange("light")}
              />
            </div>
          </div>

          {/* File conflicts */}
          <div className="settings-section">
            <label className="settings-label">File Conflicts</label>
            <p className="settings-description">
              What to do when a file with the same name already exists.
            </p>
            <div className="theme-options conflict-options">
              <ThemeOption
                value="ask"
                label="Ask"
                icon={
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                }
                isActive={conflictHandling === "ask"}
                onClick={() => onConflictHandlingChange("ask")}
              />
              <ThemeOption
                value="keep-both"
                label="Keep Both"
                icon={
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                }
                isActive={conflictHandling === "keep-both"}
                onClick={() => onConflictHandlingChange("keep-both")}
              />
              <ThemeOption
                value="replace"
                label="Replace"
                icon={
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 4 23 10 17 10" />
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                  </svg>
                }
                isActive={conflictHandling === "replace"}
                onClick={() => onConflictHandlingChange("replace")}
              />
              <ThemeOption
                value="skip"
                label="Skip"
                icon={
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="5 4 15 12 5 20 5 4" />
                    <line x1="19" y1="5" x2="19" y2="19" />
                  </svg>
                }
                isActive={conflictHandling === "skip"}
                onClick={() => onConflictHandlingChange("skip")}
              />
            </div>
          </div>

          {/* Quit reminder */}
          <div className="settings-section">
            <label className="settings-label">Quit Reminder</label>
            <p className="settings-description">
              Remind me to turn off USB and Wireless debugging before quitting.
            </p>
            <label className="settings-checkbox-row">
              <input
                type="checkbox"
                checked={remindBeforeQuit}
                onChange={(event) => onRemindBeforeQuitChange(event.target.checked)}
              />
              <span>Remind me before quitting</span>
            </label>
          </div>

          {/* Keyboard shortcuts reference */}
          <div className="settings-section">
            <label className="settings-label">Keyboard Shortcuts</label>
            <div className="shortcuts-grid">
              <ShortcutRow action="Select All" shortcut="⌘A" />
              <ShortcutRow action="Deselect All" shortcut="Esc" />
              <ShortcutRow action="Download Selected" shortcut="⌘D" />
              <ShortcutRow action="Navigate Back" shortcut="⌘[" />
              <ShortcutRow action="Navigate Forward" shortcut="⌘]" />
              <ShortcutRow action="Go to Parent" shortcut="⌘↑" />
              <ShortcutRow action="Open Folder" shortcut="Enter" />
              <ShortcutRow action="Refresh" shortcut="⌘R" />
              <ShortcutRow action="Search / Filter" shortcut="⌘F" />
              <ShortcutRow action="Toggle Sidebar" shortcut="⌘\" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ──

function displayPath(path: string): string {
  // Shorten home directory to ~
  const home = "/Users/";
  if (path.startsWith(home)) {
    const after = path.slice(home.length);
    const slash = after.indexOf("/");
    if (slash >= 0) {
      return "~" + after.slice(slash);
    }
    return "~";
  }
  return path;
}

function ThemeOption({
  label,
  icon,
  isActive,
  onClick,
}: {
  value: string;
  label: string;
  icon: React.ReactNode;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`theme-option ${isActive ? "active" : ""}`}
      onClick={onClick}
    >
      <span className="theme-option-icon">{icon}</span>
      <span className="theme-option-label">{label}</span>
    </button>
  );
}

function ShortcutRow({ action, shortcut }: { action: string; shortcut: string }) {
  return (
    <div className="shortcut-row">
      <span className="shortcut-action">{action}</span>
      <kbd className="shortcut-key">{shortcut}</kbd>
    </div>
  );
}
