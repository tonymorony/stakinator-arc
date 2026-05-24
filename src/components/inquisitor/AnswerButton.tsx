"use client";

import type { ButtonHTMLAttributes } from "react";

interface AnswerButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  restored?: boolean;
  ghost?: boolean;
}

export function AnswerButton({
  selected = false,
  restored = false,
  ghost = false,
  className = "",
  children,
  ...rest
}: AnswerButtonProps) {
  const base =
    "group w-full rounded-2xl border px-5 py-4 text-left font-medium transition-all duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60";

  const tone = selected
    ? "border-accent-earn bg-accent-earn text-white shadow-md"
    : restored
      ? "border-accent-earn/50 bg-accent-earn/8 text-text-primary shadow-sm ring-1 ring-accent-earn/20"
      : ghost
        ? "border-border bg-white/70 text-text-muted shadow-[0_1px_3px_rgba(0,0,0,0.05)] hover:bg-white hover:text-text-primary hover:shadow-sm"
        : "border-border bg-white text-text-primary shadow-[0_1px_4px_rgba(0,0,0,0.06)] hover:border-accent-earn/50 hover:shadow-[0_4px_16px_-2px_rgba(74,159,255,0.14)]";

  return (
    <button type="button" className={`${base} ${tone} ${className}`} {...rest}>
      <span className="flex items-center justify-between gap-3">
        <span className="flex-1 leading-snug">{children}</span>
        <span
          aria-hidden
          className={`shrink-0 text-base transition-all duration-150 ${
            selected
              ? "text-white"
              : restored
                ? "text-accent-earn opacity-80"
                : "translate-x-0 text-accent-earn opacity-0 group-hover:translate-x-0.5 group-hover:opacity-70"
          }`}
        >
          {selected ? "✓" : restored ? "↺" : "→"}
        </span>
      </span>
    </button>
  );
}
