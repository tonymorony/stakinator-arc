"use client";

import { AnimatedNumber } from "./AnimatedNumber";
import { formatUsd, formatUsd2 } from "@/lib/format";

interface PortfolioOverviewProps {
  totalValue: number;
  dailyYield: number;
  apy: number;
}

/**
 * Three-number summary at the top of the dashboard.
 * All numbers animate when the Loop returns updated values.
 */
export function PortfolioOverview({
  totalValue,
  dailyYield,
  apy,
}: PortfolioOverviewProps) {
  return (
    <section className="mb-8 rounded-2xl border border-border bg-bg-surface p-6">
      <div className="flex flex-col items-center gap-6 text-center md:flex-row md:items-end md:justify-between md:gap-12 md:text-left">
        <Stat label="Total value" primary>
          <AnimatedNumber
            value={totalValue}
            format={formatUsd2}
            className="num font-display text-5xl font-bold text-text-primary"
          />
        </Stat>
        <Stat label="Earned today">
          <span className="num font-display text-2xl text-text-muted">
            <AnimatedNumber value={dailyYield} format={formatUsd2} />
          </span>
        </Stat>
        <Stat label="Annual rate">
          <span className="num font-display text-2xl text-text-muted">
            <AnimatedNumber
              value={apy}
              format={(v) => `${v.toFixed(1)}%`}
            />
          </span>
        </Stat>
      </div>
    </section>
  );
}

interface StatProps {
  label: string;
  primary?: boolean;
  children: React.ReactNode;
}

function Stat({ label, primary, children }: StatProps) {
  return (
    <div>
      <div className={primary ? "" : "flex flex-col items-center md:items-start"}>
        {children}
      </div>
      <p className="mt-1 text-xs uppercase tracking-wide text-text-muted">
        {label}
      </p>
    </div>
  );
}

/* Re-export a server-side wrapper for tests/static rendering if needed. */
export function staticTotalsForDebug(props: PortfolioOverviewProps): string {
  return `${formatUsd(props.totalValue)} / ${formatUsd(props.dailyYield)} per day / ${props.apy.toFixed(1)}%`;
}
