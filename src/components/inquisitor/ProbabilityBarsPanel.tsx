"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  AXIS_LABELS,
  AXIS_TITLES,
  axesProbedByQuestions,
  type AxisDistribution,
  type AxisName,
} from "@/lib/inquisitor";

interface ProbabilityBarsPanelProps {
  distribution: AxisDistribution;
  reasoning?: string;
  asked?: number;
  /** Question ids already answered — used to hide unprobed / noisy axes. */
  askedIds?: string[];
}

/** Sidebar axes only — capital amount is chosen on /strategy, not inferred here. */
const SIDEBAR_AXES: AxisName[] = [
  "goal_type",
  "risk_tolerance",
  "horizon",
  "liquidity",
  "crypto_fluency",
];

/** Minimum lead before we show an axis at all. */
const MIN_LEAD_PCT = 30;
/** Lead must beat second place by at least this much to show the axis. */
const MIN_LEAD_MARGIN = 12;

export function ProbabilityBarsPanel({
  distribution,
  reasoning,
  asked = 0,
  askedIds = [],
}: ProbabilityBarsPanelProps) {
  const probed = useMemo(() => axesProbedByQuestions(askedIds), [askedIds]);

  const visibleAxes = SIDEBAR_AXES.map((axis) => {
    const entries = topEntries(distribution, axis);
    const leadPct = entries[0]?.pct ?? 0;
    const secondPct = entries[1]?.pct ?? 0;
    return { axis, entries, leadPct, margin: leadPct - secondPct };
  }).filter(({ axis, leadPct, margin, entries }) => {
    if (!probed.has(axis)) return false;
    if (entries.length === 0) return false;
    if (leadPct < MIN_LEAD_PCT) return false;
    if (entries.length > 1 && margin < MIN_LEAD_MARGIN) return false;
    return true;
  }).map(({ axis, entries, leadPct, margin }) => ({
    axis,
    entries: entries.length > 1 && margin < MIN_LEAD_MARGIN ? entries.slice(0, 1) : entries.slice(0, 2),
    leadPct,
  }));

  const headline =
    asked === 0
      ? "Just getting started…"
      : asked < 3
        ? "Learning your preferences"
        : asked < 6
          ? "Profile taking shape"
          : "Almost there";

  return (
    <aside
      className="fixed right-0 top-14 z-30 hidden h-[calc(100dvh-3.5rem)] w-64 overflow-y-auto border-l border-border/60 bg-bg-base/95 backdrop-blur-sm lg:block xl:w-72"
      aria-label="What Stakinator knows so far"
    >
      <div className="flex h-full flex-col p-4">
        <header className="mb-4 shrink-0">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-accent-earn">
            Live profile
          </p>
          <h2 className="mt-1 font-display text-base text-text-primary">
            What I know so far
          </h2>
          <p className="mt-1 text-xs text-text-muted">{headline}</p>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-0.5">
          {visibleAxes.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border bg-bg-surface/80 px-3 py-4 text-xs leading-relaxed text-text-muted">
              Answer a few more questions and I&apos;ll start showing what I&apos;m
              learning about you.
            </p>
          ) : (
            visibleAxes.map(({ axis, entries }) => (
              <AxisCard key={axis} axis={axis} entries={entries} />
            ))
          )}
        </div>

        {reasoning ? (
          <div className="mt-4 shrink-0 rounded-xl border border-border/80 bg-bg-surface px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
              Why this question
            </p>
            <p className="mt-1 text-xs leading-relaxed text-text-muted">
              {reasoning}
            </p>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function topEntries(
  distribution: AxisDistribution,
  axis: AxisName,
): Array<{ bucket: string; label: string; pct: number }> {
  const dist = distribution[axis] as Record<string, number>;
  const labels = AXIS_LABELS[axis] as Record<string, string>;
  return Object.entries(dist)
    .map(([bucket, value]) => ({
      bucket,
      label: labels[bucket] ?? bucket,
      pct: Math.round(value * 100),
    }))
    .sort((a, b) => b.pct - a.pct)
    .filter((e) => e.pct >= 8);
}

function AxisCard({
  axis,
  entries,
}: {
  axis: AxisName;
  entries: Array<{ bucket: string; label: string; pct: number }>;
}) {
  const lead = entries[0]?.pct ?? 0;

  return (
    <section className="rounded-xl border border-border/70 bg-bg-surface/60 px-3 py-2.5">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
          {AXIS_TITLES[axis]}
        </h3>
        {lead >= 40 ? (
          <span className="rounded-full bg-accent-earn/10 px-1.5 py-0.5 text-[9px] font-medium text-accent-earn">
            clear
          </span>
        ) : null}
      </div>
      <div className="space-y-2">
        {entries.map(({ bucket, label, pct }, idx) => (
          <div key={bucket}>
            <div className="flex items-baseline justify-between gap-2">
              <span
                className={`truncate text-xs ${
                  idx === 0 ? "font-medium text-text-primary" : "text-text-muted"
                }`}
              >
                {label}
              </span>
              <span className="num shrink-0 text-[10px] text-text-muted">{pct}%</span>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-bg-elevated">
              <motion.div
                layout
                className={`h-full rounded-full ${idx === 0 ? "bg-accent-earn" : "bg-accent-earn/35"}`}
                initial={false}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.35, ease: "easeOut" }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
