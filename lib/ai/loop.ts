/**
 * Loop LLM glue.
 *  - `decideRebalance` — Claude evaluates current drift + market and returns
 *    `{ shouldRebalance, reason, newAllocation }`.
 *  - `generateNotification` — Claude writes the 1–2 sentence plain-language
 *    notification text the user actually sees.
 *
 * Both have deterministic fallbacks so the loop is never blocked by Claude.
 */
import { anthropic, MODEL, extractJSON, hasAnthropicKey } from "./client";
import { type Allocation } from "./operator";
import {
  VOCAB_RULES,
  vocabLevel,
  type Mandate,
} from "@/lib/inquisitor";
import { describeDrifts, type DriftSnapshot } from "@/lib/operator/drift";

export interface RebalanceDecision {
  shouldRebalance: boolean;
  reason: string;
  newAllocation: Pick<Allocation, "usycPct" | "liquidPct" | "growthPct">;
  source: "llm" | "fallback";
}

export interface RebalanceContext {
  drift: DriftSnapshot;
  target: Pick<Allocation, "usycPct" | "liquidPct" | "growthPct">;
  previousApy: number;
  newApy: number;
  mandate: Mandate;
}

// ─────────────────────────────────────────────────────────────────────────────
// Decision
// ─────────────────────────────────────────────────────────────────────────────

export async function decideRebalance(
  ctx: RebalanceContext,
): Promise<RebalanceDecision> {
  if (!hasAnthropicKey()) return fallbackDecision(ctx);

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 220,
      system:
        "You are Stakinator's monitoring agent. Reply with only valid JSON, no markdown.",
      messages: [{ role: "user", content: buildRebalancePrompt(ctx) }],
    });
    const text = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");
    const parsed = extractJSON<{
      shouldRebalance?: boolean;
      reason?: string;
      newUsycPct?: number;
      newLiquidPct?: number;
      newGrowthPct?: number;
    }>(text);

    if (typeof parsed.shouldRebalance !== "boolean") return fallbackDecision(ctx);

    const allocation = clampAllocation(
      parsed.newUsycPct,
      parsed.newLiquidPct,
      parsed.newGrowthPct,
      ctx.target,
    );

    return {
      shouldRebalance: parsed.shouldRebalance,
      reason: (parsed.reason ?? "").trim() || defaultReason(ctx),
      newAllocation: allocation,
      source: "llm",
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[loop] LLM rebalance decision failed:", err);
    return fallbackDecision(ctx);
  }
}

function buildRebalancePrompt(ctx: RebalanceContext): string {
  return [
    "You are Stakinator's monitoring agent. Today's portfolio check:",
    "",
    "CURRENT POSITIONS vs TARGET:",
    describeDrifts(ctx.drift),
    "",
    `MAX DRIFT: ${ctx.drift.maxAbsDrift.toFixed(1)} pp (threshold for action: 5 pp).`,
    "",
    "MARKET UPDATE:",
    `- Safe Treasury Fund annual rate moved from ${ctx.previousApy.toFixed(2)}% to ${ctx.newApy.toFixed(2)}%.`,
    "",
    "USER MANDATE:",
    `- Risk: ${ctx.mandate.risk_tolerance}`,
    `- Horizon: ${ctx.mandate.horizon}`,
    `- Liquidity need: ${ctx.mandate.liquidity}`,
    "",
    "DECISION:",
    "1. Should you rebalance? Generally hold if drift ≤ 5 pp, unless the rate change is significant.",
    "2. If yes, propose new integer percentages (must sum to 100) inside the user's risk profile.",
    "3. Reason: ONE short sentence, plain English, no jargon, no asset tickers.",
    "",
    "Return ONLY this JSON:",
    '{"shouldRebalance": true, "reason": "…", "newUsycPct": 65, "newLiquidPct": 25, "newGrowthPct": 10}',
  ].join("\n");
}

function fallbackDecision(ctx: RebalanceContext): RebalanceDecision {
  const shouldRebalance = ctx.drift.maxAbsDrift > 5;
  return {
    shouldRebalance,
    reason: defaultReason(ctx),
    newAllocation: ctx.target,
    source: "fallback",
  };
}

function defaultReason(ctx: RebalanceContext): string {
  if (ctx.drift.maxAbsDrift > 5) {
    return "Your mix had shifted a few points off target, so I nudged it back.";
  }
  return "Everything is within range — no changes needed today.";
}

function clampAllocation(
  usyc: unknown,
  liquid: unknown,
  growth: unknown,
  fallback: RebalanceContext["target"],
): RebalanceDecision["newAllocation"] {
  const numbers = [usyc, liquid, growth].map((v) =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : NaN,
  );
  if (numbers.some(Number.isNaN)) return fallback;
  const total = numbers.reduce((a, b) => a + b, 0);
  if (total <= 0) return fallback;
  const scaled = numbers.map((v) => Math.round((v / total) * 100));
  const drift = 100 - scaled.reduce((a, b) => a + b, 0);
  if (drift !== 0) {
    const idx = scaled.indexOf(Math.max(...scaled));
    scaled[idx] = Math.max(0, scaled[idx] + drift);
  }
  return {
    usycPct: scaled[0],
    liquidPct: scaled[1],
    growthPct: scaled[2],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Notification
// ─────────────────────────────────────────────────────────────────────────────

export interface NotificationContext {
  mandate: Mandate;
  rebalanced: boolean;
  movedUsdcToSafeBucket: number;
  apyBefore: number;
  apyAfter: number;
  driftBefore: number;
  reason: string;
}

export async function generateNotification(
  ctx: NotificationContext,
): Promise<{ text: string; source: "llm" | "fallback" }> {
  const deterministic = deterministicNotification(ctx);
  if (!hasAnthropicKey()) return { text: deterministic, source: "fallback" };

  try {
    const vocab = VOCAB_RULES[vocabLevel(ctx.mandate.crypto_fluency)];
    const prompt = [
      "Write a 1–2 sentence notification from the user's AI wealth manager about a portfolio check-in.",
      "",
      "Context:",
      `- Did we rebalance: ${ctx.rebalanced ? "yes" : "no"}`,
      `- Drift detected (max axis): ${ctx.driftBefore.toFixed(1)} pp`,
      `- Safe Treasury Fund annual rate moved from ${ctx.apyBefore.toFixed(2)}% to ${ctx.apyAfter.toFixed(2)}%`,
      ctx.rebalanced
        ? `- Money moved into the Safe Treasury Fund this check-in: $${ctx.movedUsdcToSafeBucket.toFixed(2)}`
        : "- No on-chain change today.",
      `- Reason for decision: ${ctx.reason}`,
      "",
      "Rules:",
      vocab,
      "Never say: wallet, blockchain, gas, staking, yield, APY, DeFi, protocol, token, contract, USDC, USYC, EURC, hash.",
      "Use friendly names: 'safe Treasury fund', 'ready cash'.",
      "First-person, warm, no exclamation marks. Return plain text only — no JSON.",
    ].join("\n");

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 200,
      system:
        "You are Stakinator, the user's friendly AI wealth manager. Reply with plain text, no markdown.",
      messages: [{ role: "user", content: prompt }],
    });
    const text = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    if (!text) return { text: deterministic, source: "fallback" };
    return { text, source: "llm" };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[loop] LLM notification failed:", err);
    return { text: deterministic, source: "fallback" };
  }
}

function deterministicNotification(ctx: NotificationContext): string {
  if (ctx.rebalanced && ctx.movedUsdcToSafeBucket > 0) {
    return `The safe Treasury fund rate ticked up to ${ctx.apyAfter.toFixed(1)}% a year — I moved $${ctx.movedUsdcToSafeBucket.toFixed(0)} there from your ready cash to keep you on target.`;
  }
  if (ctx.rebalanced) {
    return "I nudged your mix back toward your target — nothing big, just keeping things on track.";
  }
  return "Everything looks good. No changes needed today.";
}
