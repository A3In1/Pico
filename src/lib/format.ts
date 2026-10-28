/** Format bytes to human-readable string */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(i > 1 ? 1 : 0)} ${units[i]}`;
}

/** Format storage as "X.X GB of Y.Y GB" */
export function formatStorage(used: number, total: number): string {
  if (total === 0) return "Unknown";
  return `${formatBytes(used)} of ${formatBytes(total)}`;
}

/** Get storage usage fraction (0-1) */
export function getStorageFraction(used: number, total: number): number {
  if (total === 0) return 0;
  return Math.min(used / total, 1);
}
