/**
 * UI-side formatting helpers. Plain English, no jargon, no compact notation.
 */

const USD_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const USD_FORMATTER_2DP = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

export function formatUsd(amount: number): string {
  return USD_FORMATTER.format(amount);
}

export function formatUsd2(amount: number): string {
  return USD_FORMATTER_2DP.format(amount);
}

export function formatPercent(pct: number, fractionDigits = 0): string {
  return `${pct.toFixed(fractionDigits)}%`;
}

/**
 * Relative-time label tuned for the agent status line.
 * Returns: "just now" | "5 minutes ago" | "3 hours ago" | "yesterday" | "May 11".
 */
export function relativeTime(input: Date | string | number): string {
  const d = input instanceof Date ? input : new Date(input);
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? "" : "s"} ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay === 1) return "yesterday";
  if (diffDay < 7) return `${diffDay} days ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Day-bucket label used to group the Action Log: "Today" / "Yesterday" / "May 9". */
export function dayBucketLabel(input: Date | string | number): string {
  const d = input instanceof Date ? input : new Date(input);
  const today = new Date();
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const diff = Math.round(
    (start(today).getTime() - start(d).getTime()) / 86_400_000,
  );
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
