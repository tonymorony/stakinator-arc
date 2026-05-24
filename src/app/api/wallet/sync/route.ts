/**
 * POST /api/wallet/sync
 *
 * Reads live on-chain USDC balance, then shapes DB positions to match the
 * user's approved strategy allocation. USYC is simulated — wallet USDC holds
 * the full balance but the dashboard shows the strategy split.
 */
import { cookies } from "next/headers";
import { getAuthSession } from "@/lib/auth/session";
import { findUserById, resolveWalletAddress } from "@/lib/auth/users";
import { getArcPublicClient } from "@/lib/arc/client";
import { CONTRACTS } from "@/lib/arc/contracts";
import {
  USDC_ERC20_DECIMALS,
  EURC_ERC20_DECIMALS,
  USYC_ERC20_DECIMALS,
} from "@/lib/arc/config";
import { findSession, findLatestSessionForUser } from "@/lib/db/sessions";
import {
  buildDashboardBuckets,
  annualYieldFromAllocation,
  syncPositionsToAllocation,
} from "@/lib/portfolio/buckets";
import { getCurrentAPY } from "@/lib/arc/usyc";
import { formatUnits } from "viem";
import type { Allocation } from "@/lib/ai/allocation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ANON_COOKIE = "stak.sid";

const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
] as const;

async function readBalance(
  addr: `0x${string}`,
  token: `0x${string}`,
  decimals: number,
): Promise<number> {
  const client = getArcPublicClient();
  const raw = await client.readContract({
    address: token,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [addr],
  });
  return Number(formatUnits(raw as bigint, decimals));
}

export async function POST(): Promise<Response> {
  const authed = await getAuthSession();
  if (!authed) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const walletAddress = await resolveWalletAddress(authed);
  if (!walletAddress) {
    return Response.json({ error: "No wallet" }, { status: 404 });
  }

  const user = await findUserById(authed.sub);

  const jar = await cookies();
  const sid = jar.get(ANON_COOKIE)?.value ?? null;
  let session = sid ? await findSession(sid) : null;
  if (!session) {
    session = await findLatestSessionForUser(authed.sub);
  }

  const allocation = (session?.allocationJson as Allocation | null) ?? null;

  const addr = walletAddress as `0x${string}`;

  try {
    const [usdc, eurc, usycOnChain, apy] = await Promise.all([
      readBalance(addr, CONTRACTS.USDC, USDC_ERC20_DECIMALS),
      readBalance(addr, CONTRACTS.EURC, EURC_ERC20_DECIMALS),
      readBalance(addr, CONTRACTS.USYC, USYC_ERC20_DECIMALS),
      getCurrentAPY(),
    ]);

    const walletTotal = usdc + eurc + usycOnChain;

    const userId = user?.id ?? authed.sub;

    const positions = allocation
      ? await syncPositionsToAllocation(userId, walletTotal, allocation)
      : [];

    const portfolioTotal = allocation
      ? walletTotal
      : positions.reduce((s, p) => s + p.amountUsdc, 0);

    const buckets = buildDashboardBuckets(
      portfolioTotal,
      allocation,
      apy,
      positions,
    );

    const portfolio = buckets.reduce(
      (acc, b) => {
        if (b.key === "safe") acc.usyc = b.amountUsdc;
        if (b.key === "liquid") acc.usdc = b.amountUsdc;
        if (b.key === "euro") acc.eurc = b.amountUsdc;
        if (b.key === "growth") acc.growth = b.amountUsdc;
        return acc;
      },
      { usdc: 0, eurc: 0, usyc: 0, growth: 0 },
    );

    const annualYield = annualYieldFromAllocation(portfolioTotal, allocation, apy);

    return Response.json({
      walletAddress,
      chain: { usdc, eurc, usyc: usycOnChain },
      portfolio,
      total: portfolioTotal,
      apy,
      annualYield,
      dailyYield: annualYield / 365,
      buckets,
      allocation: allocation
        ? {
            usycPct: allocation.usycPct,
            liquidPct: allocation.liquidPct,
            growthPct: allocation.growthPct,
            eurcPct: allocation.eurcPct ?? 0,
          }
        : null,
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
