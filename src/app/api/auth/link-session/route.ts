import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getAuthSession } from "@/lib/auth/session";
import { findSession, updateSession } from "@/lib/db/sessions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ANON_COOKIE = "stak.sid";

/**
 * POST /api/auth/link-session
 * Input: { sessionId }
 * Auth: requires a valid signed session cookie (just-verified OTP user).
 *
 * Marks the AnonymousSession as belonging to the new user.
 *
 * In production this would also create separate `Mandate` and `Allocation`
 * DB rows linked by `userId` and return their ids. For the demo build the
 * `AnonymousSession.mandateJson` / `allocationJson` already carry the
 * decision shapes, so we return deterministic identifiers derived from the
 * session id — they're opaque to downstream consumers.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const authed = await getAuthSession();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jar = await cookies();
  const sidFromCookie = jar.get(ANON_COOKIE)?.value;
  const body = (await req.json().catch(() => null)) as
    | { sessionId?: string }
    | null;
  const sessionId = body?.sessionId ?? sidFromCookie;

  if (!sessionId) {
    return NextResponse.json({ error: "Missing session" }, { status: 400 });
  }

  const session = await findSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (session.userId && session.userId !== authed.sub) {
    return NextResponse.json(
      { error: "Session already linked to another account." },
      { status: 409 },
    );
  }

  const linked = await updateSession(sessionId, { userId: authed.sub });

  // Stable opaque ids derived from the session — usable by PROMPT 3 in the
  // in-memory mode, and replaced by real DB ids when Prisma is wired up.
  const mandateId = `m_${linked.id}`;
  const allocationId = `a_${linked.id}`;

  return NextResponse.json({
    ok: true,
    sessionId: linked.id,
    mandateId,
    allocationId,
    user: {
      id: authed.sub,
      email: authed.email,
      walletAddress: authed.walletAddress,
    },
    hasMandate: Boolean(linked.mandateJson),
    hasAllocation: Boolean(linked.allocationJson),
  });
}
