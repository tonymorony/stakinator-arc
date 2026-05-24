import { NextResponse, type NextRequest } from "next/server";
import { issueOtp, isValidEmail, OtpRateLimitError } from "@/lib/auth/otp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/auth/email
 * Input: { email }
 * Issues a one-time code. Until a real email provider is wired up, the code is
 * returned in the response so the modal can display it inline (dev + production).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json().catch(() => null)) as { email?: string } | null;
  const email = body?.email?.trim();

  if (!email || !isValidEmail(email)) {
    return NextResponse.json(
      { error: "Please enter a valid email address." },
      { status: 400 },
    );
  }

  try {
    const { email: normalised, devCode } = await issueOtp(email);
    // No email provider yet — surface the code in the modal (dev + production).
    return NextResponse.json({
      ok: true,
      email: normalised,
      ...(devCode ? { devCode } : {}),
    });
  } catch (err) {
    if (err instanceof OtpRateLimitError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    // eslint-disable-next-line no-console
    console.error("[auth/email]", err);
    return NextResponse.json(
      { error: "We couldn't send the code right now. Please try again." },
      { status: 500 },
    );
  }
}
