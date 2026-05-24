import { NextResponse } from "next/server";
import { getAppContext } from "@/lib/app/context";
import { getAuthSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/bootstrap
 * Returns auth state + suggested landing route for client-side guards.
 */
export async function GET(): Promise<NextResponse> {
  const [ctx, session] = await Promise.all([getAppContext(), getAuthSession()]);

  return NextResponse.json({
    user: session
      ? {
          id: session.sub,
          email: session.email,
          walletAddress: session.walletAddress,
        }
      : null,
    hasMandate: ctx.hasMandate,
    hasAllocation: ctx.hasAllocation,
    hasPositions: ctx.hasPositions,
    defaultRoute: ctx.defaultRoute,
  });
}
