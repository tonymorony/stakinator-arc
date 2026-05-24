"use client";

import { useMemo } from "react";
import { TokenIcon, bucketToken } from "@/components/TokenIcon";
import type { BucketView } from "./BucketBreakdown";

const R = 36;
const CIRC = 2 * Math.PI * R;
const CX = 50;
const CY = 50;

const COLORS: Record<BucketView["key"], string> = {
  safe: "#22c55e",
  liquid: "#2775CA",
  euro: "#7c3aed",
  growth: "#94a3b8",
};

const TOKEN_LABELS: Record<BucketView["key"], string> = {
  safe: "USYC",
  liquid: "USDC",
  euro: "EURC",
  growth: "Stocks",
};

interface Segment {
  key: BucketView["key"];
  name: string;
  percentage: number;
  dashLen: number;
  rotation: number;
}

export function AllocationChart({ buckets }: { buckets: BucketView[] }) {
  const segments = useMemo<Segment[]>(() => {
    const active = buckets.filter((b) => b.percentage > 0.5);
    let cumPct = 0;
    return active.map((b) => {
      const dashLen = (b.percentage / 100) * CIRC;
      const rotation = -90 + (cumPct / 100) * 360;
      cumPct += b.percentage;
      return {
        key: b.key,
        name: b.name,
        percentage: b.percentage,
        dashLen,
        rotation,
      };
    });
  }, [buckets]);

  if (segments.length === 0) return null;

  const totalPct = segments.reduce((s, seg) => s + seg.percentage, 0);

  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
      {/* Donut */}
      <div className="flex shrink-0 items-center justify-center">
        <svg viewBox="0 0 100 100" className="h-36 w-36">
          {/* Track */}
          <circle
            cx={CX}
            cy={CY}
            r={R}
            fill="none"
            stroke="var(--color-border, #e5e7eb)"
            strokeWidth={12}
          />
          {segments.map((seg) => (
            <circle
              key={seg.key}
              cx={CX}
              cy={CY}
              r={R}
              fill="none"
              stroke={COLORS[seg.key]}
              strokeWidth={12}
              strokeDasharray={`${seg.dashLen} ${CIRC}`}
              strokeLinecap="butt"
              transform={`rotate(${seg.rotation}, ${CX}, ${CY})`}
            />
          ))}
          {/* Center text */}
          <text
            x={CX}
            y={CY - 4}
            textAnchor="middle"
            fontSize="14"
            fontWeight="700"
            fill="currentColor"
          >
            {Math.round(totalPct)}%
          </text>
          <text
            x={CX}
            y={CY + 10}
            textAnchor="middle"
            fontSize="7"
            fill="#6b7280"
          >
            allocated
          </text>
        </svg>
      </div>

      {/* Legend */}
      <ul className="flex-1 space-y-2.5">
        {segments.map((seg) => {
          const token = bucketToken(seg.key);
          return (
          <li key={seg.key} className="flex items-center gap-2">
            {token ? (
              <TokenIcon token={token} size={20} />
            ) : (
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: COLORS[seg.key] }}
              />
            )}
            <div className="flex flex-1 items-center justify-between gap-2">
              <div>
                <span className="text-xs font-semibold text-text-primary">
                  {TOKEN_LABELS[seg.key]}
                </span>
                <span className="ml-1.5 text-xs text-text-muted">
                  {seg.name}
                </span>
                {seg.key === "growth" ? (
                  <span className="ml-1.5 rounded-full bg-accent-launch/15 px-1 py-0.5 text-[9px] font-medium text-accent-launch">
                    Soon
                  </span>
                ) : null}
              </div>
              <span className="num text-sm font-semibold text-text-primary">
                {Math.round(seg.percentage)}%
              </span>
            </div>
          </li>
          );
        })}
      </ul>
    </div>
  );
}
