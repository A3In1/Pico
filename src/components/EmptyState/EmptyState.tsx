import "./EmptyState.css";

interface EmptyStateProps {
  type: "no-device" | "detecting" | "unauthorized" | "error";
  message?: string;
  onSettingsClick?: () => void;
  connectionMode?: "usb" | "wireless";
  onConnectionModeChange?: (mode: "usb" | "wireless") => void;
}

export function EmptyState({ type, message, onSettingsClick, connectionMode = "usb", onConnectionModeChange }: EmptyStateProps) {
  // Determine if the error is about ADB not being found
  const isAdbError = type === "error" && message && (
    message.toLowerCase().includes("adb") ||
    message.toLowerCase().includes("binary not found")
  );

  return (
    <div className="empty-state">
      {onSettingsClick && (
        <button
          className="empty-state-settings"
          onClick={onSettingsClick}
          title="Settings"
        >
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
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06-.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      )}

      {/* USB | Wireless toggle */}
      {onConnectionModeChange && (
        <div className="connection-toggle">
          <button
            className={`connection-toggle-btn ${connectionMode === "usb" ? "active" : ""}`}
            onClick={() => onConnectionModeChange("usb")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 2v11h3v9l7-12h-4l4-8z" />
            </svg>
            USB
          </button>
          <button
            className={`connection-toggle-btn ${connectionMode === "wireless" ? "active" : ""}`}
            onClick={() => onConnectionModeChange("wireless")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.55a11 11 0 0 1 14.08 0" />
              <path d="M1.42 9a16 16 0 0 1 21.16 0" />
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
              <line x1="12" y1="20" x2="12.01" y2="20" />
            </svg>
            Wireless
          </button>
        </div>
      )}

      <div className="empty-state-icon">
        {type === "detecting" && (
          <div className="spinner">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
          </div>
        )}
        {type === "no-device" && (
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
            <line x1="12" y1="18" x2="12.01" y2="18" />
            <path d="M1 12h4M19 12h4" strokeDasharray="2 2" />
          </svg>
        )}
        {type === "unauthorized" && (
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--color-warning)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        )}
        {type === "error" && !isAdbError && (
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--color-error)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        )}
        {type === "error" && isAdbError && (
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--color-error)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
          </svg>
        )}
      </div>

      <div className="empty-state-content">
        <h2 className="empty-state-title">
          {type === "detecting" && "Scanning for devices..."}
          {type === "no-device" && "Connect your Android device"}
          {type === "unauthorized" && "Authorization required"}
          {type === "error" && isAdbError && "ADB not found"}
          {type === "error" && !isAdbError && "Something went wrong"}
        </h2>
        <p className="empty-state-description">
          {type === "detecting" && "Looking for connected Android devices via USB"}
          {type === "no-device" && (
            <div className="instructions-container">
              <p>
                Plug in your Android phone via USB cable.
                <br />
                Make sure <strong>USB Debugging</strong> is enabled in Developer Options.
              </p>
              
              <details className="instruction-manual">
                <summary>How to enable Developer Options?</summary>
                <ol>
                  <li>Open <strong>Settings</strong> on your Android device.</li>
                  <li>Scroll down and tap <strong>About phone</strong>.</li>
                  <li>Find <strong>Build number</strong> (sometimes under Software info).</li>
                  <li>Tap it <strong>7 times</strong> until you see "You are now a developer!".</li>
                  <li>Go back to Settings &gt; <strong>System</strong> &gt; <strong>Developer options</strong>.</li>
                  <li>Toggle on <strong>USB debugging</strong>.</li>
                </ol>
              </details>
            </div>
          )}
          {type === "unauthorized" && (
            <>
              Tap <strong>"Allow"</strong> on the USB debugging prompt on your phone.
              <br />
              Check <strong>"Always allow from this computer"</strong> for convenience.
            </>
          )}
          {type === "error" && isAdbError && (
            <>
              The ADB binary could not be found or is corrupted.
              <br />
              Please reinstall the app or ensure ADB is available on your system.
            </>
          )}
          {type === "error" && !isAdbError && (message || "An unexpected error occurred.")}
        </p>
      </div>
    </div>
  );
}
