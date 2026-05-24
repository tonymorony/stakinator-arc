"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";

interface PlanExplanationProps {
  text: string;
  source?: "llm" | "fallback";
}

const PREVIEW_CHARS = 220;

export function PlanExplanation({ text, source }: PlanExplanationProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const trimmed = text.trim();
  if (!trimmed) return null;

  const isLong = trimmed.length > PREVIEW_CHARS;
  const preview = isLong ? `${trimmed.slice(0, PREVIEW_CHARS).trim()}…` : trimmed;

  const modal =
    mounted && modalOpen ? (
      createPortal(
        <AnimatePresence>
          <>
            <motion.div
              key="overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
              onClick={() => setModalOpen(false)}
              aria-hidden
            />
            <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                key="panel"
                initial={{ opacity: 0, scale: 0.97, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97, y: 8 }}
                transition={{ duration: 0.2 }}
                role="dialog"
                aria-modal="true"
                aria-labelledby="plan-reasoning-title"
                className="pointer-events-auto flex max-h-[min(80dvh,560px)] w-full max-w-lg flex-col rounded-2xl border border-border bg-bg-base shadow-xl"
              >
                <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-accent-earn">
                      Stakinator&apos;s reasoning
                    </p>
                    <h3
                      id="plan-reasoning-title"
                      className="mt-0.5 font-display text-lg text-text-primary"
                    >
                      Why this plan
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="rounded-lg px-2 py-1 text-sm text-text-muted hover:bg-bg-surface hover:text-text-primary"
                    aria-label="Close"
                  >
                    ✕
                  </button>
                </div>
                <div className="overflow-y-auto px-5 py-4">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-primary">
                    {trimmed}
                  </p>
                </div>
                <div className="border-t border-border px-5 py-3">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="w-full rounded-full bg-accent-earn py-2.5 text-sm font-semibold text-white"
                  >
                    Got it
                  </button>
                </div>
              </motion.div>
            </div>
          </>
        </AnimatePresence>,
        document.body,
      )
    ) : null;

  return (
    <>
      <div className="mt-2">
        {source ? (
          <span
            className={`mb-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
              source === "llm"
                ? "bg-accent-earn/10 text-accent-earn"
                : "bg-bg-elevated text-text-muted"
            }`}
          >
            {source === "llm" ? "Personalized by AI" : "Rule-based plan"}
          </span>
        ) : null}
        <p className="text-sm leading-relaxed text-text-muted">{preview}</p>
        {isLong ? (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="mt-2 text-sm font-medium text-accent-earn transition-opacity hover:opacity-80"
          >
            Read full reasoning →
          </button>
        ) : null}
      </div>
      {modal}
    </>
  );
}
