"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { PortfolioOverview } from "./PortfolioOverview";
import { BucketBreakdown, type BucketView } from "./BucketBreakdown";
import { ActionLog, type ActionEntry } from "./ActionLog";
import { NotificationCard, type MiniTx } from "./NotificationCard";
import { AllocationChart } from "./AllocationChart";
import { relativeTime } from "@/lib/format";
import { TokenIcon } from "@/components/TokenIcon";

interface PositionView {
  id: string;
  asset: "USYC" | "USDC" | "EURC";
  amountUsdc: number;
  percentage: number;
}

interface LoopResponse {
  rebalanced: boolean;
  notification: string;
  reasoning: string;
  transactions: Array<{ id: string; description: string }>;
  totals: { totalValue: number; annualYield: number; dailyYield: number; apy: number };
  positions: PositionView[];
  market: { apyBefore: number; apyAfter: number };
}

interface SyncResponse {
  walletAddress: string;
  chain: { usdc: number; eurc: number; usyc: number };
  portfolio: { usdc: number; eurc: number; usyc: number; growth: number };
  total: number;
  apy: number;
  annualYield: number;
  dailyYield: number;
  buckets: BucketView[];
}


export interface DashboardInitial {
  totalValue: number;
  apy: number;
  annualYield: number;
  dailyYield: number;
  buckets: BucketView[];
  entries: ActionEntry[];
  agentLastSeenIso: string | null;
  agentLastAction: "rebalance" | "check-in" | "setup" | "none";
  walletAddress: string | null;
}

interface DashboardClientProps {
  initial: DashboardInitial;
}

type LoopState = "idle" | "checking" | "done" | "error";

// Market context the agent "observed" — demo fixture.
const MARKET_CONTEXT = [
  {
    id: "mc1",
    icon: "🏛️",
    text: "US T-bill rate holding at 5.2% — USYC yield tracking on-target.",
  },
  {
    id: "mc2",
    icon: "💶",
    text: "EURC/USD stable at 1.12 — no EUR hedging adjustment required.",
  },
  {
    id: "mc3",
    icon: "🔗",
    text: "Arc Testnet: all systems operational. Deposits processing normally.",
  },
];

export function DashboardClient({ initial }: DashboardClientProps) {
  const [totals, setTotals] = useState({
    totalValue: initial.totalValue,
    dailyYield: initial.dailyYield,
    apy: initial.apy,
  });
  const [buckets, setBuckets] = useState<BucketView[]>(initial.buckets);
  const [entries, setEntries] = useState<ActionEntry[]>(initial.entries);
  const [loopState, setLoopState] = useState<LoopState>("idle");
  const lastSimulateRef = useRef<number>(0);
  const [agentLastSeenIso, setAgentLastSeenIso] = useState<string | null>(
    initial.agentLastSeenIso,
  );
  const [agentLastAction, setAgentLastAction] = useState<
    DashboardInitial["agentLastAction"]
  >(initial.agentLastAction);
  const [notification, setNotification] = useState<{
    text: string;
    rebalanceTxs?: MiniTx[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [walletAddress] = useState<string | null>(initial.walletAddress);
  const [chainBalance, setChainBalance] = useState<SyncResponse["chain"] | null>(null);
  const [refreshing, setRefreshing] = useState(false);


  const refreshingRef = useRef(false);

  const applySyncResponse = useCallback((data: SyncResponse) => {
    setChainBalance(data.chain);
    if (data.buckets.length > 0) {
      setBuckets(data.buckets);
    }
    if (data.total > 0) {
      setTotals({
        totalValue: data.total,
        dailyYield: data.dailyYield,
        apy: data.apy,
      });
    }
  }, []);

  const refreshFromChain = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    try {
      // /sync reads chain + writes correct amounts back to DB so the loop uses real data
      const res = await fetch("/api/wallet/sync", {
        method: "POST",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Could not sync chain balances.");
      const data = (await res.json()) as SyncResponse;
      applySyncResponse(data);
    } catch {
      // non-fatal — show stale DB data
    } finally {
      setRefreshing(false);
      refreshingRef.current = false;
    }
  }, [applySyncResponse]);

  // Auto-refresh chain data on mount
  useEffect(() => {
    void refreshFromChain();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps


  const simulate = useCallback(async () => {
    if (loopState === "checking") return;
    // 30-second cooldown to prevent spam
    if (Date.now() - lastSimulateRef.current < 30_000) return;
    lastSimulateRef.current = Date.now();
    setLoopState("checking");
    setError(null);

    try {
      const res = await fetch("/api/operator/loop", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ simulate: true }),
      });
      const data = (await res.json()) as LoopResponse | { error?: string };
      if (!res.ok) {
        const msg =
          "error" in data && data.error
            ? data.error
            : "Couldn't run the check-in right now.";
        throw new Error(msg);
      }

      const loop = data as LoopResponse;
      setTotals({
        totalValue: loop.totals.totalValue,
        dailyYield: loop.totals.dailyYield,
        apy: loop.totals.apy,
      });
      const apyForYield = loop.totals.apy;
      setBuckets(
        loop.positions.map((p) => ({
          key: bucketKeyFromAsset(p.asset),
          name: BUCKET_NAMES[p.asset] ?? "Other",
          amountUsdc: p.amountUsdc,
          percentage: p.percentage,
          yieldPct: p.asset === "USYC" ? apyForYield : undefined,
        })),
      );
      setEntries((prev) => [
        ...loop.transactions.map((tx) => ({
          id: tx.id,
          description: tx.description,
          txHash: null,
          createdAt: new Date().toISOString(),
        })),
        ...prev,
      ]);
      setNotification({
        text: loop.notification,
        rebalanceTxs: loop.transactions.map((tx) => ({
          id: tx.id,
          description: tx.description,
        })),
      });
      setAgentLastSeenIso(new Date().toISOString());
      setAgentLastAction(loop.rebalanced ? "rebalance" : "check-in");
      setLoopState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setLoopState("error");
    }
  }, [loopState]);

  const shortAddr = walletAddress
    ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`
    : null;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <AnimatePresence>
        {notification ? (
          <NotificationCard
            key="notif"
            text={notification.text}
            rebalanceTxs={notification.rebalanceTxs}
            onDismiss={() => setNotification(null)}
          />
        ) : null}
      </AnimatePresence>

      <PortfolioOverview
        totalValue={totals.totalValue}
        dailyYield={totals.dailyYield}
        apy={totals.apy}
      />

      {/* Wallet bar */}
      {walletAddress ? (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-bg-surface px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="h-2 w-2 rounded-full bg-status-success" />
            <span className="text-xs text-text-muted">Arc wallet</span>
            <a
              href={`https://testnet.arcscan.app/address/${walletAddress}`}
              target="_blank"
              rel="noreferrer noopener"
              className="num text-xs font-medium text-text-primary hover:text-accent-earn"
            >
              {shortAddr}
            </a>
          </div>
          <div className="flex items-center gap-3">
            {chainBalance ? (
              <span className="flex items-center gap-3 text-xs text-text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <TokenIcon token="USDC" size={18} />
                  <span className="num font-medium text-text-primary">
                    {chainBalance.usdc.toFixed(2)}
                  </span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <TokenIcon token="EURC" size={18} />
                  <span className="num font-medium text-text-primary">
                    {chainBalance.eurc.toFixed(2)}
                  </span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <TokenIcon token="USYC" size={18} />
                  <span className="num font-medium text-text-primary">
                    {chainBalance.usyc.toFixed(2)}
                  </span>
                </span>
              </span>
            ) : null}
            <button
              type="button"
              onClick={refreshFromChain}
              disabled={refreshing}
              aria-label={refreshing ? "Refreshing wallet balances" : "Refresh wallet balances"}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-surface px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-accent-earn/40 hover:bg-bg-elevated hover:text-accent-earn disabled:cursor-wait disabled:opacity-50"
            >
              <svg
                viewBox="0 0 24 24"
                className={`h-3.5 w-3.5 shrink-0 ${refreshing ? "animate-spin" : ""}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                <path d="M8 16H3v5" />
              </svg>
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>
      ) : null}


      <div className="grid gap-8 lg:grid-cols-[3fr_2fr]">
        <section>
          <h3 className="mb-4 font-display text-lg text-text-primary">Your money</h3>
          <BucketBreakdown buckets={buckets} />

          {buckets.some((b) => b.percentage > 0.5) ? (
            <div className="mt-5 rounded-xl border border-border bg-bg-surface p-4">
              <p className="mb-4 text-xs uppercase tracking-wide text-text-muted">Allocation</p>
              <AllocationChart buckets={buckets} />
            </div>
          ) : null}

          <p className="mt-6 text-sm text-text-muted" aria-live="polite">
            {agentStatusLine({ loopState, lastSeenIso: agentLastSeenIso, lastAction: agentLastAction })}
          </p>
          <SimulateButton onClick={simulate} disabled={loopState === "checking"} />
          {error ? (
            <p className="mt-3 text-sm text-status-danger" role="alert">{error}</p>
          ) : null}
        </section>

        <section>
          <h3 className="mb-4 font-display text-lg text-text-primary">What happened</h3>
          <ActionLog entries={entries} />

          {/* Market context */}
          <div className="mt-8">
            <h4 className="mb-3 text-xs uppercase tracking-wide text-text-muted">Market context</h4>
            <ul className="space-y-3">
              {MARKET_CONTEXT.map((item) => (
                <li key={item.id} className="flex items-start gap-2.5 text-sm text-text-secondary">
                  <span className="shrink-0 text-base leading-tight">{item.icon}</span>
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function SimulateButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="mt-4 flex items-center gap-2 rounded-full border border-border bg-bg-surface px-5 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-bg-elevated disabled:cursor-wait disabled:opacity-60"
    >
      {disabled ? (
        <>
          <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"/>
          </svg>
          Agent checking in…
        </>
      ) : (
        <>
          <span className="text-base">🤖</span>
          Run agent check-in
        </>
      )}
    </button>
  );
}

function agentStatusLine({
  loopState,
  lastSeenIso,
  lastAction,
}: {
  loopState: LoopState;
  lastSeenIso: string | null;
  lastAction: DashboardInitial["agentLastAction"];
}): string {
  if (loopState === "checking") return "Your agent is checking in now…";
  if (!lastSeenIso) return "Your agent will check in tomorrow.";
  const rel = relativeTime(lastSeenIso);
  if (lastAction === "rebalance") return `Your agent rebalanced ${rel}.`;
  if (lastAction === "setup") return `Your account opened ${rel}.`;
  return `Your agent checked in ${rel}. All good.`;
}

const BUCKET_NAMES: Record<string, string> = {
  USYC: "Safe Treasury Fund",
  USDC: "Ready cash",
  EURC: "Euro Reserve",
};

function bucketKeyFromAsset(asset: PositionView["asset"]): BucketView["key"] {
  if (asset === "USYC") return "safe";
  if (asset === "EURC") return "euro";
  return "liquid";
}
