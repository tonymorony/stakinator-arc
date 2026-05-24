/**
 * Rebalance log — one row per Loop check-in (even when no rebalance ran).
 * Prisma-or-memory pattern; in-memory map pinned on globalThis for dev.
 */
import { randomUUID } from "node:crypto";
import { hasDatabase, prisma } from "./client";
import type { Allocation } from "@/lib/ai/operator";

export type RebalanceTrigger = "drift" | "regime_shift" | "manual";

export interface RebalanceRecord {
  id: string;
  userId: string;
  trigger: RebalanceTrigger;
  driftDetected: number;
  previousAllocation: Pick<Allocation, "usycPct" | "liquidPct" | "growthPct">;
  newAllocation: Pick<Allocation, "usycPct" | "liquidPct" | "growthPct">;
  explanation: string;
  executed: boolean;
  createdAt: Date;
}

declare global {
  // eslint-disable-next-line no-var
  var __stakRebalancesStore: Map<string, RebalanceRecord[]> | undefined;
  // eslint-disable-next-line no-var
  var __stakLoopLocks: Set<string> | undefined;
}

const memoryStore: Map<string, RebalanceRecord[]> =
  globalThis.__stakRebalancesStore ?? new Map();
if (!globalThis.__stakRebalancesStore) {
  globalThis.__stakRebalancesStore = memoryStore;
}

const locks: Set<string> = globalThis.__stakLoopLocks ?? new Set();
if (!globalThis.__stakLoopLocks) {
  globalThis.__stakLoopLocks = locks;
}

let usePrisma = hasDatabase();
let warnedFallback = false;

function warnFallback(reason: string): void {
  if (warnedFallback) return;
  warnedFallback = true;
  // eslint-disable-next-line no-console
  console.warn(
    `[rebalances] Persisting rebalances in memory (${reason}).`,
  );
}

function asReason(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

interface CreateInput {
  userId: string;
  trigger: RebalanceTrigger;
  driftDetected: number;
  previousAllocation: Pick<Allocation, "usycPct" | "liquidPct" | "growthPct">;
  newAllocation: Pick<Allocation, "usycPct" | "liquidPct" | "growthPct">;
  explanation: string;
  executed: boolean;
}

export async function createRebalance(
  input: CreateInput,
): Promise<RebalanceRecord> {
  if (usePrisma) {
    try {
      const row = await prisma.rebalance.create({
        data: {
          userId: input.userId,
          trigger: input.trigger,
          driftDetected: input.driftDetected,
          previousAllocation: input.previousAllocation as unknown as object,
          newAllocation: input.newAllocation as unknown as object,
          explanation: input.explanation,
          executed: input.executed,
        },
      });
      return rowToRebalance(row);
    } catch (err) {
      usePrisma = false;
      warnFallback(asReason(err));
    }
  }

  const record: RebalanceRecord = {
    id: randomUUID(),
    userId: input.userId,
    trigger: input.trigger,
    driftDetected: input.driftDetected,
    previousAllocation: input.previousAllocation,
    newAllocation: input.newAllocation,
    explanation: input.explanation,
    executed: input.executed,
    createdAt: new Date(),
  };
  const bucket = memoryStore.get(input.userId) ?? [];
  bucket.push(record);
  memoryStore.set(input.userId, bucket);
  return record;
}

export async function findLatestRebalance(
  userId: string,
): Promise<RebalanceRecord | null> {
  if (usePrisma) {
    try {
      const row = await prisma.rebalance.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
      });
      return row ? rowToRebalance(row) : null;
    } catch (err) {
      usePrisma = false;
      warnFallback(asReason(err));
    }
  }
  const bucket = memoryStore.get(userId) ?? [];
  if (bucket.length === 0) return null;
  return [...bucket].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  )[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// Concurrency guard — one Loop in flight per user at a time.
// ─────────────────────────────────────────────────────────────────────────────

export function tryAcquireLoopLock(userId: string): boolean {
  if (locks.has(userId)) return false;
  locks.add(userId);
  return true;
}

export function releaseLoopLock(userId: string): void {
  locks.delete(userId);
}

// ─────────────────────────────────────────────────────────────────────────────

interface PrismaRebalanceRow {
  id: string;
  userId: string;
  trigger: string;
  driftDetected: number;
  previousAllocation: unknown;
  newAllocation: unknown;
  explanation: string;
  executed: boolean;
  createdAt: Date;
}

function rowToRebalance(row: PrismaRebalanceRow): RebalanceRecord {
  return {
    id: row.id,
    userId: row.userId,
    trigger: row.trigger as RebalanceTrigger,
    driftDetected: row.driftDetected,
    previousAllocation: row.previousAllocation as RebalanceRecord["previousAllocation"],
    newAllocation: row.newAllocation as RebalanceRecord["newAllocation"],
    explanation: row.explanation,
    executed: row.executed,
    createdAt: row.createdAt,
  };
}
