import { NextResponse } from "next/server";
import { hasDatabase, prisma } from "./client";

export type DatabaseProblem =
  | "missing_url"
  | "connection_failed"
  | "schema_missing";

export type DatabaseStatus =
  | { ok: true }
  | { ok: false; code: DatabaseProblem; message: string };

/** Dev may run without Postgres; production requires a reachable schema. */
export function databaseRequiredInProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export function canUseMemoryFallback(): boolean {
  return !databaseRequiredInProduction();
}

export async function checkDatabase(): Promise<DatabaseStatus> {
  if (!hasDatabase()) {
    if (databaseRequiredInProduction()) {
      return {
        ok: false,
        code: "missing_url",
        message:
          "DATABASE_URL is not set. Add a Postgres URL in Vercel env vars and redeploy.",
      };
    }
    return { ok: true };
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    const schemaMissing =
      /does not exist|relation .* does not exist|P2021/i.test(detail);
    return {
      ok: false,
      code: schemaMissing ? "schema_missing" : "connection_failed",
      message: schemaMissing
        ? "Database tables are missing. Run `npx prisma db push` against your production DATABASE_URL."
        : `Cannot reach the database: ${detail}`,
    };
  }

  return { ok: true };
}

/** Returns a 503 JSON response when the database is unavailable in production. */
export async function databaseUnavailableResponse(): Promise<NextResponse | null> {
  const status = await checkDatabase();
  if (status.ok) return null;
  return NextResponse.json(
    { error: status.message, dbError: status.code },
    { status: 503 },
  );
}
