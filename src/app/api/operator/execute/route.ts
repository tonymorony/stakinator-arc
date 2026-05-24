/**
 * POST /api/operator/execute
 *
 * Drives the on-chain execution sequence and streams progress to the client
 * via Server-Sent Events.
 *
 * Wire format (each frame is `data: <json>\n\n`):
 *   { type: "tx",   description, txHash, explorerUrl, source: "arc" | "simulated" }
 *   { type: "done", totalValue, explorerUrls: [], walletAddress?: string }
 *   { type: "error", message }
 *
 * Auth: requires a valid signed session cookie (post-OTP user).
 * Idempotency: if `session.executedAt` is already set, replays the
 *   recorded transaction log and immediately emits `done` without re-touching
 *   on-chain state.
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { resolveAnonymousSession, updateSession } from "@/lib/db/sessions";
import { getAuthSession, attachAuthSession } from "@/lib/auth/session";
import { ensureUserFromAuthSession } from "@/lib/auth/users";
import { databaseUnavailableResponse } from "@/lib/db/health";
import {
  totalCapitalUsd,
  type Allocation,
} from "@/lib/ai/operator";
import { getCurrentAPY, getServerWalletAddress } from "@/lib/arc/usyc";
import { getArcPublicClient } from "@/lib/arc/client";
import { CONTRACTS } from "@/lib/arc/contracts";
import { USDC_ERC20_DECIMALS } from "@/lib/arc/config";
import { formatUnits } from "viem";
import { swapUsdcToEurc } from "@/lib/arc/eurc";
import {
  createTransaction,
  listTransactionsForUser,
  type TransactionRecord,
} from "@/lib/db/transactions";
import { upsertPosition } from "@/lib/db/positions";
import { translateTransaction } from "@/lib/translations/actions";
import type { Mandate } from "@/lib/inquisitor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ANON_COOKIE = "stak.sid";

export async function POST(req: NextRequest): Promise<Response> {
  const dbError = await databaseUnavailableResponse();
  if (dbError) return dbError;

  const authed = await getAuthSession();
  if (!authed) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await ensureUserFromAuthSession(authed);
  const authNeedsSync = user.id !== authed.sub;

  const jar = await cookies();
  const sidFromCookie = jar.get(ANON_COOKIE)?.value;
  const body = (await req.json().catch(() => null)) as
    | { sessionId?: string }
    | null;

  const session = await resolveAnonymousSession({
    bodySessionId: body?.sessionId,
    cookieSessionId: sidFromCookie,
    userId: user.id,
    preferWithAllocation: true,
  });
  if (!session) {
    return Response.json(
      {
        error:
          "Session not found. Your plan may have expired — go back and rebuild your strategy, then sign in again.",
      },
      { status: 404 },
    );
  }
  if (!session.allocationJson) {
    return Response.json({ error: "No allocation to execute" }, { status: 400 });
  }
  if (!session.mandateJson) {
    return Response.json({ error: "No mandate to execute" }, { status: 400 });
  }

  // Idempotent re-execution: replay the previous run instead of touching chain.
  const replay = session.executedAt
    ? await listTransactionsForUser(user.id, { limit: 10 })
    : [];

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      try {
        if (replay.length > 0) {
          await emitReplay(replay, send);
          send({
            type: "done",
            totalValue: totalCapitalUsd(session.mandateJson!),
            walletAddress: getServerWalletAddress(),
            replayed: true,
          });
        } else {
          await runExecution({
            allocation: session.allocationJson!,
            mandate: session.mandateJson!,
            userId: user.id,
            userEmail: user.email,
            send,
          });

          await updateSession(session.id, { executedAt: new Date() });

          send({
            type: "done",
            totalValue: totalCapitalUsd(session.mandateJson!),
            walletAddress: getServerWalletAddress(),
            replayed: false,
          });
        }
      } catch (err) {
        send({
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        try {
          controller.close();
        } catch {
          // already closed — safe to ignore
        }
      }
    },
  });

  let response = new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });

  if (authNeedsSync) {
    response = attachAuthSession(response, {
      sub: user.id,
      email: user.email,
      walletAddress: user.walletAddress,
    });
  }

  return response;
}

// ─────────────────────────────────────────────────────────────────────────────

interface RunInput {
  allocation: Allocation;
  mandate: Mandate;
  userId: string;
  userEmail: string;
  send: (payload: object) => void;
}

async function getWalletUsdcBalance(address: string): Promise<number> {
  try {
    const client = getArcPublicClient();
    const raw = await client.readContract({
      address: CONTRACTS.USDC,
      abi: [{
        name: "balanceOf", type: "function",
        inputs: [{ name: "account", type: "address" }],
        outputs: [{ type: "uint256" }], stateMutability: "view",
      }] as const,
      functionName: "balanceOf",
      args: [address as `0x${string}`],
    });
    return Number(formatUnits(raw as bigint, USDC_ERC20_DECIMALS));
  } catch {
    return 0;
  }
}

async function runExecution({
  allocation,
  mandate,
  userId,
  userEmail,
  send,
}: RunInput): Promise<void> {
  // Use actual wallet balance for demo — faucet gives $20 but mandate capital
  // tiers assume $500+. Scale to whichever is smaller.
  const mandateTotal = totalCapitalUsd(mandate);
  const user = await import("@/lib/auth/users").then((m) => m.findUserById(userId));
  const walletBalance = user?.walletAddress
    ? await getWalletUsdcBalance(user.walletAddress)
    : 0;
  const total = walletBalance > 0 ? Math.min(mandateTotal, walletBalance) : mandateTotal;

  const usycTarget = roundDown2dp(total * (allocation.usycPct / 100));
  const eurcTarget = roundDown2dp(total * ((allocation.eurcPct ?? 0) / 100));
  // liquid absorbs rounding drift
  const liquidTarget = roundDown2dp(total - usycTarget - eurcTarget);

  const apy = await getCurrentAPY();

  // ── Tx 1 — Safe Treasury Fund (USYC — simulated; Teller requires allowlist) ─
  // USYC deposits on Arc testnet require Circle support allowlisting.
  // We record the position in the DB and surface it as a simulated allocation
  // so the portfolio breakdown is accurate without a failed on-chain call.
  if (usycTarget > 0) {
    const description = translateTransaction({
      type: "USYC_DEPOSIT",
      amountUsdc: usycTarget,
      apy,
    });
    await createTransaction({
      userId,
      type: "USYC_DEPOSIT",
      asset: "Safe Treasury Fund",
      amountUsdc: usycTarget,
      txHash: null,
      humanDescription: description,
    });
    await upsertPosition({
      userId,
      asset: "USYC",
      amountUsdc: usycTarget,
      percentage: allocation.usycPct,
    });
    send({
      type: "tx",
      description,
      txHash: null,
      explorerUrl: null,
      source: "simulated",
      reason: "USYC allowlist pending — position recorded, no on-chain tx.",
    });
  }

  // ── Tx 2 — Euro Reserve (USDC → EURC swap via App Kit) ──────────────────
  if (eurcTarget > 0) {
    const swap = await swapUsdcToEurc({ amountUsdc: eurcTarget }, userEmail);
    const onchain = swap.source === "arc";
    const description = translateTransaction({
      type: "SWAP",
      fromAmountUsdc: eurcTarget,
      toCurrencyLabel: "euros",
    });
    const txHash = onchain ? swap.txHash : null;
    const explorerUrl = onchain ? swap.explorerUrl : null;

    await createTransaction({
      userId,
      type: "SWAP",
      asset: "Euro Reserve",
      amountUsdc: eurcTarget,
      txHash,
      humanDescription: description,
    });
    await upsertPosition({
      userId,
      asset: "EURC",
      amountUsdc: eurcTarget,
      percentage: allocation.eurcPct ?? 0,
    });

    send({
      type: "tx",
      description,
      txHash,
      explorerUrl,
      source: swap.source,
      ...(swap.source === "simulated" ? { reason: swap.reason } : {}),
    });
  }

  // ── Tx 3 — Ready cash (USDC hold; no on-chain action) ───────────────────
  if (liquidTarget > 0) {
    const description = translateTransaction({
      type: "USDC_HOLD",
      amountUsdc: liquidTarget,
    });
    await createTransaction({
      userId,
      type: "USDC_HOLD",
      asset: "Ready cash",
      amountUsdc: liquidTarget,
      txHash: null,
      humanDescription: description,
    });
    await upsertPosition({
      userId,
      asset: "USDC",
      amountUsdc: liquidTarget,
      percentage: allocation.liquidPct,
    });

    send({
      type: "tx",
      description,
      txHash: null,
      explorerUrl: null,
      source: "off-chain",
    });
  }
}

async function emitReplay(
  rows: TransactionRecord[],
  send: (payload: object) => void,
): Promise<void> {
  // Replay in chronological order so the UI animates the same sequence.
  const ordered = [...rows].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
  for (const tx of ordered) {
    send({
      type: "tx",
      description: tx.humanDescription,
      txHash: tx.txHash,
      explorerUrl: tx.txHash ? `https://testnet.arcscan.app/tx/${tx.txHash}` : null,
      source: tx.txHash ? "arc" : "off-chain",
    });
  }
}

function roundDown2dp(value: number): number {
  return Math.floor(value * 100) / 100;
}
