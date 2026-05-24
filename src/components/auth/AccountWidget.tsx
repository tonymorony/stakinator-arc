"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AuthModal, type AuthModalResult } from "./AuthModal";
import {
  AUTH_CHANGED_EVENT,
  notifyAuthChanged,
} from "@/lib/auth/client-events";

interface SessionUser {
  id: string;
  email: string;
  walletAddress: string | null;
}

export function AccountWidget() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);
  const [menuOpen, setMenuOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const refreshUser = useCallback(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { user: SessionUser | null }) => setUser(d.user))
      .catch(() => setUser(null));
  }, []);

  // Fetch on mount, route change, and after in-page login (e.g. strategy flow).
  useEffect(() => {
    refreshUser();
  }, [pathname, refreshUser]);

  useEffect(() => {
    const onAuthChanged = () => refreshUser();
    window.addEventListener(AUTH_CHANGED_EVENT, onAuthChanged);
    return () => window.removeEventListener(AUTH_CHANGED_EVENT, onAuthChanged);
  }, [refreshUser]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const handleSignOut = useCallback(async () => {
    setMenuOpen(false);
    await fetch("/api/auth/signout", { method: "POST" });
    setUser(null);
    router.push("/");
    router.refresh();
  }, [router]);

  const handleAuthDone = useCallback((result: AuthModalResult) => {
    setAuthOpen(false);
    setUser({ id: result.userId, email: result.email, walletAddress: result.walletAddress });
    notifyAuthChanged();
    router.refresh();
    // Stay on strategy/onboarding — those pages handle the next step themselves.
    if (pathname !== "/strategy" && pathname !== "/onboarding") {
      router.push("/dashboard");
    }
  }, [router, pathname]);

  // Loading state — render nothing to avoid layout shift
  if (user === undefined) {
    return <div className="h-8 w-20 animate-pulse rounded-lg bg-bg-surface" />;
  }

  // Not logged in — subtle link; auth is optional during onboarding
  if (!user) {
    return (
      <>
        <button
          type="button"
          onClick={() => setAuthOpen(true)}
          className="rounded-lg px-2.5 py-1.5 text-sm text-text-muted transition-colors hover:bg-bg-surface hover:text-text-primary"
        >
          Sign in
        </button>
        <AuthModal
          open={authOpen}
          onClose={() => setAuthOpen(false)}
          onAuthenticated={handleAuthDone}
        />
      </>
    );
  }

  // Logged in
  const shortEmail = user.email.length > 22
    ? user.email.slice(0, 10) + "…" + user.email.slice(user.email.lastIndexOf("@"))
    : user.email;
  const shortWallet = user.walletAddress
    ? user.walletAddress.slice(0, 6) + "…" + user.walletAddress.slice(-4)
    : null;

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm transition-colors hover:border-accent-earn"
      >
        {/* Avatar dot */}
        <span className="h-2 w-2 rounded-full bg-status-success" />
        <span className="max-w-[140px] truncate font-medium text-text-primary">
          {shortEmail}
        </span>
        <svg
          className={`h-3.5 w-3.5 text-text-muted transition-transform ${menuOpen ? "rotate-180" : ""}`}
          viewBox="0 0 16 16" fill="currentColor"
        >
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        </svg>
      </button>

      {menuOpen && (
        <div className="absolute right-0 top-full mt-1.5 w-64 rounded-xl border border-border bg-bg-base shadow-lg">
          {/* User info header */}
          <div className="border-b border-border px-4 py-3">
            <p className="truncate text-sm font-medium text-text-primary">{user.email}</p>
            {shortWallet && (
              <p className="num mt-0.5 text-xs text-text-muted">{shortWallet}</p>
            )}
          </div>

          {/* Actions */}
          <div className="p-1.5">
            <button
              type="button"
              onClick={() => { setMenuOpen(false); router.push("/dashboard"); }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-text-primary transition-colors hover:bg-bg-surface"
            >
              <span className="text-base">📊</span>
              Dashboard
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-text-muted transition-colors hover:bg-bg-subtle hover:text-status-danger"
            >
              <span className="text-base">↩</span>
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
