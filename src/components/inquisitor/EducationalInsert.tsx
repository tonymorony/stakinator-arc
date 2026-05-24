"use client";

import { motion } from "framer-motion";
import type { EducationalInsert as Insert } from "@/lib/inquisitor";

interface EducationalInsertProps {
  insert: Insert;
  onContinue: () => void;
  disabled?: boolean;
}

/**
 * Inline lesson card that slides in below a dimmed question. The user can
 * follow the optional `Learn more` link in a new tab, then click the continue
 * CTA which is the trigger that finally submits the original answer.
 */
export function EducationalInsert({
  insert,
  onContinue,
  disabled,
}: EducationalInsertProps) {
  return (
    <motion.div
      role="region"
      aria-label={insert.title}
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="mx-auto mt-4 max-w-lg rounded-2xl border border-accent-earn/25 bg-accent-earn/[0.08] p-5"
    >
      <h3 className="font-semibold text-text-primary">
        <span aria-hidden>ℹ️ </span>
        {insert.title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-text-muted">
        {insert.body}
      </p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        {insert.learnMoreUrl ? (
          <a
            href={insert.learnMoreUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="text-sm text-accent-earn underline underline-offset-2 hover:opacity-80"
          >
            {insert.learnMoreLabel ?? "Learn more →"}
          </a>
        ) : (
          <span />
        )}

        <button
          type="button"
          onClick={onContinue}
          disabled={disabled}
          className="rounded-full border border-accent-earn/50 px-4 py-2 text-sm font-medium text-accent-earn transition-colors hover:bg-accent-earn/10 disabled:cursor-wait disabled:opacity-50"
        >
          {insert.continueLabel}
        </button>
      </div>
    </motion.div>
  );
}
