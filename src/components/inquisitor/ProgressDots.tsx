interface QuestionProgressProps {
  total: number;
  /** Number of questions already answered. */
  asked: number;
}

export function ProgressDots({ total, asked }: QuestionProgressProps) {
  const current = Math.min(asked + 1, total);

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-text-primary">
          Question {current} of {total}
        </span>
        <span className="num shrink-0 text-[11px] text-text-muted">
          {Math.round((current / total) * 100)}%
        </span>
      </div>
      <div className="flex gap-1">
        {Array.from({ length: total }).map((_, i) => {
          const isComplete = i < asked;
          const isCurrent = i === asked;
          return (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
                isComplete
                  ? "bg-accent-earn"
                  : isCurrent
                    ? "bg-accent-earn/45 ring-1 ring-accent-earn/30"
                    : "bg-bg-elevated"
              }`}
            />
          );
        })}
      </div>
    </div>
  );
}
