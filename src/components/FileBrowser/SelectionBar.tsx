import { formatBytes } from "../../lib/format";
import "./SelectionBar.css";

interface SelectionBarProps {
  selectedCount: number;
  selectedSize: number;
  onDeselectAll: () => void;
  onDownload: () => void;
}

export function SelectionBar({
  selectedCount,
  selectedSize,
  onDeselectAll,
  onDownload,
}: SelectionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="selection-bar">
      <div className="selection-bar-left">
        <div className="selection-count-badge">
          <span className="selection-count">{selectedCount}</span>
        </div>
        <span className="selection-label">
          {selectedCount === 1 ? "file" : "files"} selected
          {selectedSize > 0 && (
            <>
              <span className="selection-dot">·</span>
              <span className="selection-size">{formatBytes(selectedSize)}</span>
            </>
          )}
        </span>
      </div>

      <div className="selection-bar-right">
        <button className="selection-action-btn deselect-btn" onClick={onDeselectAll}>
          <svg
            width="14"
            height="14"
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
          Clear
        </button>
        <button className="selection-action-btn download-btn" onClick={onDownload}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Download
          <kbd className="shortcut-hint">⌘D</kbd>
        </button>
      </div>
    </div>
  );
}
