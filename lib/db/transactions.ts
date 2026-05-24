/**
 * Transaction-log store backed by Prisma when reachable, in-memory otherwise.
 * One row per user-visible action; rows are append-only.
 */
import { randomUUID } from "node:crypto";
import { hasDatabase, prisma } from "./client";

export type TransactionType =
  | "USYC_DEPOSIT"
  | "USDC_HOLD"
  | "SWAP"
  | "REBALANCE";

export interface TransactionRecord {
  id: string;
  userId: string;
  type: TransactionType;
  asset: string; // human-readable, e.g. "Safe Treasury Fund"
  amountUsdc: number;
  txHash: string | null;
  humanDescription: string;
  createdAt: Date;
}

declare global {
  // eslint-disable-next-line no-var
  var __stakTransactionsStore: Map<string, TransactionRecord[]> | undefined;
}

const memoryStore: Map<string, TransactionRecord[]> =
  globalThis.__stakTransactionsStore ?? new Map();
if (!globalThis.__stakTransactionsStore) {
  globalThis.__stakTransactionsStore = memoryStore;
}

let usePrisma = hasDatabase();
let warnedFallback = false;

function warnFallback(reason: string): void {
  if (warnedFallback) return;
  warnedFallback = true;
  // eslint-disable-next-line no-console
  console.warn(
    `[transactions] Persisting transactions in memory (${reason}). Configure DATABASE_URL for real persistence.`,
  );
}

function asReason(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

interface CreateInput {
  userId: string;
  type: TransactionType;
  asset: string;
  amountUsdc: number;
  txHash: string | null;
  humanDescription: string;
}

export async function createTransaction(input: CreateInput): Promise<TransactionRecord> {
  if (usePrisma) {
    try {
      const row = await prisma.transaction.create({
        data: {
          userId: input.userId,
          type: input.type,
          asset: input.asset,
          amountUsdc: input.amountUsdc,
          txHash: input.txHash,
          humanDescription: input.humanDescription,
        },
      });
      return rowToTx(row);
    } catch (err) {
      usePrisma = false;
      warnFallback(asReason(err));
    }
  }
  const record: TransactionRecord = {
    id: randomUUID(),
    userId: input.userId,
    type: input.type,
    asset: input.asset,
    amountUsdc: input.amountUsdc,
    txHash: input.txHash,
    humanDescription: input.humanDescription,
    createdAt: new Date(),
  };
  const bucket = memoryStore.get(input.userId) ?? [];
  bucket.push(record);
  memoryStore.set(input.userId, bucket);
  return record;
}

export async function listTransactionsForUser(
  userId: string,
  { limit = 50 }: { limit?: number } = {},
): Promise<TransactionRecord[]> {
  if (usePrisma) {
    try {
      const rows = await prisma.transaction.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: limit,
      });
      return rows.map(rowToTx);
    } catch (err) {
      usePrisma = false;
      warnFallback(asReason(err));
    }
  }
  const bucket = memoryStore.get(userId) ?? [];
  return [...bucket].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);
}

interface PrismaTxRow {
  id: string;
  userId: string;
  type: string;
  asset: string;
  amountUsdc: number;
  txHash: string | null;
  humanDescription: string;
  createdAt: Date;
}

function rowToTx(row: PrismaTxRow): TransactionRecord {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type as TransactionType,
    asset: row.asset,
    amountUsdc: row.amountUsdc,
    txHash: row.txHash,
    humanDescription: row.humanDescription,
    createdAt: row.createdAt,
  };
}
