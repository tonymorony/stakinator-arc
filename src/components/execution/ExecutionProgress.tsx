"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { resolveSessionId } from "@/lib/session/client";
import { AnimatePresence, motion } from "framer-motion";
import { WizardIcon } from "@/components/WizardIcon";
import { TransactionRow, type ExecutionTx } from "./TransactionRow";

interface ExecutionEvent {
  type: "tx" | "done" | "error";
  description?: string;
  txHash?: string | null;
  explorerUrl?: string | null;
  source?: ExecutionTx["source"];
  reason?: string;
  totalValue?: number;
  walletAddress?: string | null;
  replayed?: boolean;
  message?: string;
}

interface ExecutionProgressProps {
  /** Optional: caller can pre-seed transactions (e.g., on browser nav back). */
  initialTransactions?: ExecutionTx[];
  /** Where to land after the success state. */
  redirectTo?: string;
}

const REDIRECT_DELAY_MS = 3000;

/**
 * Drives the on-chain execution sequence.
 *  - Opens an SSE connection to /api/operator/execute on mount
 *  - Renders each "tx" frame as a new row (staggered animation)
 *  - On "done", shows the celebration state and auto-navigates after 3s
 */
export function ExecutionProgress({
  initialTransactions = [],
  redirectTo = "/dashboard",
}: ExecutionProgressProps) {
  const router = useRouter();
  const [txs, setTxs] = useState<ExecutionTx[]>(initialTransactions);
  const [phase, setPhase] = useState<"running" | "done" | "error">("running");
  const [error, setError] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);

  // Stream execution. AbortController makes the dev-mode StrictMode double
  // invocation safe: the first run is aborted before its events apply state,
  // the second run executes against the (idempotent) server endpoint and
  // emits the `done` event that flips the phase.
  useEffect(() => {
    const abort = new AbortController();

    const run = async () => {
      try {
        const res = await fetch("/api/operator/execute", {
          method: "POST",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
          body: JSON.stringify({ sessionId: resolveSessionId() }),
          signal: abort.signal,
        });
        if (!res.ok || !res.body) {
          const body = await res.text().catch(() => "");
          throw new Error(body || "Couldn't start the execution.");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let nl: number;
          while ((nl = buffer.indexOf("\n\n")) >= 0) {
            const frame = buffer.slice(0, nl);
            buffer = buffer.slice(nl + 2);
            handleFrame(frame);
          }
        }
      } catch (err) {
        if (abort.signal.aborted) return;
        setError(err instanceof Error ? err.message : String(err));
        setPhase("error");
      }
    };

    void run();
    return () => {
      abort.abort();
    };
  }, []);

  const handleFrame = useCallback((frame: string) => {
    const trimmed = frame.trim();
    if (!trimmed.startsWith("data:")) return;
    const payload = trimmed.slice(5).trim();
    if (!payload) return;
    let evt: ExecutionEvent;
    try {
      evt = JSON.parse(payload) as ExecutionEvent;
    } catch {
      return;
    }

    switch (evt.type) {
      case "tx":
        if (evt.description) {
          setTxs((prev) => [
            ...prev,
            {
              description: evt.description!,
              txHash: evt.txHash ?? null,
              explorerUrl: evt.explorerUrl ?? null,
              source: evt.source ?? "off-chain",
            },
          ]);
        }
        break;
      case "done":
        if (evt.walletAddress) setWalletAddress(evt.walletAddress);
        setPhase("done");
        break;
      case "error":
        setError(evt.message ?? "Something went wrong.");
        setPhase("error");
        break;
    }
  }, []);

  // Auto-navigate after the success state has settled for 3s.
  useEffect(() => {
    if (phase !== "done") return;
    const t = setTimeout(() => router.push(redirectTo), REDIRECT_DELAY_MS);
    return () => clearTimeout(t);
  }, [phase, redirectTo, router]);

  return (
    <section className="rounded-2xl border border-border bg-bg-base p-6">
      <header className="mb-5 flex items-center gap-3">
        <WizardIcon
          size={48}
          rounded="rounded-2xl"
          variant={phase === "done" ? "celebrate" : "pulse"}
          className={phase === "done" ? "wizard-glow" : ""}
          bounceKey={phase}
        />
        <h2 className="font-display text-xl text-text-primary">
          {phase === "done"
            ? "All set. Your money is working."
            : "Putting your plan into action…"}
        </h2>
      </header>

      <ul className="min-h-[3rem]">
        <AnimatePresence initial={false}>
          {txs.map((tx, i) => (
            <TransactionRow key={`${tx.description}-${i}`} tx={tx} index={i} />
          ))}
        </AnimatePresence>
      </ul>

      {error ? (
        <p className="mt-4 rounded-xl border border-status-danger/40 bg-status-danger/10 p-3 text-sm text-status-danger">
          {error}
        </p>
      ) : null}

      {phase === "done" ? (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.4 }}
          className="mt-6 text-center text-sm text-text-muted"
        >
          Taking you to your portfolio…
        </motion.p>
      ) : null}

      {walletAddress && phase === "done" ? (
        <p className="mt-2 text-center text-[11px] text-text-muted">
          {/* Short fingerprint only — no raw addresses in user-visible copy. */}
          Demo account ending in {shortFingerprint(walletAddress)}
        </p>
      ) : null}
    </section>
  );
}

function shortFingerprint(addr: string): string {
  return addr.slice(-4).toUpperCase();
}
