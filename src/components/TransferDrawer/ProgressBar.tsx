interface ProgressBarProps {
  percentage: number;
  known: boolean;
  active: boolean;
  label: string;
}

export function ProgressBar({ percentage, known, active, label }: ProgressBarProps) {
  const determinate = known && Number.isFinite(percentage);
  const value = Math.max(0, Math.min(100, percentage));
  return (
    <div
      className={`transfer-progress-bar ${!determinate && active ? "is-indeterminate" : ""}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={determinate ? value : undefined}
      aria-valuetext={determinate ? `${Math.round(value)}%` : active ? "Preparing or transferring" : "Stopped"}
    >
      <div className="transfer-progress-fill" style={determinate ? { width: `${value}%` } : undefined} />
    </div>
  );
}
