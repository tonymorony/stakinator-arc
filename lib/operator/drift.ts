/**
 * Loop drift helpers — compare current positions against the target allocation.
 *
 * Position percentages on disk are written at execution time, but during a
 * Loop check we recompute them from the on-record dollar amounts to be sure
 * they're internally consistent.
 */
import type { Allocation } from "@/lib/ai/operator";
import type { PositionRecord } from "@/lib/db/positions";

export interface BucketDrift {
  bucket: "usyc" | "liquid" | "growth";
  currentAmount: number;
  currentPct: number;
  targetPct: number;
  drift: number; // signed: positive means above target, negative below
}

export interface DriftSnapshot {
  totalValue: number;
  drifts: BucketDrift[];
  maxAbsDrift: number;
}

export const DRIFT_THRESHOLD_PCT = 5;

export function snapshotDrift(
  positions: PositionRecord[],
  allocation: Allocation,
): DriftSnapshot {
  const totalValue = positions.reduce((s, p) => s + p.amountUsdc, 0);

  const usycAmount = positions.find((p) => p.asset === "USYC")?.amountUsdc ?? 0;
  const liquidAmount =
    positions.find((p) => p.asset === "USDC")?.amountUsdc ?? 0;
  const growthAmount = Math.max(0, totalValue - usycAmount - liquidAmount);

  const safeDiv = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);

  const drifts: BucketDrift[] = [
    {
      bucket: "usyc",
      currentAmount: usycAmount,
      currentPct: safeDiv(usycAmount, totalValue),
      targetPct: allocation.usycPct,
      drift: safeDiv(usycAmount, totalValue) - allocation.usycPct,
    },
    {
      bucket: "liquid",
      currentAmount: liquidAmount,
      currentPct: safeDiv(liquidAmount, totalValue),
      targetPct: allocation.liquidPct,
      drift: safeDiv(liquidAmount, totalValue) - allocation.liquidPct,
    },
    {
      bucket: "growth",
      currentAmount: growthAmount,
      currentPct: safeDiv(growthAmount, totalValue),
      targetPct: allocation.growthPct,
      drift: safeDiv(growthAmount, totalValue) - allocation.growthPct,
    },
  ];

  const maxAbsDrift = drifts.reduce(
    (m, d) => Math.max(m, Math.abs(d.drift)),
    0,
  );

  return { totalValue, drifts, maxAbsDrift };
}

/**
 * Builds a simulated drift snapshot that guarantees `maxAbsDrift > 5%` so the
 * demo always produces a visible rebalance. Forces USYC 6 pp underweight, the
 * liquid bucket 6 pp overweight, growth unchanged.
 */
export function simulateDrift(
  positions: PositionRecord[],
  allocation: Allocation,
): DriftSnapshot {
  const baseline = snapshotDrift(positions, allocation);
  if (baseline.totalValue <= 0) return baseline;

  const total = baseline.totalValue;
  const usycSimPct = Math.max(0, allocation.usycPct - 6);
  const liquidSimPct = Math.min(100, allocation.liquidPct + 6);
  const growthSimPct = Math.max(0, 100 - usycSimPct - liquidSimPct);

  const drifts: BucketDrift[] = [
    {
      bucket: "usyc",
      currentAmount: total * (usycSimPct / 100),
      currentPct: usycSimPct,
      targetPct: allocation.usycPct,
      drift: usycSimPct - allocation.usycPct,
    },
    {
      bucket: "liquid",
      currentAmount: total * (liquidSimPct / 100),
      currentPct: liquidSimPct,
      targetPct: allocation.liquidPct,
      drift: liquidSimPct - allocation.liquidPct,
    },
    {
      bucket: "growth",
      currentAmount: total * (growthSimPct / 100),
      currentPct: growthSimPct,
      targetPct: allocation.growthPct,
      drift: growthSimPct - allocation.growthPct,
    },
  ];

  return {
    totalValue: total,
    drifts,
    maxAbsDrift: 6,
  };
}

/**
 * Plain-English drift summary the LLM can read verbatim in the rebalance
 * decision prompt.
 */
export function describeDrifts(snapshot: DriftSnapshot): string {
  const lines = snapshot.drifts.map((d) => {
    const sign = d.drift >= 0 ? "+" : "";
    return `- ${BUCKET_LABEL[d.bucket]}: ${d.currentPct.toFixed(1)}% now (target ${d.targetPct.toFixed(0)}%, drift ${sign}${d.drift.toFixed(1)} pts)`;
  });
  return lines.join("\n");
}

export const BUCKET_LABEL: Record<BucketDrift["bucket"], string> = {
  usyc: "Safe Treasury Fund",
  liquid: "Ready cash",
  growth: "Growth reserve",
};
