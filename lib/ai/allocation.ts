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

const ALLOCATION_JSON_START =
  /\{\s*"(?:template|usycPct|liquidPct|eurcPct|growthPct)"/i;

/**
 * Strip allocation JSON (complete, inline, fenced, or partial SSE tail) so users
 * never see raw model output while the plan is streaming.
 */
export function stripStrategyJson(text: string): string {
  let cleaned = text.replace(/```json[\s\S]*?```/gi, "");
  cleaned = cleaned.replace(/```json[\s\S]*$/gi, "");

  const jsonStart = findAllocationJsonStart(cleaned);
  if (jsonStart >= 0) {
    cleaned = cleaned.slice(0, jsonStart);
  }

  return cleaned.replace(/\s+$/g, "").trim();
}

function findAllocationJsonStart(text: string): number {
  const match = ALLOCATION_JSON_START.exec(text);
  return match?.index ?? -1;
}
