"use client";

import { useMemo, useState } from "react";
import { dayBucketLabel } from "@/lib/format";

export interface ActionEntry {
  id: string;
  description: string;
  txHash: string | null;
  createdAt: string; // ISO
}

interface ActionLogProps {
  entries: ActionEntry[];
}

const PAGE_SIZE = 20;

/**
 * Chronological feed grouped by day. Limits to 20 entries by default with a
 * "Load more" affordance.
 */
export function ActionLog({ entries }: ActionLogProps) {
  const [limit, setLimit] = useState(PAGE_SIZE);

  // Deduplicate consecutive entries with the same description (from repeated simulate clicks).
  const deduped = useMemo(() => {
    const out: ActionEntry[] = [];
    for (const e of entries) {
      if (out.length > 0 && out[out.length - 1].description === e.description && !e.txHash) {
        continue;
      }
      out.push(e);
    }
    return out;
  }, [entries]);

  const visible = useMemo(() => deduped.slice(0, limit), [deduped, limit]);
  const grouped = useMemo(() => groupByDay(visible), [visible]);

  if (entries.length === 0) {
    return (
      <p className="text-sm text-text-muted">
        Your agent is just getting started — check back after your first day.
      </p>
    );
  }

  return (
    <div>
      {grouped.map(({ label, items }, groupIdx) => (
        <section key={label}>
          <h4
            className={`text-xs uppercase tracking-wide text-text-muted ${
              groupIdx === 0 ? "mt-0" : "mt-4"
            } mb-2`}
          >
            {label}
          </h4>
          <ul>
            {items.map((entry) => (
              <li key={entry.id} className="flex items-start gap-2 py-2">
                <span
                  aria-hidden
                  className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-earn"
                />
                <div className="flex-1">
                  <p className="text-sm text-text-primary">
                    {entry.description}
                  </p>
                  {entry.txHash ? (
                    <a
                      href={`https://testnet.arcscan.app/tx/${entry.txHash}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-mono text-accent-earn hover:opacity-80"
                    >
                      <svg
                        viewBox="0 0 12 12"
                        className="h-2.5 w-2.5 shrink-0"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      >
                        <path d="M4.5 1.5H2a.5.5 0 00-.5.5v8a.5.5 0 00.5.5h8a.5.5 0 00.5-.5v-2.5M7 1.5H10.5m0 0V5m0-3.5L5 7" />
                      </svg>
                      {shortHash(entry.txHash)}
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {deduped.length > limit ? (
        <button
          type="button"
          onClick={() => setLimit((n) => n + PAGE_SIZE)}
          className="mt-4 text-sm text-accent-earn underline underline-offset-2 hover:opacity-80"
        >
          Load more
        </button>
      ) : null}
    </div>
  );
}

function shortHash(hash: string): string {
  return `${hash.slice(0, 8)}…${hash.slice(-4)}`;
}

function groupByDay(
  entries: ActionEntry[],
): Array<{ label: string; items: ActionEntry[] }> {
  const buckets = new Map<string, ActionEntry[]>();
  // Preserve descending order.
  for (const entry of entries) {
    const label = dayBucketLabel(entry.createdAt);
    const list = buckets.get(label) ?? [];
    list.push(entry);
    buckets.set(label, list);
  }
  return Array.from(buckets.entries()).map(([label, items]) => ({ label, items }));
}
