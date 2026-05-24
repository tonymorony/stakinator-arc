"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { WizardIcon } from "@/components/WizardIcon";
import { SpeechBubble } from "@/components/inquisitor/SpeechBubble";
import { setStoredSessionId } from "@/lib/session/client";

export function HomeClient() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  const handleStart = async () => {
    if (busy || pending) return;
    setBusy(true);
    try {
      const res = await fetch("/api/inquisitor/start", {
        method: "POST",
        cache: "no-store",
      });
      if (res.ok) {
        const data = (await res.json()) as { sessionId?: string };
        if (data.sessionId) setStoredSessionId(data.sessionId);
      }
    } catch {
      /* The onboarding page recovers if the cookie is missing. */
    }
    startTransition(() => router.push("/onboarding"));
  };

  return (
    <main className="flex min-h-[calc(100vh-56px)] flex-col items-center justify-center px-4 py-10">
      <WizardIcon size={160} rounded="rounded-3xl" className="mb-6" />

      <SpeechBubble className="w-full max-w-md">
        <span className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-accent-earn/30 bg-accent-earn/10 px-2.5 py-0.5 text-xs font-semibold text-accent-earn">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-earn" />
          AI Agent
        </span>

        <p className="font-display text-xl font-semibold leading-snug text-text-primary">
          I manage your portfolio — automatically.
        </p>

        <p className="mt-2 text-sm leading-relaxed text-text-secondary">
          Tell me your goals. I&apos;ll build a strategy, allocate your funds
          across yield and cash, and rebalance when markets shift.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          {["No crypto experience", "No jargon", "No seed phrase"].map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-bg-surface px-2.5 py-0.5 text-xs text-text-muted"
            >
              {tag}
            </span>
          ))}
        </div>
      </SpeechBubble>

      <button
        type="button"
        onClick={handleStart}
        disabled={busy || pending}
        className="mt-5 rounded-full bg-accent-earn px-8 py-3.5 text-base font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
      >
        {busy || pending ? "Starting…" : "Let’s go! →"}
      </button>

      <div className="mt-16 flex flex-col items-center gap-3">
        <p className="text-[9px] uppercase tracking-widest text-text-muted">Built on</p>
        <div className="flex flex-wrap items-center justify-center gap-6">
          <a
            href="https://developers.circle.com"
            target="_blank"
            rel="noopener noreferrer"
            className="opacity-50 transition-opacity hover:opacity-100"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logos/circle.svg" alt="Circle" className="h-4 w-auto" />
          </a>
          <span className="h-3 w-px bg-border/80" />
          <a
            href="https://arc.network"
            target="_blank"
            rel="noopener noreferrer"
            className="opacity-50 transition-opacity hover:opacity-100"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logos/arc.svg" alt="Arc" className="h-4 w-auto" />
          </a>
          <span className="h-3 w-px bg-border/80" />
          <a
            href="https://www.anthropic.com"
            target="_blank"
            rel="noopener noreferrer"
            className="opacity-50 transition-opacity hover:opacity-100"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logos/anthropic.svg" alt="Anthropic" className="h-4 w-auto" />
          </a>
        </div>
        <a
          href="https://agora.thecanteenapp.com"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 flex items-center gap-1.5 text-[11px] text-text-muted transition-colors hover:text-accent-earn"
        >
          <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h10a1 1 0 001-1v-3M10 2h4m0 0v4m0-4L7 9"/>
          </svg>
          Agora Agents Hackathon
        </a>
      </div>
    </main>
  );
}
