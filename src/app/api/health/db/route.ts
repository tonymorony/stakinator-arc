import { NextResponse } from "next/server";
import { checkDatabase } from "@/lib/db/health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/health/db
 * Quick check that production Postgres is configured and reachable.
 */
export async function GET(): Promise<NextResponse> {
  const status = await checkDatabase();
  if (status.ok) {
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json(
    { ok: false, code: status.code, error: status.message },
    { status: 503 },
  );
}
