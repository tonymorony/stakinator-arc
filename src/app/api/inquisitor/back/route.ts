import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { findSession, updateSession } from "@/lib/db/sessions";
import type { AxisDistribution } from "@/lib/inquisitor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const COOKIE_NAME = "stak.sid";

/**
 * POST /api/inquisitor/back
 *
 * Restores the session to a previous state (distribution + askedIds).
 * The client passes the snapshot it wants to roll back to — it owns the history stack.
 *
 * Body: { sessionId?, distribution, askedIds: string[] }
 */
export async function POST(req: NextRequest): Promise<Response> {
  const jar = await cookies();
  const sidFromCookie = jar.get(COOKIE_NAME)?.value;

  const body = (await req.json().catch(() => null)) as {
    sessionId?: string;
    distribution: AxisDistribution;
    askedIds: string[];
  } | null;

  const sessionId = body?.sessionId ?? sidFromCookie;

  if (!sessionId || !body?.distribution || !body?.askedIds) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  const session = await findSession(sessionId);
  if (!session) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  await updateSession(sessionId, {
    distribution: body.distribution,
    askedIds: body.askedIds,
    mandateJson: null,
  });

  return Response.json({ ok: true });
}
