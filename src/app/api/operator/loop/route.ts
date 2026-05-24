/**
 * POST /api/operator/loop
 *
 * Runs the monitoring agent on a single user's portfolio.
 *
 *   Body: { simulate?: boolean } — for the demo we always pass simulate: true.
 *   Auth: required (must have completed the OTP flow).
 *
 *   Returns:
 *     {
 *       rebalanced: boolean,
 *       notification: string,
 *       transactions: TxView[],
 *       market: { apyBefore, apyAfter },
 *       drift: { maxAbsDrift },
 *       reasoning: string,
 *       positions: PositionRecord[],   // post-loop snapshot
 *       totals: { totalValue, annualYield, dailyYield, apy },
 *     }
 *
 * Concurrency: rejects if a loop is already in flight for this user.
 */
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { resolveAnonymousSession, updateSession } from "@/lib/db/sessions";
import { getAuthSession } from "@/lib/auth/session";
import { findUserById } from "@/lib/auth/users";
import {
  estimatedAnnualEarningsUsd,
  totalCapitalUsd,
  type Allocation,
} from "@/lib/ai/operator";
import {
  decideRebalance,
  generateNotification,
} from "@/lib/ai/loop";
import { getCurrentAPY } from "@/lib/arc/usyc";
import {
  listPositionsForUser,
  upsertPosition,
  type PositionRecord,
} from "@/lib/db/positions";
import {
  createTransaction,
  type TransactionRecord,
} from "@/lib/db/transactions";
import {
  createRebalance,
  releaseLoopLock,
  tryAcquireLoopLock,
} from "@/lib/db/rebalances";
import {
  DRIFT_THRESHOLD_PCT,
  simulateDrift,
  snapshotDrift,
} from "@/lib/operator/drift";
import { translateTransaction } from "@/lib/translations/actions";
import type { Mandate } from "@/lib/inquisitor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ANON_COOKIE = "stak.sid";

export async function POST(req: NextRequest): Promise<Response> {
  const authed = await getAuthSession();
  if (!authed) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await findUserById(authed.sub);
  if (!user) return Response.json({ error: "User not found" }, { status: 404 });

  if (!tryAcquireLoopLock(user.id)) {
    return Response.json(
      { error: "A check-in is already in progress." },
      { status: 409 },
    );
  }

  try {
    const jar = await cookies();
    const sidFromCookie = jar.get(ANON_COOKIE)?.value;
    const body = (await req.json().catch(() => null)) as
      | { sessionId?: string; simulate?: boolean }
      | null;
    const simulate = body?.simulate !== false; // demo default = simulate ON
    const session = await resolveAnonymousSession({
      bodySessionId: body?.sessionId,
      cookieSessionId: sidFromCookie,
      userId: user.id,
      preferWithAllocation: true,
    });
    if (!session?.mandateJson || !session.allocationJson) {
      return Response.json(
        { error: "No portfolio to monitor yet" },
        { status: 400 },
      );
    }

    const allocation = session.allocationJson;
    const mandate = session.mandateJson;

    const positionsBefore = await listPositionsForUser(user.id);

    // ── Drift snapshot ───────────────────────────────────────────────────
    const driftSnapshot = simulate
      ? simulateDrift(positionsBefore, allocation)
      : snapshotDrift(positionsBefore, allocation);

    // ── Market update ────────────────────────────────────────────────────
    const apyBefore = await getCurrentAPY();
    const apyDelta = simulate ? randomBetween(0.1, 0.3) : 0;
    const apyAfter = Number((apyBefore + apyDelta).toFixed(2));

    // ── LLM decision ─────────────────────────────────────────────────────
    const decision = await decideRebalance({
      drift: driftSnapshot,
      target: allocation,
      previousApy: apyBefore,
      newApy: apyAfter,
      mandate,
    });

    // ── Execute the rebalance if the decision says yes ───────────────────
    let postPositions = positionsBefore;
    let transactions: TransactionRecord[] = [];
    let movedToSafe = 0;

    if (decision.shouldRebalance) {
      const driftedUsycAmount =
        driftSnapshot.drifts.find((d) => d.bucket === "usyc")?.currentAmount ?? 0;
      const actualTotal = positionsBefore.reduce((s, p) => s + p.amountUsdc, 0);

      const result = await applyRebalance({
        userId: user.id,
        allocation: { ...allocation, ...decision.newAllocation },
        mandate,
        apyAfter,
        driftedUsycAmount,
        actualTotal,
      });
      postPositions = result.positions;
      transactions = result.transactions;
      movedToSafe = result.movedToSafe;

      // Persist the new target onto the session so the next check honours it.
      await updateSession(session.id, {
        allocationJson: {
          ...allocation,
          ...decision.newAllocation,
          explanation: allocation.explanation,
        },
      });
    }

    // ── Plain-language notification ──────────────────────────────────────
    const notif = await generateNotification({
      mandate,
      rebalanced: decision.shouldRebalance,
      movedUsdcToSafeBucket: movedToSafe,
      apyBefore,
      apyAfter,
      driftBefore: driftSnapshot.maxAbsDrift,
      reason: decision.reason,
    });

    // ── Log the check-in to the Rebalance store ──────────────────────────
    await createRebalance({
      userId: user.id,
      trigger: simulate ? "manual" : "drift",
      driftDetected: driftSnapshot.maxAbsDrift,
      previousAllocation: {
        usycPct: allocation.usycPct,
        liquidPct: allocation.liquidPct,
        growthPct: allocation.growthPct,
      },
      newAllocation: decision.newAllocation,
      explanation: notif.text,
      executed: decision.shouldRebalance,
    });

    // ── Totals for the live UI update ────────────────────────────────────
    const totalValue = postPositions.reduce((s, p) => s + p.amountUsdc, 0);
    const newAllocationFull: Allocation = {
      ...allocation,
      ...decision.newAllocation,
    };
    const annualYield = estimatedAnnualEarningsUsd(
      mandate,
      newAllocationFull,
      apyAfter,
    );

    return Response.json({
      rebalanced: decision.shouldRebalance,
      reasoning: decision.reason,
      reasoningSource: decision.source,
      notification: notif.text,
      notificationSource: notif.source,
      transactions: transactions.map(toTxView),
      market: { apyBefore, apyAfter },
      drift: {
        maxAbsDrift: driftSnapshot.maxAbsDrift,
        threshold: DRIFT_THRESHOLD_PCT,
      },
      positions: postPositions.map(toPositionView),
      totals: {
        totalValue,
        annualYield,
        dailyYield: annualYield / 365,
        apy: apyAfter,
      },
      newAllocation: decision.newAllocation,
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  } finally {
    releaseLoopLock(user.id);
  }
}

// ─────────────────────────────────────────────────────────────────────────────

interface ApplyRebalanceParams {
  userId: string;
  allocation: Allocation;
  mandate: Mandate;
  apyAfter: number;
  /** USYC dollar amount according to the (possibly simulated) drift snapshot. */
  driftedUsycAmount: number;
  /** Actual total portfolio value from DB positions (used instead of mandate tier). */
  actualTotal: number;
}

interface ApplyRebalanceResult {
  positions: PositionRecord[];
  transactions: TransactionRecord[];
  movedToSafe: number;
}

/**
 * Adjust the user's Position rows toward the new target. The "from" state used
 * to compute the rebalance delta is the drift snapshot (which may be simulated
 * to guarantee a visible movement during the demo) — not the on-disk values,
 * which already reflect the original target after the initial execution.
 */
async function applyRebalance({
  userId,
  allocation,
  mandate,
  apyAfter,
  driftedUsycAmount,
  actualTotal,
}: ApplyRebalanceParams): Promise<ApplyRebalanceResult> {
  // Use the real wallet total; fall back to mandate tier only if positions are empty.
  const total = actualTotal > 0 ? actualTotal : totalCapitalUsd(mandate);
  const newUsyc = roundDown2dp(total * (allocation.usycPct / 100));
  const newLiquid = roundDown2dp(total - newUsyc);

  const delta = roundDown2dp(newUsyc - driftedUsycAmount);

  await upsertPosition({
    userId,
    asset: "USYC",
    amountUsdc: newUsyc,
    percentage: allocation.usycPct,
  });
  await upsertPosition({
    userId,
    asset: "USDC",
    amountUsdc: newLiquid,
    percentage: total > 0 ? (newLiquid / total) * 100 : allocation.liquidPct,
  });

  const txs: TransactionRecord[] = [];
  if (Math.abs(delta) >= 0.01) {
    const reason =
      delta > 0
        ? `moved $${delta.toFixed(0)} into the safe Treasury fund.`
        : `moved $${Math.abs(delta).toFixed(0)} into ready cash.`;
    const description = translateTransaction({
      type: "REBALANCE",
      driftPct: undefined,
      reason,
    });
    const txRow = await createTransaction({
      userId,
      type: "REBALANCE",
      asset: delta > 0 ? "Safe Treasury Fund" : "Ready cash",
      amountUsdc: Math.abs(delta),
      txHash: null,
      humanDescription: description,
    });
    txs.push(txRow);
  } else {
    // Even a no-op rebalance logs a check-in line so the action log shows it.
    const description = translateTransaction({
      type: "REBALANCE",
      reason: `kept everything as-is at ${apyAfter.toFixed(1)}% per year.`,
    });
    const txRow = await createTransaction({
      userId,
      type: "REBALANCE",
      asset: "Portfolio",
      amountUsdc: 0,
      txHash: null,
      humanDescription: description,
    });
    txs.push(txRow);
  }

  const positions = await listPositionsForUser(userId);
  return {
    positions,
    transactions: txs,
    movedToSafe: delta > 0 ? delta : 0,
  };
}

function toTxView(tx: TransactionRecord) {
  return {
    id: tx.id,
    description: tx.humanDescription,
    txHash: tx.txHash,
    explorerUrl: tx.txHash ? `https://testnet.arcscan.app/tx/${tx.txHash}` : null,
    createdAt: tx.createdAt.toISOString(),
  };
}

function toPositionView(p: PositionRecord) {
  return {
    id: p.id,
    asset: p.asset,
    amountUsdc: p.amountUsdc,
    percentage: p.percentage,
    updatedAt: p.updatedAt.toISOString(),
  };
}

function roundDown2dp(v: number): number {
  return Math.floor(v * 100) / 100;
}

function randomBetween(a: number, b: number): number {
  return a + Math.random() * (b - a);
}
