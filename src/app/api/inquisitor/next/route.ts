import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import {
  ANON_SESSION_COOKIE,
  anonSessionCookieOptions,
  resolveInquisitorSession,
} from "@/lib/db/sessions";
import { selectNextQuestion } from "@/lib/ai/inquisitor";
import { sanitizeQuestion } from "@/lib/inquisitor/serialize";

export const dynamic = "force-dynamic";

/**
 * POST /api/inquisitor/next
 * Returns the next question for the current session.
 *
 * Every question (including Q1) is chosen by `selectNextQuestion`, which
 * asks Claude to pick the most informative candidate. A deterministic
 * entropy-based fallback runs if the LLM call fails or no API key is set.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const jar = await cookies();
  const sidFromCookie = jar.get(ANON_SESSION_COOKIE)?.value;

  const body = (await req.json().catch(() => null)) as
    | { sessionId?: string }
    | null;

  const session = await resolveInquisitorSession({
    bodySessionId: body?.sessionId,
    cookieSessionId: sidFromCookie,
    createIfMissing: true,
  });

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (session.id !== sidFromCookie) {
    jar.set(ANON_SESSION_COOKIE, session.id, anonSessionCookieOptions);
  }

  const selection = await selectNextQuestion({
    distribution: session.distribution,
    asked: session.askedIds,
    done: false,
  });

  if (!selection) {
    return NextResponse.json({ error: "No question available" }, { status: 500 });
  }

  return NextResponse.json({
    sessionId: session.id,
    question: sanitizeQuestion(selection.question),
    distribution: session.distribution,
    askedCount: session.askedIds.length,
    reasoning: selection.reasoning,
  });
}
