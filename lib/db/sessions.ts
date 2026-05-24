/**
 * Anonymous-session storage.
 *
 * Backed by Prisma's AnonymousSession when DATABASE_URL is set and reachable.
 * Falls back transparently to an in-memory Map (process-local, dev-only) if the
 * connection fails — so the dialogue is demoable without any DB setup.
 */
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { hasDatabase, prisma } from "./client";
import type { AxisDistribution, Mandate } from "@/lib/inquisitor";
import { initDistribution } from "@/lib/inquisitor";
import type { Allocation } from "@/lib/ai/operator";

export interface SessionData {
  id: string;
  distribution: AxisDistribution;
  askedIds: string[];
  mandateJson: Mandate | null;
  allocationJson: Allocation | null;
  /** Set when the user has executed the strategy (allocation.approvedAt). */
  executedAt: Date | null;
  userId: string | null;
}

type SessionPatch = Partial<Omit<SessionData, "id">>;

declare global {
  // eslint-disable-next-line no-var
  var __stakSessionsStore: Map<string, SessionData> | undefined;
}

const memoryStore: Map<string, SessionData> =
  globalThis.__stakSessionsStore ?? new Map();
if (!globalThis.__stakSessionsStore) {
  globalThis.__stakSessionsStore = memoryStore;
}

/**
 * State of the fallback. We attempt Prisma once; if it errors we mark
 * `usePrisma = false` for the rest of this process and emit one warning.
 */
let usePrisma = hasDatabase();
let warnedFallback = false;

function warnFallback(reason: string): void {
  if (warnedFallback) return;
  warnedFallback = true;
  // eslint-disable-next-line no-console
  console.warn(
    `[sessions] Persisting anonymous sessions in memory (${reason}). ` +
      `Configure DATABASE_URL + run \`npx prisma migrate dev\` to persist them in Postgres.`,
  );
}

function freshSession(id: string): SessionData {
  return {
    id,
    distribution: initDistribution(),
    askedIds: [],
    mandateJson: null,
    allocationJson: null,
    executedAt: null,
    userId: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export async function createSession(): Promise<SessionData> {
  if (usePrisma) {
    try {
      const row = await prisma.anonymousSession.create({
        data: {
          distribution: initDistribution() as unknown as Prisma.InputJsonValue,
          askedIds: [],
        },
      });
      return rowToSession(row);
    } catch (err) {
      usePrisma = false;
      warnFallback(asReason(err));
    }
  }
  const id = randomUUID();
  const session = freshSession(id);
  memoryStore.set(id, session);
  return session;
}

export async function findSession(id: string): Promise<SessionData | null> {
  if (usePrisma) {
    try {
      const row = await prisma.anonymousSession.findUnique({ where: { id } });
      return row ? rowToSession(row) : null;
    } catch (err) {
      usePrisma = false;
      warnFallback(asReason(err));
    }
  }
  return memoryStore.get(id) ?? null;
}

/** Most recently updated session linked to a user (post-login). */
export async function findLatestSessionForUser(
  userId: string,
): Promise<SessionData | null> {
  if (usePrisma) {
    try {
      const row = await prisma.anonymousSession.findFirst({
        where: { userId },
        orderBy: { updatedAt: "desc" },
      });
      return row ? rowToSession(row) : null;
    } catch (err) {
      usePrisma = false;
      warnFallback(asReason(err));
    }
  }
  let latest: SessionData | null = null;
  for (const session of memoryStore.values()) {
    if (session.userId !== userId) continue;
    if (!latest) {
      latest = session;
      continue;
    }
    // Memory store has no updatedAt — prefer session with more progress.
    const score = (s: SessionData) =>
      (s.allocationJson ? 2 : 0) + (s.mandateJson ? 1 : 0);
    if (score(session) >= score(latest)) latest = session;
  }
  return latest;
}

/**
 * Resolves the best anonymous session for authenticated API routes.
 * Tries body id → cookie id → latest session linked to the user.
 * When `preferWithAllocation` is set, picks the first candidate that has a plan.
 */
export async function resolveAnonymousSession(options: {
  bodySessionId?: string | null;
  cookieSessionId?: string | null;
  userId?: string | null;
  preferWithAllocation?: boolean;
}): Promise<SessionData | null> {
  const candidates: SessionData[] = [];
  const seen = new Set<string>();

  const push = (session: SessionData | null) => {
    if (!session || seen.has(session.id)) return;
    seen.add(session.id);
    candidates.push(session);
  };

  for (const id of [options.bodySessionId, options.cookieSessionId]) {
    if (!id) continue;
    push(await findSession(id));
  }

  if (options.userId) {
    push(await findLatestSessionForUser(options.userId));
  }

  if (options.preferWithAllocation) {
    return candidates.find((s) => s.allocationJson) ?? candidates[0] ?? null;
  }

  return candidates[0] ?? null;
}

export async function updateSession(
  id: string,
  patch: SessionPatch,
): Promise<SessionData> {
  if (usePrisma) {
    try {
      const row = await prisma.anonymousSession.update({
        where: { id },
        data: {
          distribution:
            patch.distribution !== undefined
              ? (patch.distribution as unknown as Prisma.InputJsonValue)
              : undefined,
          askedIds: patch.askedIds,
          mandateJson:
            patch.mandateJson === null
              ? Prisma.JsonNull
              : patch.mandateJson !== undefined
                ? (patch.mandateJson as unknown as Prisma.InputJsonValue)
                : undefined,
          allocationJson:
            patch.allocationJson === null
              ? Prisma.JsonNull
              : patch.allocationJson !== undefined
                ? (patch.allocationJson as unknown as Prisma.InputJsonValue)
                : undefined,
          userId: patch.userId,
        },
      });
      return rowToSession(row);
    } catch (err) {
      usePrisma = false;
      warnFallback(asReason(err));
    }
  }
  const existing = memoryStore.get(id);
  if (!existing) {
    throw new Error(`Session ${id} not found`);
  }
  const next: SessionData = { ...existing, ...patch } as SessionData;
  memoryStore.set(id, next);
  return next;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

type PrismaSessionRow = {
  id: string;
  distribution: unknown;
  askedIds: string[];
  mandateJson: unknown;
  allocationJson?: unknown;
  userId: string | null;
};

function rowToSession(row: PrismaSessionRow): SessionData {
  return {
    id: row.id,
    distribution: row.distribution as AxisDistribution,
    askedIds: row.askedIds,
    mandateJson: (row.mandateJson as Mandate | null) ?? null,
    allocationJson: (row.allocationJson as Allocation | null) ?? null,
    // executedAt is in-memory only; Prisma stores allocation.approvedAt instead.
    executedAt: null,
    userId: row.userId,
  };
}

function asReason(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
