import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createSession, findSession, updateSession } from "@/lib/db/sessions";
import { stripStrategyJson, type Allocation } from "@/lib/ai/allocation";
import {
  estimatedAnnualEarningsUsd,
  fallbackAllocation,
  parseAllocation,
  streamStrategyText,
  totalCapitalUsd,
} from "@/lib/ai/operator";
import { getCurrentAPY } from "@/lib/arc/usyc";
import {
  buildMandate,
  readMandate,
  type Mandate,
} from "@/lib/inquisitor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const COOKIE_NAME = "stak.sid";

/**
 * POST /api/operator/strategy
 *
 * Streams (SSE) the strategy explanation while building it, then emits the
 * final structured allocation in a single `done` event:
 *   { type: "text",  content: string }            // repeated
 *   { type: "done",  allocation, market, capital, annualEarnings }
 *   { type: "error", message }
 *
 * No auth — the dialogue + strategy are anonymous until the user clicks
 * "Execute my strategy".
 */
export async function POST(req: NextRequest): Promise<Response> {
  const jar = await cookies();
  const sidFromCookie = jar.get(COOKIE_NAME)?.value;

  const body = (await req.json().catch(() => null)) as
    | { sessionId?: string; mandate?: Mandate }
    | null;
  const sessionId = body?.sessionId ?? sidFromCookie;

  if (!sessionId && !body?.mandate) {
    return Response.json({ error: "Missing session" }, { status: 400 });
  }

  let session = sessionId ? await findSession(sessionId) : null;

  // Client cached mandate when serverless lost the in-memory session.
  if (!session && body?.mandate) {
    const fresh = await createSession();
    await updateSession(fresh.id, { mandateJson: body.mandate });
    session = { ...fresh, mandateJson: body.mandate };
    jar.set(COOKIE_NAME, fresh.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
  }

  if (!session) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  const activeSessionId = session.id;

  // Rebuild the mandate from whatever we have. Prefer the saved snapshot;
  // fall back to the latest distribution + askedIds.
  let mandate: Mandate | null = session.mandateJson;
  if (!mandate) {
    const { values } = readMandate(session.distribution);
    if (!values.risk_tolerance) {
      return Response.json(
        { error: "Mandate not ready yet" },
        { status: 400 },
      );
    }
    mandate = buildMandate(session.distribution, session.askedIds.length);
    await updateSession(activeSessionId, { mandateJson: mandate });
  }

  const usycApy = await getCurrentAPY();
  const market = { usycApy, volatility: "calm" };

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      let fullText = "";
      let sentDisplay = "";
      let source: "llm" | "fallback" = "fallback";
      try {
        const iter = streamStrategyText(mandate, market);
        while (true) {
          const { value, done } = await iter.next();
          if (done) {
            source = value ?? "fallback";
            break;
          }
          fullText += value;
          const display = stripStrategyJson(fullText);
          const delta = display.slice(sentDisplay.length);
          if (delta) {
            sentDisplay = display;
            send({ type: "text", content: delta });
          }
        }

        const fullExplanation = stripStrategyJson(fullText);
        const final =
          source === "fallback"
            ? fallbackAllocation(mandate, fullExplanation)
            : pickFinalExplanation(parseAllocation(fullText, fullExplanation).allocation, fullExplanation);

        await updateSession(activeSessionId, { allocationJson: final });

        const capital = totalCapitalUsd(mandate);
        const annualEarnings = estimatedAnnualEarningsUsd(mandate, final, usycApy);

        send({
          type: "done",
          allocation: final,
          fullExplanation,
          source,
          market: { usycApy },
          capital,
          annualEarnings,
        });
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

/**
 * Keep the user-facing explanation tidy: strip any trailing JSON the model
 * appended inline. If the explanation is empty after stripping, fall back to
 * the parsed allocation's stored explanation.
 */
function pickFinalExplanation(allocation: Allocation, prose: string): Allocation {
  const final = prose && prose.length > 20 ? prose : allocation.explanation;
  return { ...allocation, explanation: final };
}
