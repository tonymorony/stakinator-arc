import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSession, findSession } from "@/lib/db/sessions";

export const dynamic = "force-dynamic";

const COOKIE_NAME = "stak.sid";
const ONE_WEEK = 60 * 60 * 24 * 7;

/**
 * POST /api/inquisitor/start
 * Creates a new anonymous session and sets a session cookie. Idempotent — if a
 * valid session cookie is present, returns its id without creating a duplicate.
 */
export async function POST(): Promise<NextResponse> {
  const jar = await cookies();
  const existing = jar.get(COOKIE_NAME)?.value;

  if (existing) {
    const found = await findSession(existing);
    if (found) {
      return NextResponse.json({ sessionId: found.id, state: "greeting" });
    }
  }

  const session = await createSession();
  jar.set(COOKIE_NAME, session.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_WEEK,
  });

  return NextResponse.json({ sessionId: session.id, state: "greeting" });
}
