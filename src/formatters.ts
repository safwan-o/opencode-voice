export function formatBytes(value: number): string {
  if (!value || value < 0) return "0 MB";
  if (value >= 1024 * 1024 * 1024) return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
  return `${Math.max(1, Math.round(value / 1024 / 1024))} MB`;
}

export function formatRate(bytesPerSecond: number): string {
  if (!bytesPerSecond || bytesPerSecond < 1) return "warming up";
  if (bytesPerSecond >= 1024 * 1024) return `${(bytesPerSecond / 1024 / 1024).toFixed(1)} MB/s`;
  return `${Math.max(1, Math.round(bytesPerSecond / 1024))} KB/s`;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 1) return "calculating";
  const total = Math.ceil(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  if (!minutes) return `${rest}s`;
  return `${minutes}m ${String(rest).padStart(2, "0")}s`;
}

export function progressBar(percent: number): string {
  const total = 34;
  const filled = Math.max(0, Math.min(total, Math.round((percent / 100) * total)));
  return `${"█".repeat(filled)}${"░".repeat(total - filled)}`;
}

export function progressLine(percent: number): string {
  return `${progressBar(percent)}  ${String(Math.round(percent)).padStart(3, " ")}%`;
}
