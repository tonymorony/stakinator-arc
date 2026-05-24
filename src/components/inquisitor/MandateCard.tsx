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
      className="mx-auto max-w-md py-10 text-center"
    >
      <div className="mx-auto mb-5 w-28">
        <WizardIcon
          size={112}
          variant="celebrate"
          className="wizard-glow mx-auto"
          rounded="rounded-2xl"
          bounceKey="mandate-celebrate"
        />
      </div>

      <p className="mb-3 text-sm text-text-muted">
        Here&apos;s what I found out about you:
      </p>

      <p className="mb-6 font-display text-xl leading-relaxed text-text-primary">
        {summary || (mandate ? mandate.summary_human : "Putting it together…")}
      </p>

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
