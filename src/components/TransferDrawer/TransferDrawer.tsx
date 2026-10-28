import type { TransferProgress } from "../../types";
import { ProgressBar } from "./ProgressBar";
import { formatBytes } from "../../lib/format";
import "./TransferDrawer.css";

interface TransferDrawerProps {
  transfers: Map<string, TransferProgress>;
  isOpen: boolean;
  onClose: () => void;
  onCancelOne: (transferId: string) => void;
  onCancelAll: () => void;
  onRetry?: (transferId: string) => void;
}

export function TransferDrawer({
  transfers,
  isOpen,
  onClose,
  onCancelOne,
  onCancelAll,
  onRetry,
}: TransferDrawerProps) {
  if (!isOpen || transfers.size === 0) return null;

  const items = Array.from(transfers.values());
  const completed = items.filter((t) => t.status === "complete").length;
  const failed = items.filter((t) => t.status === "failed").length;
  const cancelled = items.filter((t) => t.status === "cancelled").length;
  const inProgress = items.filter(
    (t) => t.status === "pending" || t.status === "inprogress"
  ).length;
  const totalFiles = items.length;

  // Aggregate speed from in-progress items
  const totalSpeed = items
    .filter((t) => t.status === "inprogress")
    .reduce((sum, t) => sum + t.speed_bytes_per_sec, 0);

  const allDone = inProgress === 0;
  // Equal weight per selected item; folders count as one selected item.
  const overall = items.reduce((sum, t) => sum + (t.status === "complete" ? 100 : t.progress_known ? t.percentage : 0), 0) / totalFiles;
  const overallKnown = allDone || items.some(t => t.progress_known)
    && !items.some(t => t.status === "inprogress" && !t.progress_known);

  return (
    <div className={`transfer-drawer ${isOpen ? "open" : ""}`}>
      {/* Summary header */}
      <div className="transfer-drawer-header">
        <div className="transfer-summary">
          {!allDone && (
            <span className="transfer-summary-text">
              <svg
                className="transfer-icon spinning"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              Transferring {totalFiles} file{totalFiles !== 1 ? "s" : ""} ·{" "}
              {completed} of {totalFiles} complete
              {totalSpeed > 0 && ` · ${formatBytes(totalSpeed)}/s`}
            </span>
          )}
          {allDone && (
            <span className="transfer-summary-text done">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {completed} transferred
              {failed > 0 && `, ${failed} failed`}
              {cancelled > 0 && `, ${cancelled} cancelled`}
            </span>
          )}
        </div>

        <div className="transfer-drawer-actions">
          {!allDone && (
            <button
              className="transfer-action-btn cancel-all-btn"
              onClick={onCancelAll}
            >
              Cancel All
            </button>
          )}
          <button className="transfer-action-btn close-btn" onClick={onClose}>
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
          </button>
        </div>
      </div>

      <div className="transfer-overall-progress">
        <ProgressBar percentage={overall} known={overallKnown} active={!allDone} label="Overall transfer progress by item" />
        <span>{overallKnown ? `${Math.round(overall)}% overall (by item)` : "Preparing transfers…"}</span>
      </div>

      {/* Transfer items */}
      <div className="transfer-items">
        {items.map((transfer) => (
          <TransferItem
            key={transfer.transfer_id}
            transfer={transfer}
            onCancel={() => onCancelOne(transfer.transfer_id)}
            onRetry={onRetry}
          />
        ))}
      </div>
    </div>
  );
}

// ── Transfer Item ──

interface TransferItemProps {
  transfer: TransferProgress;
  onCancel: () => void;
  onRetry?: (transferId: string) => void;
}

function TransferItem({ transfer, onCancel, onRetry }: TransferItemProps) {
  const isActive =
    transfer.status === "pending" || transfer.status === "inprogress";

  return (
    <div className={`transfer-item status-${transfer.status}`}>
      <div className="transfer-item-icon">
        {transfer.status === "complete" && (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-success)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
        {transfer.status === "failed" && (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-error)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        )}
        {transfer.status === "cancelled" && (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text-tertiary)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        )}
        {transfer.status === "pending" && (
          <div className="transfer-pending-dot" />
        )}
        {transfer.status === "inprogress" && (
          <div className="transfer-spinner" />
        )}
      </div>

      <div className="transfer-item-info">
        <div className="transfer-item-name">{transfer.direction === "upload" ? "↑" : "↓"} {transfer.context.preview ? "Preview: " : ""}{transfer.file_name}</div>
        <div className="transfer-item-progress">
          <ProgressBar percentage={transfer.percentage} known={transfer.progress_known} active={isActive}
            label={`${transfer.context.preview ? "Preview download" : transfer.direction === "upload" ? "Upload" : "Download"}: ${transfer.file_name}`} />
          <span className="transfer-progress-text">
            {transfer.status === "pending" ? "Preparing…" : transfer.progress_known ? `${transfer.percentage}%` : isActive ? "Transferring…" : "Stopped"}
            {transfer.status !== "pending" && (transfer.total_known
              ? ` · ${transfer.bytes_estimated ? "≈" : ""}${formatBytes(transfer.bytes_transferred)} / ${formatBytes(transfer.total_bytes)}${isActive ? ` · ${transfer.bytes_estimated ? "≈" : ""}${formatBytes(Math.max(0, transfer.total_bytes - transfer.bytes_transferred))} left` : ""}`
              : transfer.bytes_transferred > 0 ? ` · ${formatBytes(transfer.bytes_transferred)} copied` : "")}
            {isActive && transfer.speed_bytes_per_sec > 0 && ` · ${transfer.bytes_estimated ? "≈" : ""}${formatBytes(transfer.speed_bytes_per_sec)}/s`}
            {isActive && transfer.eta_seconds !== null && transfer.eta_seconds > 0 && ` · ~${transfer.eta_seconds}s left`}
          </span>
        </div>
        {transfer.status === "failed" && transfer.error && (
          <span className="transfer-item-error">{transfer.error}</span>
        )}
      </div>

      {transfer.status === "inprogress" && (
        <button className="transfer-cancel-btn" onClick={onCancel} title="Cancel">
          <svg
            width="12"
            height="12"
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
      )}
      
      {transfer.status === "failed" && onRetry && (
        <button 
          className="transfer-cancel-btn" 
          onClick={() => onRetry(transfer.transfer_id)} 
          title="Retry"
          style={{ color: "var(--accent)", border: "1px solid var(--accent-subtle)", borderRadius: 4, padding: "2px 6px", fontSize: 11, fontWeight: 600, width: "auto", height: "auto" }}
        >
          Retry
        </button>
      )}
    </div>
  );
}
