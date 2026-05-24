"use client";

import { AnimatedNumber } from "./AnimatedNumber";
import { TokenIcon, bucketToken } from "@/components/TokenIcon";
import { formatUsd } from "@/lib/format";

export interface BucketView {
  key: "safe" | "liquid" | "euro" | "growth";
  name: string;
  amountUsdc: number;
  percentage: number;
  yieldPct?: number;
  comingSoon?: boolean;
}

interface BucketBreakdownProps {
  buckets: BucketView[];
}

export function BucketBreakdown({ buckets }: BucketBreakdownProps) {
  const visible = buckets.filter((b) => b.amountUsdc > 0);
  if (visible.length === 0) return null;

  return (
    <ul className="space-y-3">
      {visible.map((b) => (
        <BucketCard key={b.key} bucket={b} />
      ))}
    </ul>
  );
}

function BucketCard({ bucket }: { bucket: BucketView }) {
  const soon = bucket.comingSoon ?? bucket.key === "growth";

  return (
    <li
      className={`flex items-center gap-3 rounded-xl border p-4 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${
        soon
          ? "border-dashed border-accent-launch/30 bg-accent-launch/5 hover:border-accent-launch/40"
          : "border-border bg-bg-base hover:border-accent-earn/40"
      }`}
    >
      <BucketTokenLogo bucketKey={bucket.key} />
      <div className="flex flex-1 items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <p className="font-medium text-text-primary">{bucket.name}</p>
            {soon ? (
              <span className="rounded-full bg-accent-launch/15 px-1.5 py-0.5 text-[10px] font-medium text-accent-launch">
                Coming soon
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-text-muted">
            {TOKEN_TICKER[bucket.key]}
          </p>
          {soon ? (
            <p className="mt-1 text-[11px] leading-relaxed text-text-muted">
              Held as ready cash for now — will move into stock funds when they launch on Arc
            </p>
          ) : bucket.yieldPct ? (
            <p className="mt-0.5 text-xs text-status-success">
              Earning ~{bucket.yieldPct.toFixed(1)}% APY
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-text-muted">Available anytime</p>
          )}
        </div>
        <div className="text-right">
          <span className="num block font-semibold text-text-primary">
            <AnimatedNumber value={bucket.amountUsdc} format={formatUsd} />
          </span>
          <span className="num text-sm text-text-muted">
            <AnimatedNumber
              value={bucket.percentage}
              format={(v) => `${Math.round(v)}%`}
            />
          </span>
        </div>
      </div>
    </li>
  );
}

// ─── Token logo badges ────────────────────────────────────────────────────────

const TOKEN_TICKER: Record<BucketView["key"], string> = {
  safe: "USYC · Hashnote",
  liquid: "USDC · Circle",
  euro: "EURC · Circle",
  growth: "Tokenized stocks · Circle",
};

function BucketTokenLogo({ bucketKey }: { bucketKey: BucketView["key"] }) {
  const token = bucketToken(bucketKey);
  if (!token) {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bg-surface">
        <span className="text-sm font-bold text-text-muted">$</span>
      </div>
    );
  }
  return <TokenIcon token={token} size={40} />;
}
