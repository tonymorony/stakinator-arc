import type {
  AxisDistribution,
  Mandate,
  RiskTolerance,
  Horizon,
  CapitalTier,
  GoalType,
  Liquidity,
  CryptoFluency,
  CurrencyPreference,
} from "./types";
import { readMandate } from "./distribution";

// ─────────────────────────────────────────────────────────────────────────────
// Human-readable summary templates.
// The LLM will generate a bespoke summary, but these defaults ensure the
// mandate is always interpretable even without an LLM call.
// ─────────────────────────────────────────────────────────────────────────────

const RISK_PHRASES: Record<RiskTolerance, string> = {
  very_conservative: "very cautious — protecting your money is the top priority",
  conservative: "cautious — you want growth but not at the cost of significant loss",
  moderate: "balanced — comfortable with some ups and downs for better returns",
  aggressive: "growth-focused — you can handle real swings for higher upside",
  speculative: "bold — you're willing to take meaningful risk for outsized returns",
};

const HORIZON_PHRASES: Record<Horizon, string> = {
  "<1y": "within the next year",
  "1-3y": "in 1–3 years",
  "3-5y": "in 3–5 years",
  "5-10y": "in 5–10 years",
  ">10y": "over the long term (10+ years)",
};

const GOAL_PHRASES: Record<GoalType, string> = {
  preservation: "keep it safe",
  income: "generate steady income",
  growth: "grow significantly",
  specific_target: "hit a specific target",
  exploration: "explore what's possible",
};

const CAPITAL_PHRASES: Record<CapitalTier, string> = {
  "<$1k": "under $1,000",
  "$1k-10k": "$1,000–$10,000",
  "$10k-100k": "$10,000–$100,000",
  ">$100k": "over $100,000",
};

const LIQUIDITY_PHRASES: Record<Liquidity, string> = {
  anytime: "you may need it anytime",
  occasional: "you could wait a few months if needed",
  lock_6mo: "you're comfortable locking it up for 6+ months",
  lock_years: "you're happy locking it away for years",
};

// ─────────────────────────────────────────────────────────────────────────────
// Operator strategy templates keyed by the mandate profile
// ─────────────────────────────────────────────────────────────────────────────

export type StrategyTemplate = "Vault" | "Balanced" | "Growth" | "Speculative";

export function deriveTemplate(
  risk: RiskTolerance,
  goal: GoalType,
  horizon: Horizon,
): StrategyTemplate {
  if (risk === "very_conservative" || risk === "conservative") return "Vault";
  if (risk === "speculative") return "Speculative";
  if (risk === "aggressive") return "Growth";
  // moderate — break tie on goal/horizon
  if (goal === "preservation" || goal === "income") return "Vault";
  if (horizon === "<1y" || horizon === "1-3y") return "Balanced";
  return "Growth";
}

// ─────────────────────────────────────────────────────────────────────────────
// Build a structured Mandate from the final distribution.
// summaryHuman can be overridden by an LLM-generated string.
// ─────────────────────────────────────────────────────────────────────────────
export function buildMandate(
  dist: AxisDistribution,
  questionsAsked: number,
  summaryHuman?: string,
): Mandate {
  const { values, confidence } = readMandate(dist);

  const risk = values.risk_tolerance as RiskTolerance;
  const horizon = values.horizon as Horizon;
  const capital_tier = values.capital_tier as CapitalTier;
  const goal_type = values.goal_type as GoalType;
  const liquidity = values.liquidity as Liquidity;
  const crypto_fluency = values.crypto_fluency as CryptoFluency;
  const currency_preference = (values.currency_preference ?? "usd") as CurrencyPreference;

  const summary =
    summaryHuman ??
    [
      `Your goal is to ${GOAL_PHRASES[goal_type]}, and you're ${RISK_PHRASES[risk]}.`,
      `You're thinking ${HORIZON_PHRASES[horizon]}, and ${LIQUIDITY_PHRASES[liquidity]}.`,
    ].join(" ");

  return {
    risk_tolerance: risk,
    horizon,
    capital_tier,
    goal_type,
    liquidity,
    crypto_fluency,
    currency_preference,
    confidence: {
      risk_tolerance: confidence.risk_tolerance,
      horizon: confidence.horizon,
      capital_tier: confidence.capital_tier,
      goal_type: confidence.goal_type,
      liquidity: confidence.liquidity,
      crypto_fluency: confidence.crypto_fluency,
      currency_preference: confidence.currency_preference ?? 0.5,
    },
    summary_human: summary,
    questions_asked: questionsAsked,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Language adaptation: vocabulary rules based on crypto_fluency
// ─────────────────────────────────────────────────────────────────────────────
export type VocabLevel = "none" | "heard_of" | "user" | "native";

export const VOCAB_RULES: Record<VocabLevel, string> = {
  none: "Use plain everyday language. Say 'a fund that invests in US government bonds' not 'USYC'. Say 'locked away' not 'staked'. Say 'earnings' not 'yield'. Never say 'DeFi', 'blockchain', 'protocol', 'wallet', or 'gas'.",
  heard_of: "You can say 'crypto' and 'interest rate'. Avoid 'DeFi', 'protocol', 'APY', 'staking', 'gas'.",
  user: "You can say 'staking', 'yield', 'wallet', 'crypto'. Avoid 'liquidity pool', 'impermanent loss', 'slippage', 'MEV'.",
  native: "Full DeFi vocabulary is fine. You can name specific protocols: Arc, USYC, CCTP, Polymarket. Use APY, TVL, basis trade freely.",
};

export function vocabLevel(fluency: CryptoFluency): VocabLevel {
  return fluency as VocabLevel;
}

// ─────────────────────────────────────────────────────────────────────────────
// System prompt fragment the LLM uses to generate a bespoke summary
// ─────────────────────────────────────────────────────────────────────────────
export function mandateSummaryPrompt(mandate: Mandate): string {
  const level = vocabLevel(mandate.crypto_fluency);
  return `
You are Stakinator, a friendly AI wealth manager. The user has just completed a short onboarding dialogue.
Based on their answers, summarise their investor profile in 2–3 warm, plain-language sentences.
${VOCAB_RULES[level]}
Do not use bullet points. Do not mention "mandate", "DeFi", or any technical terms.
End with one sentence about what you will do next ("I'll put together a plan for you now.").

Profile:
- Goal: ${mandate.goal_type}
- Risk tolerance: ${mandate.risk_tolerance}
- Time horizon: ${mandate.horizon}
- Liquidity need: ${mandate.liquidity}
- Financial experience: ${mandate.crypto_fluency}
`.trim();
}
