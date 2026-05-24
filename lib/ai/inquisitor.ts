/**
 * LLM glue for the Inquisitor.
 * - selectNextQuestion: pick Q5/Q6/Q7 order with reasoning trace.
 * - streamMandateSummary: render the final mandate card text in plain English.
 *
 * Both have deterministic fallbacks so the dialogue is never blocked by Claude.
 */
import { anthropic, MODEL, extractJSON, hasAnthropicKey } from "./client";
import {
  buildReasoningPrompt,
  fallbackPickFromCandidates,
  findQuestion,
  llmCandidateIds,
  mandateSummaryPrompt,
  type InquisitorSession,
  type Mandate,
  type Question,
} from "@/lib/inquisitor";

export interface QuestionSelection {
  question: Question;
  reasoning: string;
  source: "llm" | "fallback";
}

// ─────────────────────────────────────────────────────────────────────────────
// Q5/Q6/Q7 selection
// ─────────────────────────────────────────────────────────────────────────────

export async function selectNextQuestion(
  session: InquisitorSession,
): Promise<QuestionSelection | null> {
  const candidateIds = llmCandidateIds(session.asked);
  if (candidateIds.length === 0) return null;

  if (candidateIds.length === 1 || !hasAnthropicKey()) {
    return fallbackSelection(session, "fallback");
  }

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 200,
      system:
        "You are the Inquisitor question-selection agent. Return only valid JSON. No prose, no markdown.",
      messages: [
        { role: "user", content: buildReasoningPrompt(session) },
      ],
    });

    const text = response.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("");
    const parsed = extractJSON<{
      selected_question_id?: string;
      reasoning?: string;
    }>(text);

    const question = parsed.selected_question_id
      ? findQuestion(parsed.selected_question_id)
      : undefined;

    if (!question || !candidateIds.includes(question.id)) {
      return fallbackSelection(session, "fallback");
    }

    return {
      question,
      reasoning: parsed.reasoning?.trim() || "",
      source: "llm",
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[inquisitor] LLM question selection failed", err);
    return fallbackSelection(session, "fallback");
  }
}

function fallbackSelection(
  session: InquisitorSession,
  source: "fallback",
): QuestionSelection | null {
  const question = fallbackPickFromCandidates(session.distribution, session.asked);
  if (!question) return null;
  return { question, reasoning: "", source };
}

// ─────────────────────────────────────────────────────────────────────────────
// Final mandate summary — streaming
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Streams the human-readable mandate summary text. Yields plain text chunks.
 * Falls back to the deterministic phrase summary if the LLM call fails or no key.
 */
export async function* streamMandateSummary(
  mandate: Mandate,
): AsyncGenerator<string, void, unknown> {
  if (!hasAnthropicKey()) {
    yield mandate.summary_human;
    return;
  }

  try {
    const stream = anthropic.messages.stream({
      model: MODEL,
      max_tokens: 350,
      system:
        "You are Stakinator, a friendly AI wealth manager speaking warmly to a user who just finished onboarding. Write 2–3 plain-language sentences. No bullet points. No technical terms outside the dialogue's educational inserts.",
      messages: [{ role: "user", content: mandateSummaryPrompt(mandate) }],
    });

    let any = false;
    for await (const chunk of stream) {
      if (
        chunk.type === "content_block_delta" &&
        chunk.delta.type === "text_delta"
      ) {
        any = true;
        yield chunk.delta.text;
      }
    }
    if (!any) yield mandate.summary_human;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[inquisitor] LLM mandate summary failed", err);
    yield mandate.summary_human;
  }
}
