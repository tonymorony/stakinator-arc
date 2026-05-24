/** Client-side anonymous session persistence (survives navigation + cookie quirks). */

const SESSION_ID_KEY = "stak.sessionId";
const MANDATE_KEY = "stak.mandate";

export function getStoredSessionId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(SESSION_ID_KEY);
  } catch {
    return null;
  }
}

export function setStoredSessionId(id: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SESSION_ID_KEY, id);
  } catch {
    /* private mode / quota */
  }
}

export function clearStoredSession(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(SESSION_ID_KEY);
    sessionStorage.removeItem(MANDATE_KEY);
  } catch {
    /* ignore */
  }
}

export function getStoredMandate<T>(): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(MANDATE_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function setStoredMandate(mandate: unknown): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(MANDATE_KEY, JSON.stringify(mandate));
  } catch {
    /* ignore */
  }
}

/** Prefer explicit id, then sessionStorage, for API request bodies. */
export function resolveSessionId(explicit?: string | null): string | undefined {
  return explicit ?? getStoredSessionId() ?? undefined;
}
