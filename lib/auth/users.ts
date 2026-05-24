/**
 * User store backed by Prisma when DATABASE_URL is reachable, with an
 * in-memory fallback for dev. Mirrors the pattern in `lib/db/sessions.ts`.
 */
import { randomUUID } from "node:crypto";
import { hasDatabase, prisma } from "@/lib/db/client";
import { canUseMemoryFallback } from "@/lib/db/health";
import { provisionWallet } from "@/lib/arc/wallet";
import type { AuthSessionPayload } from "@/lib/auth/session";

export interface AppUser {
  id: string;
  email: string;
  walletAddress: string | null;
  createdAt: Date;
}

interface UserPatch {
  walletAddress?: string | null;
}

declare global {
  // eslint-disable-next-line no-var
  var __stakUsersById: Map<string, AppUser> | undefined;
  // eslint-disable-next-line no-var
  var __stakUsersByEmail: Map<string, string> | undefined;
}

const memoryStore: Map<string, AppUser> =
  globalThis.__stakUsersById ?? new Map();
if (!globalThis.__stakUsersById) {
  globalThis.__stakUsersById = memoryStore;
}

const memoryEmailIndex: Map<string, string> =
  globalThis.__stakUsersByEmail ?? new Map();
if (!globalThis.__stakUsersByEmail) {
  globalThis.__stakUsersByEmail = memoryEmailIndex;
}

let usePrisma = hasDatabase();
let warnedFallback = false;

function disablePrismaAfterError(err: unknown): void {
  usePrisma = false;
  const reason = asReason(err);
  if (!canUseMemoryFallback()) {
    throw new Error(
      `[users] Database required in production (${reason}). Set DATABASE_URL and run \`npx prisma db push\`.`,
    );
  }
  if (!warnedFallback) {
    warnedFallback = true;
    // eslint-disable-next-line no-console
    console.warn(
      `[users] Persisting users in memory (${reason}). Configure DATABASE_URL + run \`npx prisma db push\` for real persistence.`,
    );
  }
}

function asReason(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export async function findUserByEmail(email: string): Promise<AppUser | null> {
  const e = email.toLowerCase();
  if (usePrisma) {
    try {
      const row = await prisma.user.findUnique({ where: { email: e } });
      return row ? rowToUser(row) : null;
    } catch (err) {
      disablePrismaAfterError(err);
    }
  }
  const id = memoryEmailIndex.get(e);
  return id ? memoryStore.get(id) ?? null : null;
}

export async function findUserById(id: string): Promise<AppUser | null> {
  if (usePrisma) {
    try {
      const row = await prisma.user.findUnique({ where: { id } });
      return row ? rowToUser(row) : null;
    } catch (err) {
      disablePrismaAfterError(err);
    }
  }
  return memoryStore.get(id) ?? null;
}

export async function createUser(params: {
  email: string;
  walletAddress: string | null;
}): Promise<AppUser> {
  const email = params.email.toLowerCase();
  if (usePrisma) {
    try {
      const row = await prisma.user.create({
        data: {
          email,
          walletAddress: params.walletAddress ?? undefined,
        },
      });
      return rowToUser(row);
    } catch (err) {
      disablePrismaAfterError(err);
    }
  }

  const id = randomUUID();
  const user: AppUser = {
    id,
    email,
    walletAddress: params.walletAddress,
    createdAt: new Date(),
  };
  memoryStore.set(id, user);
  memoryEmailIndex.set(email, id);
  return user;
}

export async function updateUser(id: string, patch: UserPatch): Promise<AppUser> {
  if (usePrisma) {
    try {
      const row = await prisma.user.update({
        where: { id },
        data: {
          walletAddress:
            patch.walletAddress === null ? null : patch.walletAddress ?? undefined,
        },
      });
      return rowToUser(row);
    } catch (err) {
      disablePrismaAfterError(err);
    }
  }
  const existing = memoryStore.get(id);
  if (!existing) throw new Error(`User ${id} not found`);
  const next: AppUser = { ...existing, ...patch };
  memoryStore.set(id, next);
  return next;
}

/**
 * Wallet address for an authenticated request — DB first, then the signed
 * session cookie, then deterministic re-provision from email.
 */
export async function resolveWalletAddress(authed: {
  sub: string;
  email: string;
  walletAddress: string | null;
}): Promise<string | null> {
  const user = await findUserById(authed.sub);
  if (user?.walletAddress) return user.walletAddress;

  const fromSession = authed.walletAddress?.trim();
  if (fromSession) {
    if (user) {
      try {
        await updateUser(user.id, { walletAddress: fromSession });
      } catch {
        /* best-effort persist */
      }
    }
    return fromSession;
  }

  if (!authed.email) return null;

  const { walletAddress } = await provisionWallet(authed.email);
  if (user) {
    try {
      await updateUser(user.id, { walletAddress });
    } catch {
      /* best-effort persist */
    }
  }
  return walletAddress;
}

/**
 * Ensures a User row exists for a signed auth cookie — heals stale cookies
 * from pre-DB deploys and serverless in-memory eras.
 */
export async function ensureUserFromAuthSession(
  authed: Pick<AuthSessionPayload, "sub" | "email" | "walletAddress">,
): Promise<AppUser> {
  const byId = await findUserById(authed.sub);
  if (byId) return byId;

  const email = authed.email.toLowerCase();
  const byEmail = await findUserByEmail(email);
  if (byEmail) return byEmail;

  let wallet = authed.walletAddress?.trim() || null;
  if (!wallet) {
    const provisioned = await provisionWallet(email);
    wallet = provisioned.walletAddress;
  }

  if (usePrisma) {
    try {
      const row = await prisma.user.create({
        data: {
          id: authed.sub,
          email,
          walletAddress: wallet ?? undefined,
        },
      });
      return rowToUser(row);
    } catch (err) {
      disablePrismaAfterError(err);
    }
  }

  const user: AppUser = {
    id: authed.sub,
    email,
    walletAddress: wallet,
    createdAt: new Date(),
  };
  memoryStore.set(user.id, user);
  memoryEmailIndex.set(email, user.id);
  return user;
}

interface PrismaUserRow {
  id: string;
  email: string;
  walletAddress: string | null;
  createdAt: Date;
}

function rowToUser(row: PrismaUserRow): AppUser {
  return {
    id: row.id,
    email: row.email,
    walletAddress: row.walletAddress,
    createdAt: row.createdAt,
  };
}
