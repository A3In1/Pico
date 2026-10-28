import type { ConflictHandling } from "../../hooks/useSettings";
import "./SettingsModal.css";

interface ConflictDialogProps {
  isOpen: boolean;
  fileNames: string[];
  onChoose: (handling: Exclude<ConflictHandling, "ask">) => void;
  onCancel: () => void;
}

export function ConflictDialog({
  isOpen,
  fileNames,
  onChoose,
  onCancel,
}: ConflictDialogProps) {
  if (!isOpen) return null;

  const extra = fileNames.length - 5;
  const shown = fileNames.slice(0, 5);

  return (
    <div className="settings-overlay" onClick={onCancel}>
      <div className="settings-modal conflict-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2 className="settings-title">Files already exist</h2>
          <button className="settings-close-btn" onClick={onCancel}>
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

        <div className="settings-body">
          <div className="settings-section">
            <p className="settings-description">
              {fileNames.length === 1
                ? "This file already exists in the destination folder."
                : `${fileNames.length} files already exist in the destination folder.`}
            </p>
            <div className="conflict-file-list">
              {shown.map((name, index) => (
                <div key={`${name}-${index}`} className="conflict-file-name">
                  {name}
                </div>
              ))}
              {extra > 0 && (
                <div className="conflict-file-more">+{extra} more</div>
              )}
            </div>
          </div>

          <div className="conflict-actions">
            <button
              className="settings-change-btn"
              onClick={() => onChoose("keep-both")}
            >
              Keep Both
            </button>
            <button
              className="settings-change-btn"
              onClick={() => onChoose("skip")}
            >
              Skip
            </button>
            <button
              className="conflict-replace-btn"
              onClick={() => onChoose("replace")}
            >
              Replace
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
