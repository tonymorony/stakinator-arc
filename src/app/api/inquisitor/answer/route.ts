import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { resolveInquisitorSession, updateSession } from "@/lib/db/sessions";
import {
  applyAnswer,
  buildMandate,
  type AxisDistribution,
} from "@/lib/inquisitor";
import { selectNextQuestion, streamMandateSummary } from "@/lib/ai/inquisitor";
import { sanitizeQuestion } from "@/lib/inquisitor/serialize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const COOKIE_NAME = "stak.sid";

interface AnswerBody {
  sessionId?: string;
  questionId?: string;
  optionId?: string;
}

/**
 * POST /api/inquisitor/answer
 *
 * Applies the user's answer to the session distribution and streams (SSE) the
 * follow-up events:
 *   { type: 'distribution', distribution, askedCount }
 *   { type: 'question', question, reasoning }   ← if more questions remain
 *   { type: 'summary', text }                   ← repeated for each text chunk
 *   { type: 'done', mandate }                   ← when the dialogue is complete
 *   { type: 'error', message }                  ← on any failure
 */
export async function POST(req: NextRequest): Promise<Response> {
  const jar = await cookies();
  const sidFromCookie = jar.get(COOKIE_NAME)?.value;

  const body = (await req.json().catch(() => null)) as AnswerBody | null;
  const questionId = body?.questionId;
  const optionId = body?.optionId;

  if (!questionId || !optionId) {
    return Response.json(
      { error: "Missing questionId or optionId" },
      { status: 400 },
    );
  }

  const session = await resolveInquisitorSession({
    bodySessionId: body?.sessionId,
    cookieSessionId: sidFromCookie,
    createIfMissing: false,
  });
  if (!session) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  // ── Apply the signal and persist before we start streaming ────────────────
  let nextSession;
  try {
    nextSession = applyAnswer(
      {
        distribution: session.distribution,
        asked: session.askedIds,
        done: false,
      },
      questionId,
      optionId,
    );
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }

  await updateSession(session.id, {
    distribution: nextSession.distribution,
    askedIds: nextSession.asked,
  });

  // ── Build SSE stream ──────────────────────────────────────────────────────
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      try {
        send({
          type: "distribution",
          distribution: nextSession.distribution as AxisDistribution,
          askedCount: nextSession.asked.length,
        });

        if (nextSession.done) {
          await emitMandate(nextSession.asked, nextSession.distribution, send, session.id);
        } else {
          await emitNextQuestion(nextSession.asked, nextSession.distribution, send);
        }
      } catch (err) {
        send({
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────

async function emitNextQuestion(
  asked: string[],
  distribution: AxisDistribution,
  send: (p: object) => void,
): Promise<void> {
  const selection = await selectNextQuestion({ distribution, asked, done: false });
  if (!selection) {
    send({ type: "error", message: "No next question available" });
    return;
  }

  send({
    type: "question",
    question: sanitizeQuestion(selection.question),
    reasoning: selection.reasoning,
  });
}

async function emitMandate(
  asked: string[],
  distribution: AxisDistribution,
  send: (p: object) => void,
  sessionId: string,
): Promise<void> {
  const mandate = buildMandate(distribution, asked.length);

  // Stream the human-readable summary so the UI sees it appear word by word.
  let streamed = "";
  for await (const chunk of streamMandateSummary(mandate)) {
    streamed += chunk;
    send({ type: "summary", text: chunk });
  }

  const finalMandate = {
    ...mandate,
    summary_human: streamed.trim() || mandate.summary_human,
  };

  await updateSession(sessionId, {
    mandateJson: finalMandate,
  });

  send({ type: "done", mandate: finalMandate });
}
