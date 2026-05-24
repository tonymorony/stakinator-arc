import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

/**
 * Lazy Prisma singleton. Cached on the global to survive Next.js dev hot-reloads.
 * Construction doesn't open a connection — that happens on first query.
 */
export const prisma: PrismaClient =
  globalThis.__prisma ?? new PrismaClient({ log: ["error"] });

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}

/** True when DATABASE_URL is set to a non-empty value. */
export function hasDatabase(): boolean {
  const url = process.env.DATABASE_URL;
  return typeof url === "string" && url.length > 0;
}
