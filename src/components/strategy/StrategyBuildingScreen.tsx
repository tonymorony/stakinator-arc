"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const STEPS = [
  "Reading your profile…",
  "Checking today's safe-fund rate…",
  "Balancing growth and safety…",
  "Writing your personalised plan…",
];

interface StrategyBuildingScreenProps {
  /** Increments as SSE chunks arrive — nudges the step indicator forward. */
  streamProgress?: number;
}

export function StrategyBuildingScreen({
  streamProgress = 0,
}: StrategyBuildingScreenProps) {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (streamProgress > 0) {
      setStepIndex((i) => Math.min(STEPS.length - 1, Math.max(i, 1)));
    }
  }, [streamProgress]);

  useEffect(() => {
    const timer = setInterval(() => {
      setStepIndex((i) => (i < STEPS.length - 1 ? i + 1 : i));
    }, 2800);
    return () => clearInterval(timer);
  }, []);

  const progress = ((stepIndex + 1) / STEPS.length) * 100;

  return (
    <div className="w-full max-w-sm">
      <AnimatePresence mode="wait">
        <motion.p
          key={STEPS[stepIndex]}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.22 }}
          className="text-sm leading-relaxed text-text-muted"
        >
          {STEPS[stepIndex]}
        </motion.p>
      </AnimatePresence>

      <div className="mt-4 h-1 overflow-hidden rounded-full bg-bg-elevated">
        <motion.div
          className="h-full rounded-full bg-accent-earn"
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.45, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}
