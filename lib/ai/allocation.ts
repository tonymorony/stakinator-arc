/**
 * Shared allocation types and client-safe helpers.
 * Keep this module free of server-only imports (Anthropic, DB, etc.).
 */

export type Template = "Vault" | "Balanced" | "Growth" | "Speculative";

export interface Allocation {
  template: Template;
  usycPct: number;
  liquidPct: number;
  eurcPct: number;
  growthPct: number;
  explanation: string;
}

/** Strip trailing allocation JSON / fenced blocks so users never see raw model output. */
export function stripStrategyJson(text: string): string {
  return text
    .replace(/```json[\s\S]*$/gi, "")
    .replace(/\n?\s*\{[^{}]*"template"[^{}]*\}\s*$/i, "")
    .replace(/\n?\s*\{[\s\S]*"usycPct"[\s\S]*\}\s*$/i, "")
    .trim();
}
