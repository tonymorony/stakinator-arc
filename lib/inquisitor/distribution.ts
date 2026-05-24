import type { AxisDistribution, AxisSignal, AxisName, Question } from "./types";
// Initialise a uniform prior over all mandate buckets
// ─────────────────────────────────────────────────────────────────────────────
export function initDistribution(): AxisDistribution {
  return {
    risk_tolerance: {
      very_conservative: 0.2,
      conservative: 0.2,
      moderate: 0.2,
      aggressive: 0.2,
      speculative: 0.2,
    },
    horizon: {
      "<1y": 0.2,
      "1-3y": 0.2,
      "3-5y": 0.2,
      "5-10y": 0.2,
      ">10y": 0.2,
    },
    capital_tier: {
      "<$1k": 0.25,
      "$1k-10k": 0.25,
      "$10k-100k": 0.25,
      ">$100k": 0.25,
    },
    goal_type: {
      preservation: 0.2,
      income: 0.2,
      growth: 0.2,
      specific_target: 0.2,
      exploration: 0.2,
    },
    liquidity: {
      anytime: 0.25,
      occasional: 0.25,
      lock_6mo: 0.25,
      lock_years: 0.25,
    },
    crypto_fluency: {
      none: 0.25,
      heard_of: 0.25,
      user: 0.25,
      native: 0.25,
    },
    currency_preference: {
      usd: 0.5,
      eur: 0.5,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Apply a multiplicative signal to the distribution and renormalise per axis.
// Missing keys in the signal are treated as weight 1.0 (neutral).
// ─────────────────────────────────────────────────────────────────────────────
export function applySignal(
  dist: AxisDistribution,
  signal: AxisSignal,
): AxisDistribution {
  const updated = structuredClone(dist) as AxisDistribution;

  for (const axisKey of Object.keys(signal) as AxisName[]) {
    const axisSignal = signal[axisKey];
    if (!axisSignal) continue;

    const axisDist = updated[axisKey] as Record<string, number>;
    for (const bucket of Object.keys(axisDist)) {
      const weight = (axisSignal as Record<string, number>)[bucket] ?? 1.0;
      axisDist[bucket] *= weight;
    }

    // Renormalise
    const total = Object.values(axisDist).reduce((s, v) => s + v, 0);
    if (total > 0) {
      for (const bucket of Object.keys(axisDist)) {
        axisDist[bucket] /= total;
      }
    }
  }

  return updated;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shannon entropy for a single axis distribution
// ─────────────────────────────────────────────────────────────────────────────
function entropy(probs: Record<string, number>): number {
  return Object.values(probs).reduce((h, p) => {
    if (p <= 0) return h;
    return h - p * Math.log2(p);
  }, 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Total remaining uncertainty = sum of entropy across unresolved axes
// ─────────────────────────────────────────────────────────────────────────────
export function totalEntropy(dist: AxisDistribution): number {
  return (Object.values(dist) as Record<string, number>[]).reduce(
    (sum, axis) => sum + entropy(axis),
    0,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Estimate expected entropy reduction for a given question.
// We average the entropy of (dist after each answer) weighted by the answer's
// current plausibility — a simple approximation that the LLM can also reason
// about explicitly in its reasoning trace.
// ─────────────────────────────────────────────────────────────────────────────
export function expectedEntropyReduction(
  dist: AxisDistribution,
  question: Question,
): number {
  const currentEntropy = totalEntropy(dist);
  let expectedPostEntropy = 0;

  // Equal probability over answers (we don't know which the user will pick)
  const answerWeight = 1 / question.options.length;

  for (const option of question.options) {
    const postDist = applySignal(dist, option.signal);
    expectedPostEntropy += answerWeight * totalEntropy(postDist);
  }

  return currentEntropy - expectedPostEntropy;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pick the next question that maximally reduces expected entropy.
// Filters out: already asked questions, questions whose prerequisite fails.
// ─────────────────────────────────────────────────────────────────────────────
export function pickNextQuestion(
  dist: AxisDistribution,
  pool: Question[],
  askedIds: string[],
): Question | null {
  const candidates = pool.filter(
    (q) =>
      !askedIds.includes(q.id) &&
      (!q.prerequisite || q.prerequisite(dist)),
  );

  if (candidates.length === 0) return null;

  let bestQuestion = candidates[0];
  let bestReduction = expectedEntropyReduction(dist, candidates[0]);

  for (const q of candidates.slice(1)) {
    const reduction = expectedEntropyReduction(dist, q);
    if (reduction > bestReduction) {
      bestReduction = reduction;
      bestQuestion = q;
    }
  }

  return bestQuestion;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stopping criterion: each axis has one bucket with >= threshold probability,
// OR the maximum number of questions has been asked.
// ─────────────────────────────────────────────────────────────────────────────
export const RESOLUTION_THRESHOLD = 0.7;
export const MAX_QUESTIONS = 6;

/** Axes the questionnaire actually resolves — capital amount is chosen on /strategy. */
const RESOLUTION_AXES: AxisName[] = [
  "risk_tolerance",
  "horizon",
  "goal_type",
  "liquidity",
  "crypto_fluency",
];

export function isResolved(dist: AxisDistribution): boolean {
  return RESOLUTION_AXES.every((axis) =>
    Object.values(dist[axis]).some((p) => p >= RESOLUTION_THRESHOLD),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Return the most probable bucket for each axis + its confidence
// ─────────────────────────────────────────────────────────────────────────────
export function readMandate(dist: AxisDistribution): {
  values: Record<string, string>;
  confidence: Record<string, number>;
} {
  const values: Record<string, string> = {};
  const confidence: Record<string, number> = {};

  for (const [axis, buckets] of Object.entries(dist) as [string, Record<string, number>][]) {
    const [topBucket, topProb] = Object.entries(buckets).reduce(
      (best, curr) => (curr[1] > best[1] ? curr : best),
    );
    values[axis] = topBucket;
    confidence[axis] = topProb;
  }

  return { values, confidence };
}
