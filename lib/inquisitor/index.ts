// Inquisitor public API.
//
// Flow:
//   Every question is picked by the LLM (or entropy fallback) from the full
//   behavioural pool in `questions.ts`. There is no fixed prefix — Q1 is
//   simply "the most informative opening question". The dialogue ends when
//   either MAX_QUESTIONS have been asked, or every axis has resolved beyond
//   RESOLUTION_THRESHOLD.
//
// Education about specific products (USDC, ARC, USYC) is no longer baked
// into the questionnaire — it lives in the strategy step (see AllocationCard).

export { QUESTION_POOL, LLM_QUESTION_IDS, findQuestion } from "./questions";
export {
  initDistribution,
  applySignal,
  pickNextQuestion,
  isResolved,
  totalEntropy,
  expectedEntropyReduction,
  readMandate,
  RESOLUTION_THRESHOLD,
  MAX_QUESTIONS,
} from "./distribution";
export {
  buildMandate,
  deriveTemplate,
  mandateSummaryPrompt,
  vocabLevel,
  VOCAB_RULES,
  DEFAULT_CAPITAL_TIER,
} from "./mandate";
export type {
  AxisDistribution,
  AxisSignal,
  AxisName,
  Question,
  AnswerOption,
  EducationalInsert,
  Mandate,
  MandateAxes,
  RiskTolerance,
  Horizon,
  CapitalTier,
  GoalType,
  Liquidity,
  CryptoFluency,
} from "./types";
export { AXIS_LABELS, AXIS_TITLES } from "./types";

import {
  QUESTION_POOL,
  LLM_QUESTION_IDS,
  findQuestion,
} from "./questions";
import {
  applySignal,
  initDistribution,
  isResolved,
  MAX_QUESTIONS,
  pickNextQuestion,
} from "./distribution";
import type { AxisDistribution, Question, AxisName } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Session state (in-memory shape; persisted as JSON in AnonymousSession.distribution + askedIds).
// ─────────────────────────────────────────────────────────────────────────────
export interface InquisitorSession {
  distribution: AxisDistribution;
  asked: string[];
  done: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Question sequencing
// ─────────────────────────────────────────────────────────────────────────────

/** All question ids in the pool that have not yet been asked. */
export function llmCandidateIds(asked: string[]): string[] {
  return LLM_QUESTION_IDS.filter((id) => !asked.includes(id));
}

/**
 * Deterministic entropy-based picker over every unanswered question.
 * Used when the LLM call fails (or no API key is configured) so the
 * dialogue never blocks.
 */
export function fallbackPickFromCandidates(
  dist: AxisDistribution,
  asked: string[],
): Question | null {
  const candidates = llmCandidateIds(asked)
    .map((id) => findQuestion(id))
    .filter((q): q is Question => Boolean(q));
  if (candidates.length === 0) return null;
  return pickNextQuestion(dist, candidates, []);
}

// ─────────────────────────────────────────────────────────────────────────────
// Session helpers
// ─────────────────────────────────────────────────────────────────────────────

export function createSession(): InquisitorSession {
  return {
    distribution: applySignal(initDistribution(), {}),
    asked: [],
    done: false,
  };
}

export function applyAnswer(
  session: InquisitorSession,
  questionId: string,
  optionId: string,
): InquisitorSession {
  const question = findQuestion(questionId);
  if (!question) throw new Error(`Unknown question: ${questionId}`);

  const option = question.options.find((o) => o.id === optionId);
  if (!option) throw new Error(`Unknown option: ${optionId}`);

  const newDist = applySignal(session.distribution, option.signal);
  const newAsked = [...session.asked, questionId];
  const done = newAsked.length >= MAX_QUESTIONS || isResolved(newDist);

  return { distribution: newDist, asked: newAsked, done };
}

export function questionsAskedCount(asked: string[]): number {
  return asked.length;
}

/** Axes touched by at least one answered question (primary axis only). */
export function axesProbedByQuestions(askedIds: string[]): Set<AxisName> {
  const probed = new Set<AxisName>();
  for (const id of askedIds) {
    const q = findQuestion(id);
    if (!q) continue;
    for (const axis of q.axes.primary) {
      if (axis !== "capital_tier") probed.add(axis);
    }
  }
  return probed;
}

// ─────────────────────────────────────────────────────────────────────────────
// LLM reasoning prompt — picks the next question from the full pool.
// ─────────────────────────────────────────────────────────────────────────────
export function buildReasoningPrompt(session: InquisitorSession): string {
  const candidates = llmCandidateIds(session.asked)
    .map((id) => findQuestion(id))
    .filter((q): q is Question => Boolean(q))
    .map((q) => ({
      id: q.id,
      text: q.text,
      primaryAxes: q.axes.primary,
      secondaryAxes: q.axes.secondary ?? [],
    }));

  return [
    "You are the Inquisitor — an AI that builds an investor profile in the fewest possible questions.",
    "",
    "Current probability distribution across mandate axes (each axis sums to 1.0).",
    "Ignore `capital_tier` — the dollar amount is chosen later on the strategy page.",
    JSON.stringify(session.distribution, null, 2),
    "",
    `Questions already asked (${session.asked.length}): ${session.asked.join(", ") || "none"}`,
    "",
    "Candidate questions still available (pick exactly one):",
    JSON.stringify(candidates, null, 2),
    "",
    "Task:",
    "1. Identify which axes still have high uncertainty — i.e. no single bucket above 0.70.",
    "2. Pick the candidate whose answer is most likely to collapse uncertainty on the weakest axis.",
    "3. Prefer questions that touch multiple weak axes simultaneously (`primaryAxes` + `secondaryAxes`).",
    "4. Avoid asking two questions on the same axis back-to-back unless that axis is the only one still uncertain.",
    '5. Return JSON ONLY: { "selected_question_id": "<one of the candidate ids>", "reasoning": "<one short sentence>" }',
    "",
    "The `reasoning` field is shown live to judges — keep it crisp and specific (e.g. \"risk_tolerance still spread across three buckets, this scenario question splits them\").",
  ].join("\n");
}
