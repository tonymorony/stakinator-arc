import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getAuthSession } from "@/lib/auth/session";
import { findUserById } from "@/lib/auth/users";
import { getAppContext } from "@/lib/app/context";
import { findSession, findLatestSessionForUser } from "@/lib/db/sessions";
import { findLatestRebalance } from "@/lib/db/rebalances";
import { listPositionsForUser } from "@/lib/db/positions";
import { listTransactionsForUser } from "@/lib/db/transactions";
import { getCurrentAPY } from "@/lib/arc/usyc";
import {
  buildDashboardBuckets,
  annualYieldFromAllocation,
  syncPositionsToAllocation,
} from "@/lib/portfolio/buckets";
import type { Allocation } from "@/lib/ai/allocation";
import {
  DashboardClient,
  type DashboardInitial,
} from "@/components/dashboard/DashboardClient";
import type { ActionEntry } from "@/components/dashboard/ActionLog";

export const metadata: Metadata = {
  title: "Your portfolio",
};

export const dynamic = "force-dynamic";

const ANON_COOKIE = "stak.sid";

/**
 * Server entrypoint for the dashboard. Fetches everything in parallel and
 * passes a normalised initial-state bundle into <DashboardClient/>.
 *
 * Redirect rules (DASHBOARD-FR-010):
 *   - no auth   → /
 *   - no positions → /onboarding
 */
export default async function DashboardPage() {
  const authed = await getAuthSession();
  if (!authed) redirect("/");

  const ctx = await getAppContext();

  const jar = await cookies();
  const sid = jar.get(ANON_COOKIE)?.value ?? null;

  let session = sid ? await findSession(sid) : null;
  if (!session) {
    session = await findLatestSessionForUser(authed.sub);
  }
  const allocation = (session?.allocationJson as Allocation | null) ?? null;

  let [positions, transactions, latestRebalance, apy, user] =
    await Promise.all([
      listPositionsForUser(authed.sub),
      listTransactionsForUser(authed.sub, { limit: 40 }),
      findLatestRebalance(authed.sub),
      getCurrentAPY(),
      findUserById(authed.sub),
    ]);

  // Reshape positions to match strategy if we have allocation + wallet value.
  const rawTotal = positions.reduce((s, p) => s + p.amountUsdc, 0);
  if (allocation && rawTotal > 0) {
    positions = await syncPositionsToAllocation(authed.sub, rawTotal, allocation);
  }

  if (!ctx.hasMandate && !ctx.hasPositions && positions.length === 0) {
    redirect("/onboarding");
  }

  const totalValue = positions.reduce((s, p) => s + p.amountUsdc, 0);
  const annualYield = annualYieldFromAllocation(totalValue, allocation, apy);
  const dailyYield = annualYield / 365;

  // Agent status anchor.
  const fallbackAnchor = transactions[0]?.createdAt ?? null;
  const agentLastSeen =
    latestRebalance?.createdAt ??
    (fallbackAnchor instanceof Date ? fallbackAnchor : null);
  const agentLastAction: DashboardInitial["agentLastAction"] = latestRebalance
    ? latestRebalance.executed
      ? "rebalance"
      : "check-in"
    : session?.executedAt
      ? "check-in"
      : "setup";

  const buckets = buildDashboardBuckets(totalValue, allocation, apy, positions);

  // Action log entries — newest first, plain language as stored.
  // Show: all on-chain txs (have a hash) + anything from the last 48 h.
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const entries: ActionEntry[] = transactions
    .filter((tx) => tx.txHash !== null || tx.createdAt >= cutoff)
    .map((tx) => ({
      id: tx.id,
      description: tx.humanDescription,
      txHash: tx.txHash,
      createdAt: tx.createdAt.toISOString(),
    }));

  const initial: DashboardInitial = {
    totalValue,
    apy,
    annualYield,
    dailyYield,
    buckets,
    entries,
    agentLastSeenIso: agentLastSeen ? agentLastSeen.toISOString() : null,
    agentLastAction,
    walletAddress: user?.walletAddress ?? null,
  };

  return <DashboardClient initial={initial} />;
}
