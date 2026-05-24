"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "framer-motion";
import { WizardIcon } from "@/components/WizardIcon";
import { notifyAuthChanged } from "@/lib/auth/client-events";

export type AuthModalStep = "email" | "otp" | "creating";

export interface AuthModalResult {
  email: string;
  walletAddress: string | null;
  userId: string;
}

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  onAuthenticated: (result: AuthModalResult) => void;
}

const OTP_LENGTH = 6;
const RESEND_AFTER_SEC = 60;

export function AuthModal({ open, onClose, onAuthenticated }: AuthModalProps) {
  const [step, setStep] = useState<AuthModalStep>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState<string[]>(() => Array(OTP_LENGTH).fill(""));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  const reducedMotion = useReducedMotion();
  const isMobile = useIsMobile();

  // Reset when reopening.
  useEffect(() => {
    if (open) {
      setStep("email");
      setOtp(Array(OTP_LENGTH).fill(""));
      setError(null);
      setSubmitting(false);
      setDevCode(null);
      setResendIn(0);
    }
  }, [open]);

  // Resend countdown.
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  // ESC to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && step !== "creating") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, step, onClose]);

  // Focus the first OTP input when entering the OTP step.
  useEffect(() => {
    if (step === "otp") {
      inputsRef.current[0]?.focus();
    }
  }, [step]);

  const requestOtp = useCallback(async (rawEmail: string) => {
    const res = await fetch("/api/auth/email", {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: rawEmail }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      email?: string;
      devCode?: string;
      error?: string;
    };
    if (!res.ok || !data.ok) {
      throw new Error(data.error ?? "We couldn't send the code right now.");
    }
    return data;
  }, []);

  const handleEmailSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (submitting) return;
      setError(null);
      setSubmitting(true);
      try {
        const data = await requestOtp(email);
        if (data.devCode) setDevCode(data.devCode);
        setStep("otp");
        setResendIn(RESEND_AFTER_SEC);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      } finally {
        setSubmitting(false);
      }
    },
    [email, submitting, requestOtp],
  );

  const handleResend = useCallback(async () => {
    if (resendIn > 0 || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const data = await requestOtp(email);
      if (data.devCode) setDevCode(data.devCode);
      setOtp(Array(OTP_LENGTH).fill(""));
      setResendIn(RESEND_AFTER_SEC);
      inputsRef.current[0]?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't resend.");
    } finally {
      setSubmitting(false);
    }
  }, [resendIn, submitting, email, requestOtp]);

  const handleVerify = useCallback(
    async (code: string) => {
      if (submitting) return;
      setError(null);
      setSubmitting(true);
      setStep("creating");

      try {
        const res = await fetch("/api/auth/otp", {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, code }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          user?: { id: string; email: string; walletAddress: string | null };
          error?: string;
        };

        if (!res.ok || !data.ok || !data.user) {
          throw new Error(data.error ?? "That code didn't match — please try again.");
        }

        // Small dwell so the user actually sees the wizard pulse step.
        await new Promise((r) => setTimeout(r, 700));

        notifyAuthChanged();
        onAuthenticated({
          email: data.user.email,
          walletAddress: data.user.walletAddress,
          userId: data.user.id,
        });
      } catch (err) {
        setStep("otp");
        setError(err instanceof Error ? err.message : "Something went wrong.");
        setOtp(Array(OTP_LENGTH).fill(""));
        requestAnimationFrame(() => inputsRef.current[0]?.focus());
      } finally {
        setSubmitting(false);
      }
    },
    [email, submitting, onAuthenticated],
  );

  const onOtpChange = useCallback(
    (idx: number, raw: string) => {
      const digits = raw.replace(/\D/g, "");
      if (!digits) {
        setOtp((prev) => {
          const next = [...prev];
          next[idx] = "";
          return next;
        });
        return;
      }

      setOtp((prev) => {
        const next = [...prev];
        const chars = digits.split("");
        let i = idx;
        for (const ch of chars) {
          if (i >= OTP_LENGTH) break;
          next[i] = ch;
          i += 1;
        }
        // Focus next empty cell.
        const focusIdx = Math.min(idx + chars.length, OTP_LENGTH - 1);
        requestAnimationFrame(() => inputsRef.current[focusIdx]?.focus());
        // Auto-submit on full code.
        if (next.every((c) => c.length === 1)) {
          void handleVerify(next.join(""));
        }
        return next;
      });
    },
    [handleVerify],
  );

  const onOtpKeyDown = useCallback(
    (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Backspace") {
        setOtp((prev) => {
          const next = [...prev];
          if (next[idx]) {
            next[idx] = "";
          } else if (idx > 0) {
            next[idx - 1] = "";
            requestAnimationFrame(() => inputsRef.current[idx - 1]?.focus());
          }
          return next;
        });
      }
      if (e.key === "ArrowLeft" && idx > 0) {
        e.preventDefault();
        inputsRef.current[idx - 1]?.focus();
      }
      if (e.key === "ArrowRight" && idx < OTP_LENGTH - 1) {
        e.preventDefault();
        inputsRef.current[idx + 1]?.focus();
      }
    },
    [],
  );

  const panelAnim = useMemo(
    () =>
      reducedMotion
        ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
        : isMobile
          ? {
              initial: { y: "100%" },
              animate: { y: 0 },
              exit: { y: "100%" },
              transition: { type: "spring" as const, damping: 30, stiffness: 280 },
            }
          : {
              initial: { scale: 0.95, opacity: 0 },
              animate: { scale: 1, opacity: 1 },
              exit: { scale: 0.95, opacity: 0 },
              transition: { duration: 0.2 },
            },
    [reducedMotion, isMobile],
  );

  const headingId = useId();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => {
              if (step !== "creating") onClose();
            }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            aria-hidden
          />

          {isMobile ? (
            <motion.div
              key="panel-mobile"
              {...panelAnim}
              role="dialog"
              aria-modal="true"
              aria-labelledby={headingId}
              className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl bg-bg-base p-6 pb-[calc(env(safe-area-inset-bottom,0)+24px)] shadow-xl"
            >
              {panelContent(step, headingId, {
                email,
                setEmail,
                submitting,
                error,
                handleEmailSubmit,
                otp,
                inputsRef,
                onOtpChange,
                onOtpKeyDown,
                handleResend,
                resendIn,
                devCode,
              })}
            </motion.div>
          ) : (
            <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                key="panel-desktop"
                {...panelAnim}
                role="dialog"
                aria-modal="true"
                aria-labelledby={headingId}
                className="pointer-events-auto w-full max-w-md rounded-2xl bg-bg-base p-8 shadow-xl"
              >
                {panelContent(step, headingId, {
                  email,
                  setEmail,
                  submitting,
                  error,
                  handleEmailSubmit,
                  otp,
                  inputsRef,
                  onOtpChange,
                  onOtpKeyDown,
                  handleResend,
                  resendIn,
                  devCode,
                })}
              </motion.div>
            </div>
          )}
        </>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Panel content
// ─────────────────────────────────────────────────────────────────────────────

interface PanelContentProps {
  email: string;
  setEmail: (v: string) => void;
  submitting: boolean;
  error: string | null;
  handleEmailSubmit: (e: React.FormEvent) => void;
  otp: string[];
  inputsRef: React.MutableRefObject<Array<HTMLInputElement | null>>;
  onOtpChange: (idx: number, value: string) => void;
  onOtpKeyDown: (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => void;
  handleResend: () => void;
  resendIn: number;
  devCode: string | null;
}

function panelContent(
  step: AuthModalStep,
  headingId: string,
  props: PanelContentProps,
) {
  if (step === "email") {
    return (
      <EmailStep
        headingId={headingId}
        email={props.email}
        onEmailChange={props.setEmail}
        submitting={props.submitting}
        error={props.error}
        onSubmit={props.handleEmailSubmit}
      />
    );
  }
  if (step === "otp") {
    return (
      <OtpStep
        headingId={headingId}
        email={props.email}
        otp={props.otp}
        inputsRef={props.inputsRef}
        onOtpChange={props.onOtpChange}
        onOtpKeyDown={props.onOtpKeyDown}
        onResend={props.handleResend}
        resendIn={props.resendIn}
        devCode={props.devCode}
        error={props.error}
        submitting={props.submitting}
      />
    );
  }
  return <CreatingStep headingId={headingId} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Steps
// ─────────────────────────────────────────────────────────────────────────────

interface EmailStepProps {
  headingId: string;
  email: string;
  onEmailChange: (v: string) => void;
  submitting: boolean;
  error: string | null;
  onSubmit: (e: React.FormEvent) => void;
}

function EmailStep({
  headingId,
  email,
  onEmailChange,
  submitting,
  error,
  onSubmit,
}: EmailStepProps) {
  return (
    <form onSubmit={onSubmit}>
      <WizardIcon size={64} className="mx-auto mb-4" />
      <h2 id={headingId} className="text-center font-display text-2xl text-text-primary">
        Save your strategy
      </h2>
      <p className="mt-1 text-center text-sm text-text-muted">
        Enter your email to secure your plan and put it into action.
      </p>

      <label className="sr-only" htmlFor={`${headingId}-email`}>
        Email
      </label>
      <input
        id={`${headingId}-email`}
        type="email"
        inputMode="email"
        autoComplete="email"
        autoFocus
        required
        placeholder="you@example.com"
        value={email}
        onChange={(e) => onEmailChange(e.target.value)}
        className="mt-6 w-full rounded-xl border border-border bg-bg-base px-4 py-3 text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-earn"
      />

      {error ? (
        <p className="mt-2 text-sm text-status-danger" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting || email.trim().length === 0}
        className="mt-3 w-full rounded-full bg-accent-earn py-3 font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
      >
        {submitting ? "Sending…" : "Secure my strategy →"}
      </button>

      <p className="mt-3 text-center text-xs text-text-muted">
        By continuing, you agree to our terms.
      </p>
    </form>
  );
}

interface OtpStepProps {
  headingId: string;
  email: string;
  otp: string[];
  inputsRef: React.MutableRefObject<Array<HTMLInputElement | null>>;
  onOtpChange: (idx: number, value: string) => void;
  onOtpKeyDown: (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => void;
  onResend: () => void;
  resendIn: number;
  devCode: string | null;
  error: string | null;
  submitting: boolean;
}

function OtpStep({
  headingId,
  email,
  otp,
  inputsRef,
  onOtpChange,
  onOtpKeyDown,
  onResend,
  resendIn,
  devCode,
  error,
  submitting,
}: OtpStepProps) {
  return (
    <div>
      <WizardIcon size={64} className="mx-auto mb-4" />
      <h2 id={headingId} className="text-center font-display text-xl text-text-primary">
        Check your email
      </h2>
      <p className="mt-1 text-center text-sm text-text-muted">
        We sent a 6-digit code to <span className="text-text-primary">{email}</span>.
      </p>

      <div className="mt-6 flex justify-center gap-2">
        {otp.map((digit, i) => (
          <input
            key={i}
            ref={(el) => {
              inputsRef.current[i] = el;
            }}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={i === 0 ? OTP_LENGTH : 1}
            value={digit}
            onChange={(e) => onOtpChange(i, e.target.value)}
            onKeyDown={(e) => onOtpKeyDown(i, e)}
            onPaste={(e) => {
              const pasted = e.clipboardData.getData("text").replace(/\D/g, "");
              if (pasted.length > 0) {
                e.preventDefault();
                onOtpChange(0, pasted.slice(0, OTP_LENGTH));
              }
            }}
            disabled={submitting}
            aria-label={`Digit ${i + 1}`}
            className="num h-12 w-10 rounded-xl border border-border bg-bg-base text-center text-xl text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-earn disabled:opacity-60"
          />
        ))}
      </div>

      {error ? (
        <p className="mt-3 text-center text-sm text-status-danger" role="alert">
          {error}
        </p>
      ) : null}

      {devCode ? (
        <p className="mt-3 text-center text-xs text-text-muted">
          Dev mode — code for this session:{" "}
          <span className="num text-text-primary">{devCode}</span>
        </p>
      ) : null}

      <div className="mt-4 text-center">
        {resendIn > 0 ? (
          <span className="text-xs text-text-muted">
            Resend available in {resendIn}s
          </span>
        ) : (
          <button
            type="button"
            onClick={onResend}
            disabled={submitting}
            className="text-sm text-accent-earn underline underline-offset-2 hover:opacity-80 disabled:opacity-60"
          >
            Resend code
          </button>
        )}
      </div>
    </div>
  );
}

function CreatingStep({ headingId }: { headingId: string }) {
  return (
    <div className="py-6 text-center">
      <WizardIcon size={64} variant="pulse" className="mx-auto mb-4" />
      <h2 id={headingId} className="font-display text-lg text-text-muted">
        Setting up your account…
      </h2>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 767px)");
    const update = () => setMobile(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);
  return mobile;
}
