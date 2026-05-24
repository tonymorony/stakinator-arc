/**
 * Session cookie ("stak.auth") — HMAC-signed JSON payload.
 *
 * This is intentionally a thin, self-contained replacement for NextAuth's
 * `getServerSession` so the auth flow is demoable today without configuring
 * SMTP / a provider. The cookie payload shape mirrors a NextAuth JWT
 * (`{ sub, email, walletAddress, iat }`), so the modules calling
 * `getCurrentUserId()` won't need to change when NextAuth is wired in.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const AUTH_COOKIE = "stak.auth";
const ONE_MONTH = 60 * 60 * 24 * 30;

declare global {
  // eslint-disable-next-line no-var
  var __stakAuthSecret: string | undefined;
}

function getSecret(): string {
  const fromEnv = process.env.NEXTAUTH_SECRET;
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  if (!globalThis.__stakAuthSecret) {
    globalThis.__stakAuthSecret = randomBytes(32).toString("hex");
    // eslint-disable-next-line no-console
    console.warn(
      "[auth] NEXTAUTH_SECRET is empty — using an ephemeral key. Sessions reset on every dev restart.",
    );
  }
  return globalThis.__stakAuthSecret;
}

export interface AuthSessionPayload {
  sub: string; // user id
  email: string;
  walletAddress: string | null;
  iat: number;
}

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(s: string): Buffer {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Buffer.from(s, "base64");
}

function sign(payload: AuthSessionPayload): string {
  const body = base64UrlEncode(Buffer.from(JSON.stringify(payload)));
  const sig = createHmac("sha256", getSecret()).update(body).digest();
  return `${body}.${base64UrlEncode(sig)}`;
}

function verify(token: string): AuthSessionPayload | null {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", getSecret()).update(body).digest();
  const provided = base64UrlDecode(sig);
  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;
  try {
    return JSON.parse(base64UrlDecode(body).toString("utf8")) as AuthSessionPayload;
  } catch {
    return null;
  }
}

export async function setAuthSession(payload: Omit<AuthSessionPayload, "iat">): Promise<void> {
  const token = sign({ ...payload, iat: Math.floor(Date.now() / 1000) });
  const jar = await cookies();
  jar.set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_MONTH,
  });
}

export async function clearAuthSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(AUTH_COOKIE);
}

export async function getAuthSession(): Promise<AuthSessionPayload | null> {
  const jar = await cookies();
  const raw = jar.get(AUTH_COOKIE)?.value;
  if (!raw) return null;
  return verify(raw);
}

export async function getCurrentUserId(): Promise<string | null> {
  const session = await getAuthSession();
  return session?.sub ?? null;
}
