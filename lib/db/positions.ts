/**
 * Position store — one row per (userId, asset). Upserted by Execution and
 * Loop. Prisma-or-memory pattern, same as the other stores.
 */
import { randomUUID } from "node:crypto";
import { hasDatabase, prisma } from "./client";

export type PositionAsset = "USYC" | "USDC" | "EURC";

export interface PositionRecord {
  id: string;
  userId: string;
  asset: PositionAsset;
  amountUsdc: number;
  percentage: number;
  updatedAt: Date;
}

declare global {
  // eslint-disable-next-line no-var
  var __stakPositionsStore:
    | Map<string, Map<PositionAsset, PositionRecord>>
    | undefined;
}

const memoryStore: Map<string, Map<PositionAsset, PositionRecord>> =
  globalThis.__stakPositionsStore ?? new Map();
if (!globalThis.__stakPositionsStore) {
  globalThis.__stakPositionsStore = memoryStore;
}

let usePrisma = hasDatabase();
let warnedFallback = false;

function warnFallback(reason: string): void {
  if (warnedFallback) return;
  warnedFallback = true;
  // eslint-disable-next-line no-console
  console.warn(
    `[positions] Persisting positions in memory (${reason}). Configure DATABASE_URL for real persistence.`,
  );
}

function asReason(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

interface UpsertInput {
  userId: string;
  asset: PositionAsset;
  amountUsdc: number;
  percentage: number;
}

export async function upsertPosition(input: UpsertInput): Promise<PositionRecord> {
  if (usePrisma) {
    try {
      const existing = await prisma.position.findFirst({
        where: { userId: input.userId, asset: input.asset },
      });
      if (existing) {
        const row = await prisma.position.update({
          where: { id: existing.id },
          data: {
            amountUsdc: input.amountUsdc,
            percentage: input.percentage,
          },
        });
        return rowToPosition(row);
      }
      const row = await prisma.position.create({
        data: {
          userId: input.userId,
          asset: input.asset,
          amountUsdc: input.amountUsdc,
          percentage: input.percentage,
        },
      });
      return rowToPosition(row);
    } catch (err) {
      usePrisma = false;
      warnFallback(asReason(err));
    }
  }

  const bucket = memoryStore.get(input.userId) ?? new Map<PositionAsset, PositionRecord>();
  const existing = bucket.get(input.asset);
  const record: PositionRecord = {
    id: existing?.id ?? randomUUID(),
    userId: input.userId,
    asset: input.asset,
    amountUsdc: input.amountUsdc,
    percentage: input.percentage,
    updatedAt: new Date(),
  };
  bucket.set(input.asset, record);
  memoryStore.set(input.userId, bucket);
  return record;
}

export async function listPositionsForUser(userId: string): Promise<PositionRecord[]> {
  if (usePrisma) {
    try {
      const rows = await prisma.position.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" },
      });
      return rows.map(rowToPosition);
    } catch (err) {
      usePrisma = false;
      warnFallback(asReason(err));
    }
  }
  const bucket = memoryStore.get(userId);
  if (!bucket) return [];
  return Array.from(bucket.values()).sort((a, b) => a.asset.localeCompare(b.asset));
}

interface PrismaPositionRow {
  id: string;
  userId: string;
  asset: string;
  amountUsdc: number;
  percentage: number;
  updatedAt: Date;
}

function rowToPosition(row: PrismaPositionRow): PositionRecord {
  return {
    id: row.id,
    userId: row.userId,
    asset: row.asset as PositionAsset,
    amountUsdc: row.amountUsdc,
    percentage: row.percentage,
    updatedAt: row.updatedAt,
  };
}
