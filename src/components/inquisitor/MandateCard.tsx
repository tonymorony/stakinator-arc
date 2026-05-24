"use client";

import { motion } from "framer-motion";
import { WizardIcon } from "@/components/WizardIcon";
import {
  AXIS_LABELS,
  type Mandate,
  type MandateAxes,
} from "@/lib/inquisitor";

interface MandateCardProps {
  /** Streaming summary text (overrides mandate.summary_human while streaming). */
  summary: string;
  mandate: Mandate | null;
  onBuildPlan: () => void;
  onStartOver: () => void;
  building?: boolean;
}

const PILL_AXES: Array<keyof MandateAxes> = [
  "risk_tolerance",
  "horizon",
];

export function MandateCard({
  summary,
  mandate,
  onBuildPlan,
  onStartOver,
  building,
}: MandateCardProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mx-auto w-full max-w-md py-4 text-center sm:py-6"
    >
      <div className="mx-auto mb-4 w-24 shrink-0 sm:mb-5 sm:w-28">
        <WizardIcon
          size={96}
          variant="celebrate"
          className="wizard-glow mx-auto"
          rounded="rounded-2xl"
          bounceKey="mandate-celebrate"
        />
      </div>

      <p className="mb-3 text-sm text-text-muted">
        Here&apos;s what I found out about you:
      </p>

      <div className="mb-6 max-h-[min(42dvh,20rem)] overflow-y-auto rounded-2xl border border-border/70 bg-white/90 px-5 py-4 text-left shadow-[0_4px_24px_-4px_rgba(74,159,255,0.1)] [scrollbar-gutter:stable]">
        <p className="font-display text-base leading-relaxed text-text-primary sm:text-lg">
          {summary || (mandate ? mandate.summary_human : "Putting it together…")}
        </p>
      </div>

      {mandate ? (
        <ul className="mb-8 flex flex-wrap justify-center gap-2">
          {PILL_AXES.map((axis) => {
            const bucket = mandate[axis];
            const labels = AXIS_LABELS[axis] as Record<string, string>;
            const label = labels[bucket as string] ?? String(bucket);
            return (
              <li
                key={axis}
                className="rounded-full border border-border bg-bg-surface px-3 py-1 text-sm text-text-muted"
              >
                {label}
              </li>
            );
          })}
        </ul>
      ) : null}

      <button
        type="button"
        onClick={onBuildPlan}
        disabled={!mandate || building}
        className="w-full max-w-xs rounded-full bg-accent-earn px-6 py-3.5 font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
      >
        {building ? "Working on it…" : "Build my plan →"}
      </button>

      <button
        type="button"
        onClick={onStartOver}
        className="mt-3 block w-full text-sm text-text-muted transition-colors hover:text-text-primary"
      >
        Start over ↺
      </button>
    </motion.section>
  );
}
