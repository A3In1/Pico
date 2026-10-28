import { useEffect, useState } from "react";
import "./ExitWarningDialog.css";

interface ExitWarningDialogProps {
  isOpen: boolean;
  onCancel: () => void;
  onQuit: (dontRemindAgain: boolean) => void;
}

export function ExitWarningDialog({ isOpen, onCancel, onQuit }: ExitWarningDialogProps) {
  const [dontRemindAgain, setDontRemindAgain] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setDontRemindAgain(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="exit-warning-overlay" role="presentation">
      <div
        className="exit-warning-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="exit-warning-title"
      >
        <div className="exit-warning-icon" aria-hidden="true">!</div>
        <h2 id="exit-warning-title">Before you quit</h2>
        <p>
          Turn off USB debugging and Wireless debugging on your Android device
          to improve security and save battery.
        </p>

        <label className="exit-warning-checkbox">
          <input
            type="checkbox"
            checked={dontRemindAgain}
            onChange={(event) => setDontRemindAgain(event.target.checked)}
          />
          <span>Don't remind me again</span>
        </label>

        <div className="exit-warning-actions">
          <button className="exit-warning-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="exit-warning-quit"
            onClick={() => onQuit(dontRemindAgain)}
          >
            Quit
          </button>
        </div>
      </div>
    </div>
  );
}