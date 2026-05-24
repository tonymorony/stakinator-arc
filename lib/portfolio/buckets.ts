/**
 * Portfolio bucket math — keeps dashboard aligned with the approved strategy.
 * USYC is often simulated (0 on-chain) while wallet USDC holds the full balance.
 */
import type { Allocation } from "@/lib/ai/allocation";
import type { BucketView } from "@/components/dashboard/BucketBreakdown";
import {
  listPositionsForUser,
  upsertPosition,
  type PositionRecord,
} from "@/lib/db/positions";

export interface AllocationAmounts {
  usyc: number;
  liquid: number;
  eurc: number;
  growth: number;
  total: number;
}

export function roundDown2dp(value: number): number {
  return Math.floor(value * 100) / 100;
}

/** Split a wallet total into strategy bucket dollar amounts. */
export function splitWalletByAllocation(
  total: number,
  allocation: Allocation,
): AllocationAmounts {
  const usyc = roundDown2dp(total * (allocation.usycPct / 100));
  const eurc = roundDown2dp(total * ((allocation.eurcPct ?? 0) / 100));
  const growth = roundDown2dp(total * (allocation.growthPct / 100));
  const liquid = roundDown2dp(total - usyc - eurc - growth);
  return { usyc, liquid, eurc, growth, total };
}

/** Persist strategy-shaped positions for dashboard + loop drift checks. */
export async function syncPositionsToAllocation(
  userId: string,
  total: number,
  allocation: Allocation,
): Promise<PositionRecord[]> {
  if (total <= 0) {
    return listPositionsForUser(userId);
  }

  const amounts = splitWalletByAllocation(total, allocation);

  await Promise.all([
    upsertPosition({
      userId,
      asset: "USYC",
      amountUsdc: amounts.usyc,
      percentage: allocation.usycPct,
    }),
    upsertPosition({
      userId,
      asset: "USDC",
      amountUsdc: amounts.liquid + amounts.growth,
      percentage: allocation.liquidPct + allocation.growthPct,
    }),
    upsertPosition({
      userId,
      asset: "EURC",
      amountUsdc: amounts.eurc,
      percentage: allocation.eurcPct ?? 0,
    }),
  ]);

  return listPositionsForUser(userId);
}

const USDC_APY = 3.44;

/** UI buckets — mirrors the strategy card breakdown. */
export function buildDashboardBuckets(
  total: number,
  allocation: Allocation | null,
  apy: number,
  positions?: PositionRecord[],
): BucketView[] {
  if (allocation && total > 0) {
    const amounts = splitWalletByAllocation(total, allocation);
    const buckets: BucketView[] = [
      {
        key: "safe",
        name: "Safe Treasury Fund",
        amountUsdc: amounts.usyc,
        percentage: allocation.usycPct,
        yieldPct: apy,
      },
    ];

    if (amounts.liquid > 0 && allocation.liquidPct > 0) {
      buckets.push({
        key: "liquid",
        name: "Ready cash",
        amountUsdc: amounts.liquid,
        percentage: allocation.liquidPct,
        yieldPct: USDC_APY,
      });
    }

    if (amounts.growth > 0 && allocation.growthPct > 0) {
      buckets.push({
        key: "growth",
        name: "Tokenized stock funds",
        amountUsdc: amounts.growth,
        percentage: allocation.growthPct,
        comingSoon: true,
      });
    }

    if (amounts.eurc > 0 && (allocation.eurcPct ?? 0) > 0) {
      buckets.push({
        key: "euro",
        name: "Euro Reserve",
        amountUsdc: amounts.eurc,
        percentage: allocation.eurcPct ?? 0,
      });
    }

    return buckets.filter((b) => b.percentage > 0);
  }

  // Fallback: raw position rows (legacy / no allocation on session).
  if (!positions?.length) return [];

  const usyc = positions.find((p) => p.asset === "USYC");
  const usdc = positions.find((p) => p.asset === "USDC");
  const eurc = positions.find((p) => p.asset === "EURC");

  const out: BucketView[] = [
    {
      key: "safe",
      name: "Safe Treasury Fund",
      amountUsdc: usyc?.amountUsdc ?? 0,
      percentage: usyc?.percentage ?? 0,
      yieldPct: apy,
    },
    {
      key: "liquid",
      name: "Ready cash",
      amountUsdc: usdc?.amountUsdc ?? 0,
      percentage: usdc?.percentage ?? 0,
      yieldPct: USDC_APY,
    },
  ];
  if (eurc && eurc.amountUsdc > 0) {
    out.push({
      key: "euro",
      name: "Euro Reserve",
      amountUsdc: eurc.amountUsdc,
      percentage: eurc.percentage,
    });
  }
  return out.filter((b) => b.amountUsdc > 0 || b.percentage > 0);
}

export function annualYieldFromAllocation(
  total: number,
  allocation: Allocation | null,
  apy: number,
): number {
  if (!allocation || total <= 0) return 0;
  const amounts = splitWalletByAllocation(total, allocation);
  return amounts.usyc * (apy / 100) + amounts.liquid * (USDC_APY / 100);
}
