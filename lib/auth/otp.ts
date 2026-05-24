/**
 * Email OTP — generation + verification.
 *
 * Real production wiring (Resend/SendGrid SMTP via NextAuth EmailProvider) is
 * the AUTH-WALLET module's final form. For the demo build we use an in-memory
 * store with a 10-minute TTL and log the code to the server console so the
 * developer (or judge during a private demo) can see and enter it.
 *
 * The interface is intentionally async so a future real backend can drop in.
 */
import { randomInt, timingSafeEqual } from "node:crypto";

interface PendingOtp {
  code: string;
  email: string;
  /** Epoch ms when this OTP expires. */
  expiresAt: number;
}

const TTL_MS = 10 * 60 * 1000;
const RESEND_AFTER_MS = 60 * 1000;

declare global {
  // eslint-disable-next-line no-var
  var __stakOtpStore: Map<string, PendingOtp> | undefined;
  // eslint-disable-next-line no-var
  var __stakLastIssue: Map<string, number> | undefined;
}

function store(): Map<string, PendingOtp> {
  if (!globalThis.__stakOtpStore) globalThis.__stakOtpStore = new Map();
  return globalThis.__stakOtpStore;
}

function issueTimes(): Map<string, number> {
  if (!globalThis.__stakLastIssue) globalThis.__stakLastIssue = new Map();
  return globalThis.__stakLastIssue;
}

function normaliseEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidEmail(raw: string): boolean {
  const e = normaliseEmail(raw);
  // intentionally permissive — matches NextAuth's heuristic
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
}

export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export async function issueOtp(rawEmail: string): Promise<{
  email: string;
  /** Set only when the server has no real email-delivery configured. */
  devCode?: string;
}> {
  const email = normaliseEmail(rawEmail);
  const now = Date.now();
  const last = issueTimes().get(email) ?? 0;
  if (now - last < RESEND_AFTER_MS) {
    const waitMs = RESEND_AFTER_MS - (now - last);
    throw new OtpRateLimitError(`Resend available in ${Math.ceil(waitMs / 1000)}s.`);
  }

  const code = generateOtp();
  store().set(email, { code, email, expiresAt: now + TTL_MS });
  issueTimes().set(email, now);

  // Dev surface: print the code so the user can paste it back. A real
  // deployment would dispatch this via Resend/SendGrid here and NOT echo it.
  // eslint-disable-next-line no-console
  console.log(`\n[auth] OTP for ${email}: ${code}\n      (expires in 10 minutes)\n`);

  return { email, devCode: code };
}

export async function verifyOtp(
  rawEmail: string,
  rawCode: string,
): Promise<{ email: string }> {
  const email = normaliseEmail(rawEmail);
  const code = rawCode.replace(/\D/g, "");
  if (code.length !== 6) {
    throw new OtpError("Please enter the 6-digit code.");
  }

  const pending = store().get(email);
  if (!pending) throw new OtpError("Request a new code — this one isn't valid anymore.");
  if (pending.expiresAt < Date.now()) {
    store().delete(email);
    throw new OtpError("This code has expired — request a new one.");
  }
  const a = Buffer.from(code);
  const b = Buffer.from(pending.code);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new OtpError("That code didn't match — please try again.");
  }

  store().delete(email);
  return { email };
}

export class OtpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OtpError";
  }
}

export class OtpRateLimitError extends OtpError {
  constructor(message: string) {
    super(message);
    this.name = "OtpRateLimitError";
  }
}
