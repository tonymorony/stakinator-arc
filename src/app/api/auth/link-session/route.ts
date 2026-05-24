import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getAuthSession, attachAuthSession } from "@/lib/auth/session";
import { ensureUserFromAuthSession } from "@/lib/auth/users";
import { databaseUnavailableResponse } from "@/lib/db/health";
import { resolveAnonymousSession, updateSession } from "@/lib/db/sessions";

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
  const dbError = await databaseUnavailableResponse();
  if (dbError) return dbError;

  const authed = await getAuthSession();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await ensureUserFromAuthSession(authed);
  const authNeedsSync = user.id !== authed.sub;

  const jar = await cookies();
  const sidFromCookie = jar.get(ANON_COOKIE)?.value;
  const body = (await req.json().catch(() => null)) as
    | { sessionId?: string }
    | null;

  const session = await resolveAnonymousSession({
    bodySessionId: body?.sessionId,
    cookieSessionId: sidFromCookie,
    userId: user.id,
  });
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (session.userId && session.userId !== user.id) {
    return NextResponse.json(
      { error: "Session already linked to another account." },
      { status: 409 },
    );
  }

  const linked = await updateSession(session.id, { userId: user.id });

  // Stable opaque ids derived from the session — usable by PROMPT 3 in the
  // in-memory mode, and replaced by real DB ids when Prisma is wired up.
  const mandateId = `m_${linked.id}`;
  const allocationId = `a_${linked.id}`;

  let response = NextResponse.json({
    ok: true,
    sessionId: linked.id,
    mandateId,
    allocationId,
    user: {
      id: user.id,
      email: user.email,
      walletAddress: user.walletAddress,
    },
    hasMandate: Boolean(linked.mandateJson),
    hasAllocation: Boolean(linked.allocationJson),
  });

  if (authNeedsSync) {
    response = attachAuthSession(response, {
      sub: user.id,
      email: user.email,
      walletAddress: user.walletAddress,
    }) as typeof response;
  }

  return response;
}
