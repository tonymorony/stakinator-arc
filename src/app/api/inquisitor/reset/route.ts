import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSession } from "@/lib/db/sessions";

export const dynamic = "force-dynamic";

const COOKIE_NAME = "stak.sid";
const ONE_WEEK = 60 * 60 * 24 * 7;

/**
 * POST /api/inquisitor/reset
 * Clears the current anonymous-session cookie and starts a fresh one.
 * Used by "Adjust my profile" / "Start over" CTAs.
 */
export async function POST(): Promise<NextResponse> {
  const session = await createSession();
  const jar = await cookies();
  jar.set(COOKIE_NAME, session.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_WEEK,
  });
  return NextResponse.json({ sessionId: session.id, state: "greeting" });
}
