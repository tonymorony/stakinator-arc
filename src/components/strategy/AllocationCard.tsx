"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { type Allocation } from "@/lib/ai/allocation";
import { formatUsd } from "@/lib/format";
import { PlanExplanation } from "./PlanExplanation";
import { TokenIcon, strategyBucketToken } from "@/components/TokenIcon";

const SLIDER_MIN = 1_000;
const SLIDER_MAX = 500_000;
const SLIDER_STEP = 500;

/** Ready-cash earning rate (Aave v3 USDC supply, Ethereum mainnet). */
const USDC_APY = 3.44;

interface AllocationCardProps {
  allocation: Allocation;
  capital: number;
  apy: number;
  annualEarnings: number;
  explanation?: string;
  planSource?: "llm" | "fallback";
  onExecute: () => void;
  onAdjustProfile: () => void;
  executeLabel?: string;
  executing?: boolean;
}

interface BucketSpec {
  key: "safe" | "liquid" | "growth";
  name: string;
  pct: number;
  yieldPct?: number;
  comingSoon?: boolean;
}

export function AllocationCard({
  allocation,
  capital: initialCapital,
  apy,
  explanation,
  planSource,
  onExecute,
  onAdjustProfile,
  executeLabel = "Put this plan into action →",
  executing,
}: AllocationCardProps) {
  const [capital, setCapital] = useState(
    Math.min(SLIDER_MAX, Math.max(SLIDER_MIN, initialCapital || SLIDER_MIN)),
  );

  const annualEarnings = useMemo(
    () =>
      capital * (allocation.usycPct / 100) * (apy / 100) +
      capital * (allocation.liquidPct / 100) * (USDC_APY / 100),
    [capital, allocation.usycPct, allocation.liquidPct, apy],
  );

  const buckets: BucketSpec[] = [
    {
      key: "safe",
      name: "Safe Treasury Fund",
      pct: allocation.usycPct,
      yieldPct: apy,
    },
  ];
  if (allocation.liquidPct > 0) {
    buckets.push({
      key: "liquid",
      name: "Ready cash",
      pct: allocation.liquidPct,
      yieldPct: USDC_APY,
    });
  }
  if (allocation.growthPct > 0) {
    buckets.push({
      key: "growth",
      name: "Tokenized stock funds",
      pct: allocation.growthPct,
      comingSoon: true,
    });
  }
  const visibleBuckets = buckets.filter((b) => b.pct > 0);

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="rounded-2xl border border-border bg-bg-base p-5 shadow-[0_10px_40px_-12px_rgba(74,159,255,0.18)]"
    >
      <div className="mb-4">
        <h2 className="font-display text-xl text-text-primary">Your plan</h2>
        {explanation ? (
          <PlanExplanation text={explanation} source={planSource} />
        ) : null}
      </div>

      <div className="mb-4 rounded-xl border border-border bg-bg-surface px-3 py-2.5">
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-[11px] uppercase tracking-wide text-text-muted">If you put in</span>
          <span className="num font-semibold text-text-primary">{formatUsd(capital)}</span>
        </div>
        <input
          type="range"
          min={SLIDER_MIN}
          max={SLIDER_MAX}
          step={SLIDER_STEP}
          value={capital}
          onChange={(e) => setCapital(Number(e.target.value))}
          className="w-full accent-accent-earn"
          aria-label="Investment amount"
        />
      </div>

      <ul className="space-y-2">
        {visibleBuckets.map((bucket) => (
          <BucketRow key={bucket.key} bucket={bucket} capital={capital} />
        ))}
      </ul>

      {allocation.growthPct === 0 ? <ComingSoonTeaser /> : null}

      <div className="mt-4 rounded-xl bg-status-success/10 px-3 py-2.5 text-center">
        <p className="text-[11px] uppercase tracking-wide text-text-muted">Estimated per year</p>
        <p className="num text-2xl font-semibold text-status-success">
          {formatUsd(annualEarnings)}
        </p>
        {allocation.growthPct > 0 ? (
          <p className="mt-1 text-[11px] text-text-muted">
            From safe &amp; ready-cash buckets — stock funds not included yet
          </p>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onExecute}
        disabled={executing}
        className="mt-4 w-full rounded-full bg-accent-earn py-3 font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
      >
        {executing ? "Working on it…" : executeLabel}
      </button>

      <button
        type="button"
        onClick={onAdjustProfile}
        className="mt-2 block w-full text-center text-sm text-text-muted transition-colors hover:text-text-primary"
      >
        Adjust my profile ↺
      </button>
    </motion.section>
  );
}

function BucketRow({
  bucket,
  capital,
}: {
  bucket: BucketSpec;
  capital: number;
}) {
  const dollars = capital * (bucket.pct / 100);
  const token = strategyBucketToken(bucket.key);

  return (
    <li
      className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
        bucket.comingSoon
          ? "border-dashed border-accent-launch/30 bg-accent-launch/5"
          : "border-border/60 bg-bg-surface/50"
      }`}
    >
      {token ? <TokenIcon token={token} size={36} /> : null}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-sm font-medium text-text-primary">{bucket.name}</span>
          {bucket.comingSoon ? (
            <span className="rounded-full bg-accent-launch/15 px-1.5 py-0.5 text-[10px] font-medium text-accent-launch">
              Coming soon
            </span>
          ) : bucket.yieldPct ? (
            <span className="rounded-full bg-status-success/10 px-1.5 py-0.5 text-[10px] text-status-success">
              {bucket.yieldPct.toFixed(1)}%/yr
            </span>
          ) : null}
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-bg-elevated">
          <motion.div
            className={`h-full rounded-full ${bucket.comingSoon ? "bg-accent-launch/50" : "bg-accent-earn"}`}
            initial={{ width: 0 }}
            animate={{ width: `${bucket.pct}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        </div>
        {bucket.comingSoon ? (
          <p className="mt-1.5 text-[11px] leading-relaxed text-text-muted">
            Held as ready cash for now — will move into stock funds when they launch on Arc
          </p>
        ) : null}
      </div>

      <div className="shrink-0 text-right">
        <div className="num text-sm font-semibold text-text-primary">{formatUsd(dollars)}</div>
        <div className="num text-[10px] text-text-muted">{bucket.pct}%</div>
      </div>
    </li>
  );
}

function ComingSoonTeaser() {
  return (
    <div className="mt-3 rounded-lg border border-dashed border-accent-launch/30 bg-accent-launch/5 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-text-primary">Tokenized stock funds</span>
        <span className="rounded-full bg-accent-launch/15 px-1.5 py-0.5 text-[10px] font-medium text-accent-launch">
          Coming soon
        </span>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-text-muted">
        Circle is bringing tokenized equities to Arc — your agent will add them to
        growth profiles when they go live.
      </p>
    </div>
  );
}
