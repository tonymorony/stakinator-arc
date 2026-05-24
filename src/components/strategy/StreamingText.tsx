"use client";

import { useEffect, useRef } from "react";

interface StreamingTextProps {
  text: string;
  /** When true a soft caret blinks at the end to signal more is coming. */
  caret?: boolean;
  className?: string;
}

/**
 * Container that renders streamed strategy text. Auto-scrolls so the most
 * recent token stays in view as the model writes.
 */
export function StreamingText({
  text,
  caret = false,
  className = "",
}: StreamingTextProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [text]);

  return (
    <div
      ref={ref}
      className={`max-h-72 overflow-y-auto rounded-2xl border border-border bg-white p-6 shadow-[0_4px_24px_-4px_rgba(74,159,255,0.12)] ${className}`}
    >
      <p className="whitespace-pre-wrap text-base leading-relaxed text-text-primary">
        {text}
        {caret ? (
          <span
            aria-hidden
            className="ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[2px] animate-pulse rounded-full bg-accent-earn align-middle"
          />
        ) : null}
      </p>
    </div>
  );
}
