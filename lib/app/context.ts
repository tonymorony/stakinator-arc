/**
 * Resolves where the user should land based on auth + session progress.
 */
import { cookies } from "next/headers";
import { getAuthSession } from "@/lib/auth/session";
import { findSession, findLatestSessionForUser } from "@/lib/db/sessions";
import { listPositionsForUser } from "@/lib/db/positions";

export type AppRoute = "/" | "/onboarding" | "/strategy" | "/dashboard";

export interface AppContext {
  authenticated: boolean;
  userId: string | null;
  email: string | null;
  hasMandate: boolean;
  hasAllocation: boolean;
  hasPositions: boolean;
  defaultRoute: AppRoute;
}

const ANON_COOKIE = "stak.sid";

export async function getAppContext(): Promise<AppContext> {
  const authed = await getAuthSession();
  const jar = await cookies();
  const sid = jar.get(ANON_COOKIE)?.value ?? null;

  let session = sid ? await findSession(sid) : null;
  if (!session && authed) {
    session = await findLatestSessionForUser(authed.sub);
  }

  const hasMandate = Boolean(session?.mandateJson);
  const hasAllocation = Boolean(session?.allocationJson);
  const positions = authed ? await listPositionsForUser(authed.sub) : [];
  const hasPositions = positions.length > 0;

  let defaultRoute: AppRoute = "/";

  if (authed) {
    if (hasPositions || hasMandate) {
      defaultRoute = "/dashboard";
    } else {
      defaultRoute = "/onboarding";
    }
  } else if (hasAllocation || hasMandate) {
    defaultRoute = "/strategy";
  }

  return {
    authenticated: Boolean(authed),
    userId: authed?.sub ?? null,
    email: authed?.email ?? null,
    hasMandate,
    hasAllocation,
    hasPositions,
    defaultRoute,
  };
}

/** Routes that should not be shown when the profile is already complete. */
export function shouldSkipOnboarding(ctx: AppContext): boolean {
  return ctx.hasMandate && (ctx.authenticated || ctx.hasAllocation);
}

export function shouldSkipStrategy(ctx: AppContext): boolean {
  return ctx.authenticated && ctx.hasPositions;
}
