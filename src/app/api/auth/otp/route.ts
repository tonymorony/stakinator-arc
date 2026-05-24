import { NextResponse, type NextRequest } from "next/server";
import { verifyOtp, OtpError } from "@/lib/auth/otp";
import {
  createUser,
  findUserByEmail,
  updateUser,
  type AppUser,
} from "@/lib/auth/users";
import { provisionWallet } from "@/lib/arc/wallet";
import { attachAuthSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/auth/otp
 * Input: { email, code }
 * Verifies the code, creates a User on first verification (including a
 * placeholder Modular Wallet), and sets the signed session cookie.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json().catch(() => null)) as
    | { email?: string; code?: string }
    | null;
  if (!body?.email || !body.code) {
    return NextResponse.json(
      { error: "Missing email or code." },
      { status: 400 },
    );
  }

  try {
    const { email } = await verifyOtp(body.email, body.code);
    const user = await ensureUserForEmail(email);
    const response = NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        walletAddress: user.walletAddress,
      },
    });
    return attachAuthSession(response, {
      sub: user.id,
      email: user.email,
      walletAddress: user.walletAddress,
    });
  } catch (err) {
    if (err instanceof OtpError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    // eslint-disable-next-line no-console
    console.error("[auth/otp]", err);
    return NextResponse.json(
      { error: "We couldn't set up your account — please try again." },
      { status: 500 },
    );
  }
}

async function ensureUserForEmail(email: string): Promise<AppUser> {
  const existing = await findUserByEmail(email);
  if (existing) {
    if (!existing.walletAddress) {
      const provisioned = await provisionWallet(email);
      return updateUser(existing.id, { walletAddress: provisioned.walletAddress });
    }
    return existing;
  }
  const provisioned = await provisionWallet(email);
  return createUser({ email, walletAddress: provisioned.walletAddress });
}
