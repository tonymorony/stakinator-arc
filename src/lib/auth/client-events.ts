/** Client-side auth sync — keeps AccountWidget in sync after in-page login. */

export const AUTH_CHANGED_EVENT = "stak-auth-changed";

export function notifyAuthChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(AUTH_CHANGED_EVENT));
  }
}
