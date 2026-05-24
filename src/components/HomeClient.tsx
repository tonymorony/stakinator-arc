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
        credentials: "include",
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
        <div className="mt-4 flex items-center gap-4">
          <a
            href="https://github.com/tonymorony/stakinator-arc"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
            className="text-text-muted transition-colors hover:text-text-primary"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
              <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
          </a>
          <a
            href="https://x.com/stakinatorio"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="X (Twitter)"
            className="text-text-muted transition-colors hover:text-text-primary"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </a>
        </div>
      </div>
    </main>
  );
}
