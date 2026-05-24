import { type ReactNode } from "react";

interface SpeechBubbleProps {
  children: ReactNode;
  className?: string;
  /** Set false to omit the upward-pointing triangle. */
  pointer?: boolean;
}

/**
 * Rounded surface card with an upward triangle that visually attaches to the
 * Stakinator character above it. The triangle is drawn with two stacked
 * pseudo-elements (border + fill) so the bubble's border line is continuous.
 */
export function SpeechBubble({
  children,
  className = "",
  pointer = true,
}: SpeechBubbleProps) {
  const pointerClasses = pointer
    ? [
        "before:content-[''] before:absolute before:left-1/2 before:-translate-x-1/2 before:-top-[11px]",
        "before:w-0 before:h-0 before:border-x-[11px] before:border-x-transparent",
        "before:border-b-[11px] before:border-b-border",
        "after:content-[''] after:absolute after:left-1/2 after:-translate-x-1/2 after:-top-[10px]",
        "after:w-0 after:h-0 after:border-x-[10px] after:border-x-transparent",
        "after:border-b-[10px] after:border-b-bg-surface",
      ].join(" ")
    : "";

  return (
    <div
      className={`relative rounded-2xl border border-border bg-white px-6 py-5 text-text-primary shadow-[0_4px_24px_-4px_rgba(74,159,255,0.12)] ${pointerClasses} ${className}`}
    >
      {children}
    </div>
  );
}
