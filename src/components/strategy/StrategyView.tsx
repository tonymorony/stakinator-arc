"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { WizardIcon } from "@/components/WizardIcon";
import { AuthModal, type AuthModalResult } from "@/components/auth/AuthModal";
import { ExecutionProgress } from "@/components/execution/ExecutionProgress";
import { AllocationCard } from "./AllocationCard";
import { StreamingText } from "./StreamingText";
import { WalletFundingStep } from "./WalletFundingStep";
import { stripStrategyJson, type Allocation } from "@/lib/ai/allocation";
import { notifyAuthChanged } from "@/lib/auth/client-events";
import {
  getStoredMandate,
  resolveSessionId,
  setStoredSessionId,
} from "@/lib/session/client";
import type { Mandate } from "@/lib/inquisitor";

type Phase = "starting" | "streaming" | "ready" | "funding" | "executing" | "no-session";

interface StrategyViewProps {
  initialAuthed?: boolean;
}

interface StrategyEvent {
  type: "text" | "done" | "error";
  content?: string;
  sessionId?: string;
  allocation?: Allocation;
  fullExplanation?: string;
  source?: "llm" | "fallback";
  market?: { usycApy: number };
  capital?: number;
  annualEarnings?: number;
  message?: string;
}

export function StrategyView({ initialAuthed = false }: StrategyViewProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("starting");
  const [explanation, setExplanation] = useState("");
  const [allocation, setAllocation] = useState<Allocation | null>(null);
  const [apy, setApy] = useState<number>(5.2);
  const [capital, setCapital] = useState<number>(0);
  const [annualEarnings, setAnnualEarnings] = useState<number>(0);
  const [planSource, setPlanSource] = useState<"llm" | "fallback" | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [isAuthed, setIsAuthed] = useState(initialAuthed);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);

  const handleSseFrame = useCallback((frame: string) => {
    const trimmed = frame.trim();
    if (!trimmed.startsWith("data:")) return;
    const payload = trimmed.slice(5).trim();
    if (!payload) return;
    let evt: StrategyEvent;
    try {
      evt = JSON.parse(payload) as StrategyEvent;
    } catch {
      return;
    }

    switch (evt.type) {
      case "text":
        if (evt.content) {
          setExplanation((prev) => stripStrategyJson(prev + evt.content!));
        }
        break;
      case "done":
        if (evt.sessionId) setStoredSessionId(evt.sessionId);
        if (evt.allocation) setAllocation(evt.allocation);
        if (evt.fullExplanation) setExplanation(evt.fullExplanation);
        else if (evt.allocation?.explanation) setExplanation(evt.allocation.explanation);
        if (evt.source) setPlanSource(evt.source);
        if (evt.market) setApy(evt.market.usycApy);
        if (typeof evt.capital === "number") setCapital(evt.capital);
        if (typeof evt.annualEarnings === "number") setAnnualEarnings(evt.annualEarnings);
        setPhase("ready");
        break;
      case "error":
        setError(evt.message ?? "Something went wrong.");
        setPhase("ready");
        break;
    }
  }, []);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store", credentials: "include" })
      .then((r) => r.json())
      .then((d: { user: { walletAddress?: string | null } | null }) => {
        setIsAuthed(Boolean(d.user));
        if (d.user?.walletAddress) setWalletAddress(d.user.walletAddress);
      })
      .catch(() => setIsAuthed(false));
  }, []);

  const proceedToFunding = useCallback(async (knownWallet?: string | null) => {
    if (knownWallet) setWalletAddress(knownWallet);
    const sessionId = resolveSessionId();
    try {
      const res = await fetch("/api/auth/link-session", {
        method: "POST",
        cache: "no-store",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      if (res.status === 401) {
        setIsAuthed(false);
        setError("Please sign in again to continue.");
        setAuthOpen(true);
        return;
      }
      if (res.ok) {
        const data = (await res.json()) as {
          sessionId?: string;
          user?: { walletAddress?: string | null };
        };
        if (data.sessionId) setStoredSessionId(data.sessionId);
        if (data.user?.walletAddress) setWalletAddress(data.user.walletAddress);
      }
    } catch {
      /* non-fatal in dev */
    }
    notifyAuthChanged();
    router.refresh();
    setPhase("funding");
  }, [router]);

  useEffect(() => {
    const abort = new AbortController();

    const run = async () => {
      setPhase("streaming");
      const sessionId = resolveSessionId();
      const cachedMandate = getStoredMandate<Mandate>();
      try {
        const res = await fetch("/api/operator/strategy", {
          method: "POST",
          cache: "no-store",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
          body: JSON.stringify({
            sessionId,
            ...(cachedMandate ? { mandate: cachedMandate } : {}),
          }),
          signal: abort.signal,
        });

        if (res.status === 400 || res.status === 404) {
          setError(
            cachedMandate
              ? "Could not reach your profile on the server. Try again or restart the questions."
              : "Your session expired. Please answer the questions again.",
          );
          setPhase("no-session");
          return;
        }

        if (!res.ok || !res.body) {
          const body = await res.text().catch(() => "");
          throw new Error(body || "The strategy engine didn't respond.");
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
            const raw = buffer.slice(0, nl);
            buffer = buffer.slice(nl + 2);
            handleSseFrame(raw);
          }
        }
      } catch (err) {
        if (abort.signal.aborted) return;
        setError(err instanceof Error ? err.message : String(err));
        setPhase("ready");
      }
    };

    void run();
    return () => {
      abort.abort();
    };
  }, [handleSseFrame]);

  const handleExecute = useCallback(() => {
    if (!allocation) return;
    if (isAuthed) {
      void proceedToFunding();
      return;
    }
    setAuthOpen(true);
  }, [allocation, isAuthed, proceedToFunding]);

  const handleAdjustProfile = useCallback(async () => {
    try {
      await fetch("/api/inquisitor/reset", {
        method: "POST",
        cache: "no-store",
      });
    } catch {
      /* ignore */
    }
    router.push("/onboarding");
  }, [router]);

  const handleAuthDone = useCallback(async (result: AuthModalResult) => {
    setAuthOpen(false);
    setIsAuthed(true);
    setWalletAddress(result.walletAddress);
    await proceedToFunding(result.walletAddress);
  }, [proceedToFunding]);

  const handleFunded = useCallback(() => {
    setPhase("executing");
  }, []);

  const cardExplanation =
    allocation?.explanation?.trim() || explanation.trim() || undefined;

  return (
    <>
      <div className="relative min-h-[calc(100dvh-3.5rem)] bg-gradient-to-b from-[#EDF5FF] via-[#F7FAFF] to-white">
        <main className="mx-auto flex min-h-[calc(100dvh-3.5rem)] w-full max-w-lg flex-col items-center justify-center px-4 py-8">
          {error ? (
            <div className="absolute left-4 right-4 top-4 z-10 mx-auto max-w-lg">
              <ErrorBanner message={error} onDismiss={() => setError(null)} />
            </div>
          ) : null}

          <AnimatePresence mode="wait">
          {phase === "no-session" ? (
            <motion.div
              key="no-session"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="w-full max-w-md text-center"
            >
              <WizardIcon size={72} variant="float" className="mx-auto mb-4" rounded="rounded-2xl" />
              <h1 className="font-display text-xl text-text-primary">No profile yet</h1>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                I need to ask you a few questions before I can build a plan.
              </p>
              <Link
                href="/onboarding"
                className="mt-6 inline-block w-full rounded-full bg-accent-earn py-3 font-semibold text-white transition-opacity hover:opacity-90"
              >
                Start the questions →
              </Link>
            </motion.div>
          ) : phase === "executing" ? (
            <motion.div
              key="executing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full max-w-xl"
            >
              <ExecutionProgress />
            </motion.div>
          ) : phase === "funding" ? (
            <motion.div
              key="funding"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full max-w-xl"
            >
              <WalletFundingStep
                initialWalletAddress={walletAddress}
                onAuthRequired={() => {
                  setIsAuthed(false);
                  setAuthOpen(true);
                }}
                onFunded={handleFunded}
              />
            </motion.div>
          ) : phase === "ready" && allocation ? (
            <motion.div
              key="ready"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mx-auto w-full max-w-lg"
            >
              <AllocationCard
                allocation={allocation}
                capital={capital}
                apy={apy}
                annualEarnings={annualEarnings}
                explanation={cardExplanation}
                planSource={planSource}
                onExecute={handleExecute}
                onAdjustProfile={handleAdjustProfile}
                executeLabel={
                  isAuthed ? "Continue to funding →" : "Put this plan into action →"
                }
              />
            </motion.div>
          ) : phase === "ready" ? (
            <motion.div
              key="ready-fallback"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="w-full max-w-md text-center"
            >
              <p className="text-sm text-text-muted">
                I couldn&apos;t finish your plan. Try again or adjust your profile.
              </p>
              <button
                type="button"
                onClick={handleAdjustProfile}
                className="mt-4 rounded-full bg-accent-earn px-6 py-2.5 text-sm font-semibold text-white"
              >
                Back to questions →
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="streaming"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="flex w-full flex-col items-center text-center"
            >
              <WizardIcon size={88} variant="fast-float" className="mb-6" rounded="rounded-2xl" />

              <p className="font-display text-xl font-semibold text-text-primary">
                Building your plan…
              </p>

              <div className="mt-5 w-full max-w-md">
                {explanation ? (
                  <StreamingText text={explanation} caret className="text-left" />
                ) : (
                  <p className="text-sm leading-relaxed text-text-muted">
                    Looking at your profile and today&apos;s rates&hellip;
                  </p>
                )}
              </div>

              <div className="mt-6 flex items-center gap-2">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-earn" />
                <span
                  className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-earn/60"
                  style={{ animationDelay: "150ms" }}
                />
                <span
                  className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-earn/30"
                  style={{ animationDelay: "300ms" }}
                />
              </div>

              <p className="mt-4 text-xs text-text-muted/80">Usually about 10 seconds</p>
            </motion.div>
          )}
          </AnimatePresence>
        </main>
      </div>

      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onAuthenticated={handleAuthDone}
      />
    </>
  );
}

function ErrorBanner({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-2xl border border-status-danger/40 bg-status-danger/10 px-4 py-3 text-sm text-status-danger">
      <span>{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 text-xs underline underline-offset-2 hover:opacity-80"
      >
        dismiss
      </button>
    </div>
  );
}
