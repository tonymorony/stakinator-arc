/**
 * Operator LLM glue.
 *
 * `streamStrategy()` streams Claude's natural-language explanation token by
 * token while collecting the full response. After the stream ends, the raw
 * text is parsed into a structured `Allocation` via `parseAllocation()` —
 * which clamps, normalises and falls back to a Vault preset if the model
 * returns anything malformed.
 *
 * No on-chain or user PII enters this module; everything is derived from the
 * mandate + market data values.
 */
import { anthropic, MODEL, hasAnthropicKey } from "./client";
import {
  type Allocation,
  type Template,
} from "./allocation";
import {
  VOCAB_RULES,
  vocabLevel,
  type Mandate,
} from "@/lib/inquisitor";

export type { Allocation, Template } from "./allocation";
export { stripStrategyJson } from "./allocation";

export interface MarketData {
  usycApy: number;
  /** Free-form note included in the prompt (e.g. "calm", "elevated"). */
  volatility?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt
// ─────────────────────────────────────────────────────────────────────────────

const TEMPLATE_RANGES: Record<
  Template,
  { trigger: string; usyc: string; liquid: string; eurc: string; growth: string }
> = {
  Vault: {
    trigger: "very_conservative OR (conservative + horizon <1y)",
    usyc: "80–95%",
    liquid: "5–15%",
    eurc: "0–10% (only if currency_preference=eur)",
    growth: "0%",
  },
  Balanced: {
    trigger: "conservative/moderate + 1–5y horizon",
    usyc: "50–70%",
    liquid: "15–25%",
    eurc: "0–15% (only if currency_preference=eur)",
    growth: "0–10%",
  },
  Growth: {
    trigger: "moderate/aggressive + 3y+ horizon",
    usyc: "20–50%",
    liquid: "10–20%",
    eurc: "0–10% (only if currency_preference=eur)",
    growth: "20–50%",
  },
  Speculative: {
    trigger: "speculative OR (aggressive + exploration)",
    usyc: "10–30%",
    liquid: "10–15%",
    eurc: "0% (speculative users keep liquid)",
    growth: "55–75%",
  },
};

export function buildStrategyPrompt(
  mandate: Mandate,
  market: MarketData,
): string {
  const vocabKey = vocabLevel(mandate.crypto_fluency);
  const vocab = VOCAB_RULES[vocabKey];

  const templateTable = (Object.entries(TEMPLATE_RANGES) as [Template, typeof TEMPLATE_RANGES["Vault"]][])
    .map(
      ([name, t]) =>
        `- ${name} (trigger: ${t.trigger}) → safe ${t.usyc}, ready cash ${t.liquid}, euro reserve ${t.eurc}, growth reserve ${t.growth}`,
    )
    .join("\n");

  const currencyNote = mandate.currency_preference === "eur"
    ? "USER CURRENCY: Euro — allocate 5–15% to the Euro Reserve bucket (eurcPct > 0)."
    : "USER CURRENCY: USD — set eurcPct to 0.";

  return [
    "You are Stakinator's portfolio strategy engine.",
    "",
    "USER MANDATE:",
    `- Goal: ${mandate.goal_type}`,
    `- Risk: ${mandate.risk_tolerance}`,
    `- Horizon: ${mandate.horizon}`,
    `- Capital tier: ${mandate.capital_tier}`,
    `- Liquidity need: ${mandate.liquidity}`,
    `- Financial experience: ${mandate.crypto_fluency}`,
    `- Currency preference: ${mandate.currency_preference}`,
    "",
    currencyNote,
    "",
    "CURRENT MARKET CONDITIONS:",
    `- Safe Treasury fund annual yield: ${market.usycApy.toFixed(2)}%`,
    `- Volatility: ${market.volatility ?? "calm"}`,
    "- Note: prediction markets and leveraged positions are NOT available in MVP.",
    "",
    "AVAILABLE BUCKETS:",
    "1. Safe Treasury fund (the safest bucket; tokenised US government bonds; earns the yield shown above; user can withdraw any time)",
    "2. Ready cash (a 0% liquid buffer in US dollars; access anytime)",
    "3. Euro Reserve (a 0% liquid buffer in euros; only use if user prefers euros)",
    "4. Growth reserve (held in ready cash today; reserved for future deployment as more strategies come online)",
    "",
    "TEMPLATE RANGES:",
    templateTable,
    "",
    "TASK:",
    "1. Pick the template that fits the mandate best.",
    "2. Choose usycPct, liquidPct, eurcPct, growthPct (integers; must sum to 100; stay inside the template's ranges; eurcPct=0 unless currency_preference=eur).",
    "3. Write a warm 2–3 sentence explanation directed AT the user that mentions concrete reasons (their horizon, their risk comfort, today's safe-fund rate vs typical government bond funds).",
    "",
    "OUTPUT FORMAT:",
    "- Write the explanation as plain prose first (2–3 sentences).",
    "- Then a blank line.",
    "- Then one JSON object on its own (no markdown fences) with exactly these fields:",
    '{"template":"Vault","usycPct":80,"liquidPct":10,"eurcPct":10,"growthPct":0,"explanation":"same explanation as the prose above"}',
    `VOCABULARY RULES: ${vocab}`,
    "Never use the words: wallet, blockchain, gas, staking, yield, APY, DeFi, protocol, token, seed phrase, USYC, USDC, EURC, hash, contract.",
    "Use friendly names: 'Safe Treasury Fund', 'ready cash', 'Euro reserve', 'growth reserve'.",
    "Refer to returns as 'about X% per year' or 'roughly $Y a year', never 'APY' or 'yield'.",
  ].join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Streaming
// ─────────────────────────────────────────────────────────────────────────────

export interface StrategyStreamResult {
  fullText: string;
  source: "llm" | "fallback";
}

/**
 * Streams Claude's reply. Yields plain text chunks; the caller is responsible
 * for parsing the final JSON via `parseAllocation()`.
 * When ANTHROPIC_API_KEY is missing or the call fails, yields a fixed Vault
 * narration so the UX never blocks.
 */
export async function* streamStrategyText(
  mandate: Mandate,
  market: MarketData,
): AsyncGenerator<string, "llm" | "fallback", unknown> {
  if (!hasAnthropicKey()) {
    yield deterministicNarration(mandate, market);
    return "fallback";
  }

  try {
    const stream = anthropic.messages.stream({
      model: MODEL,
      max_tokens: 800,
      system:
        "You are Stakinator's portfolio strategy engine. Write a warm 2–3 sentence explanation in plain prose first, then a blank line, then a single JSON allocation object. Never mix JSON into the prose paragraph.",
      messages: [
        { role: "user", content: buildStrategyPrompt(mandate, market) },
      ],
    });

    let saw = false;
    for await (const chunk of stream) {
      if (
        chunk.type === "content_block_delta" &&
        chunk.delta.type === "text_delta"
      ) {
        saw = true;
        yield chunk.delta.text;
      }
    }
    if (!saw) {
      yield deterministicNarration(mandate, market);
      return "fallback";
    }
    return "llm";
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[operator] LLM strategy stream failed:", err);
    yield deterministicNarration(mandate, market);
    return "fallback";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Parsing & sanitisation
// ─────────────────────────────────────────────────────────────────────────────

const VAULT_FALLBACK: Allocation = {
  template: "Vault",
  usycPct: 85,
  liquidPct: 15,
  eurcPct: 0,
  growthPct: 0,
  explanation:
    "Based on your profile I'm keeping things very conservative — most of your money will sit in a safe US Treasury fund earning interest, with a small ready-cash buffer you can use any time.",
};

const TEMPLATES: ReadonlyArray<Template> = ["Vault", "Balanced", "Growth", "Speculative"];

interface RawAllocation {
  template?: unknown;
  usycPct?: unknown;
  liquidPct?: unknown;
  eurcPct?: unknown;
  growthPct?: unknown;
  explanation?: unknown;
}

/**
 * Extracts the JSON object from the (possibly verbose) streamed text.
 * Returns a sanitised Allocation, or the Vault fallback if anything is off.
 */
export function parseAllocation(
  rawText: string,
  fallbackExplanation?: string,
): { allocation: Allocation; source: "parsed" | "fallback" } {
  const json = extractTrailingJson(rawText);
  if (!json) {
    return {
      allocation: withExplanation(VAULT_FALLBACK, fallbackExplanation ?? rawText),
      source: "fallback",
    };
  }

  const raw = json as RawAllocation;
  const template = TEMPLATES.includes(raw.template as Template)
    ? (raw.template as Template)
    : "Vault";
  const explanation =
    (typeof raw.explanation === "string" && raw.explanation.trim()) ||
    fallbackExplanation ||
    VAULT_FALLBACK.explanation;

  const pcts = sanitisePercentages([
    asNumber(raw.usycPct),
    asNumber(raw.liquidPct),
    asNumber(raw.eurcPct),
    asNumber(raw.growthPct),
  ]);

  return {
    allocation: {
      template,
      usycPct: pcts[0],
      liquidPct: pcts[1],
      eurcPct: pcts[2],
      growthPct: pcts[3],
      explanation,
    },
    source: "parsed",
  };
}

function withExplanation(base: Allocation, explanation: string): Allocation {
  const trimmed = explanation.trim();
  if (!trimmed) return base;
  return { ...base, explanation: trimmed };
}

function extractTrailingJson(text: string): unknown | null {
  const fenced = text.match(/```json([\s\S]*?)```/i);
  const blockBody = fenced?.[1]?.trim();
  if (blockBody) {
    try {
      return JSON.parse(blockBody);
    } catch {
      // fall through
    }
  }

  let depth = 0;
  let start = -1;
  for (let i = text.length - 1; i >= 0; i -= 1) {
    const c = text[i];
    if (c === "}") depth += 1;
    if (c === "{") {
      depth -= 1;
      if (depth === 0) {
        start = i;
        break;
      }
    }
  }
  if (start < 0) return null;
  const candidate = text.slice(start);
  // Trim anything trailing the outermost matching close brace.
  let end = -1;
  let inner = 0;
  for (let i = 0; i < candidate.length; i += 1) {
    if (candidate[i] === "{") inner += 1;
    if (candidate[i] === "}") {
      inner -= 1;
      if (inner === 0) {
        end = i + 1;
        break;
      }
    }
  }
  const slice = end > 0 ? candidate.slice(0, end) : candidate;
  try {
    return JSON.parse(slice);
  } catch {
    return null;
  }
}

function asNumber(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[%\s]/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

/** Clamp negatives, scale to sum to exactly 100, round to integers (sum-preserving). */
function sanitisePercentages(values: number[]): [number, number, number, number] {
  const clamped = values.map((v) => (v < 0 ? 0 : v));
  const total = clamped.reduce((a, b) => a + b, 0);
  if (total <= 0) {
    return [VAULT_FALLBACK.usycPct, VAULT_FALLBACK.liquidPct, VAULT_FALLBACK.eurcPct, VAULT_FALLBACK.growthPct];
  }
  const scaled = clamped.map((v) => (v / total) * 100);
  const ints = scaled.map((v) => Math.round(v));
  // Reconcile rounding drift onto the largest bucket.
  const drift = 100 - ints.reduce((a, b) => a + b, 0);
  if (drift !== 0) {
    const idx = scaled.indexOf(Math.max(...scaled));
    ints[idx] = Math.max(0, ints[idx] + drift);
  }
  return [ints[0], ints[1], ints[2], ints[3]];
}

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic narration (fallback, also used pre-LLM during dev)
// ─────────────────────────────────────────────────────────────────────────────

function deterministicNarration(mandate: Mandate, market: MarketData): string {
  const allocation = templatePreset(mandate);
  const apy = market.usycApy.toFixed(1);
  const parts = [
    `Looking at where you are — your comfort with ups and downs, your time horizon, and the safe rate I can see today (${apy}% a year) — `,
    `I'm putting ${allocation.usycPct}% in a Safe Treasury Fund, ${allocation.liquidPct}% in ready cash you can pull any time`,
  ];
  if (allocation.eurcPct > 0) {
    parts.push(`, ${allocation.eurcPct}% in a Euro reserve`);
  }
  if (allocation.growthPct > 0) {
    parts.push(`, and a small ${allocation.growthPct}% reserve for growth opportunities as they come online.`);
  } else {
    parts.push(`.`);
  }
  return parts.join("");
}

/** Deterministic allocation when the LLM stream falls back. */
export function fallbackAllocation(mandate: Mandate, explanation: string): Allocation {
  const preset = templatePreset(mandate);
  const trimmed = explanation.trim();
  return trimmed ? { ...preset, explanation: trimmed } : preset;
}

export function templatePreset(mandate: Mandate): Allocation {
  const horizon = mandate.horizon;
  const isEur = mandate.currency_preference === "eur";
  switch (mandate.risk_tolerance) {
    case "very_conservative":
      return {
        template: "Vault",
        usycPct: isEur ? 82 : 90,
        liquidPct: isEur ? 8 : 10,
        eurcPct: isEur ? 10 : 0,
        growthPct: 0,
        explanation: "",
      };
    case "conservative":
      return horizon === "<1y"
        ? { template: "Vault", usycPct: isEur ? 72 : 80, liquidPct: isEur ? 13 : 20, eurcPct: isEur ? 15 : 0, growthPct: 0, explanation: "" }
        : { template: "Balanced", usycPct: isEur ? 60 : 65, liquidPct: isEur ? 15 : 25, eurcPct: isEur ? 15 : 0, growthPct: 10, explanation: "" };
    case "moderate":
      return { template: "Balanced", usycPct: isEur ? 50 : 55, liquidPct: isEur ? 15 : 25, eurcPct: isEur ? 15 : 0, growthPct: 20, explanation: "" };
    case "aggressive":
      return { template: "Growth", usycPct: isEur ? 28 : 30, liquidPct: isEur ? 10 : 15, eurcPct: isEur ? 7 : 0, growthPct: 55, explanation: "" };
    case "speculative":
      return { template: "Speculative", usycPct: 15, liquidPct: 15, eurcPct: 0, growthPct: 70, explanation: "" };
    default:
      return {
        template: "Vault",
        usycPct: VAULT_FALLBACK.usycPct,
        liquidPct: VAULT_FALLBACK.liquidPct,
        eurcPct: VAULT_FALLBACK.eurcPct,
        growthPct: VAULT_FALLBACK.growthPct,
        explanation: "",
      };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Capital tier midpoints — used by the UI to size dollar amounts.
// ─────────────────────────────────────────────────────────────────────────────
export const CAPITAL_TIER_USD: Record<Mandate["capital_tier"], number> = {
  "<$1k": 500,
  "$1k-10k": 5500,
  "$10k-100k": 55000,
  ">$100k": 250000,
};

export function totalCapitalUsd(mandate: Mandate): number {
  return CAPITAL_TIER_USD[mandate.capital_tier];
}

export function estimatedAnnualEarningsUsd(
  mandate: Mandate,
  allocation: Allocation,
  apy: number,
): number {
  const capital = totalCapitalUsd(mandate);
  return capital * (allocation.usycPct / 100) * (apy / 100);
}
