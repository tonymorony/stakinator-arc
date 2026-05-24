"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { AnswerButton } from "./AnswerButton";
import { EducationalInsert } from "./EducationalInsert";
import { ProgressDots } from "./ProgressDots";
import { ProbabilityBarsPanel } from "./ProbabilityBarsPanel";
import { MandateCard } from "./MandateCard";
import { SpeechBubble } from "./SpeechBubble";
import { WizardIcon } from "@/components/WizardIcon";
import {
  MAX_QUESTIONS,
  initDistribution,
  type AxisDistribution,
  type Mandate,
} from "@/lib/inquisitor";
import type { ClientQuestion } from "@/lib/inquisitor/serialize";
import {
  clearStoredSession,
  resolveSessionId,
  setStoredMandate,
  setStoredSessionId,
} from "@/lib/session/client";

type DialogueState = "loading" | "question" | "mandate";

/** Time the selected-answer flash stays before we advance. */
const FLASH_MS = 250;

interface HistoryEntry {
  question: ClientQuestion;
  distribution: AxisDistribution;
  askedCount: number;
  answeredOptionId: string;
}

const slideVariants = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 32 }),
  center: { opacity: 1, x: 0 },
  exit: (dir: number) => ({ opacity: 0, x: dir * -32 }),
};

interface SSEEvent {
  type: "distribution" | "question" | "summary" | "done" | "error";
  distribution?: AxisDistribution;
  askedCount?: number;
  question?: ClientQuestion;
  reasoning?: string;
  text?: string;
  mandate?: Mandate;
  message?: string;
}

export function Dialogue() {
  const router = useRouter();
  const [state, setState] = useState<DialogueState>("loading");
  const [question, setQuestion] = useState<ClientQuestion | null>(null);
  const [distribution, setDistribution] = useState<AxisDistribution>(initDistribution());
  const [asked, setAsked] = useState(0);
  const [reasoning, setReasoning] = useState("");
  const [insertVisible, setInsertVisible] = useState(false);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [pendingOptionId, setPendingOptionId] = useState<string | null>(null);
  const [summary, setSummary] = useState("");
  const [mandate, setMandate] = useState<Mandate | null>(null);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [slideDirection, setSlideDirection] = useState(1);
  const [restoredOptionId, setRestoredOptionId] = useState<string | null>(null);

  const sessionIdRef = useRef<string | null>(null);

  // ── Bootstrap session + first question ──────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      try {
        const startRes = await fetch("/api/inquisitor/start", {
          method: "POST",
          cache: "no-store",
        });
        if (!startRes.ok) throw new Error("Could not start session.");
        const startData = (await startRes.json()) as { sessionId: string };
        sessionIdRef.current = startData.sessionId;
        setStoredSessionId(startData.sessionId);

        const nextRes = await fetch("/api/inquisitor/next", {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: startData.sessionId }),
        });
        if (!nextRes.ok) throw new Error("Could not fetch the first question.");
        const nextData = (await nextRes.json()) as {
          question: ClientQuestion;
          distribution: AxisDistribution;
          askedCount: number;
          reasoning: string;
        };
        if (cancelled) return;
        setQuestion(nextData.question);
        setDistribution(nextData.distribution);
        setAsked(nextData.askedCount);
        setReasoning(nextData.reasoning);
        setState("question");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Something went wrong.");
        setState("question");
      }
    };

    void start();
    return () => {
      cancelled = true;
    };
  }, []);

  const resetSelection = useCallback(() => {
    setSelectedOptionId(null);
    setPendingOptionId(null);
    setInsertVisible(false);
  }, []);

  // ── Go back to the previous question ────────────────────────────────────
  const handleBack = useCallback(() => {
    if (history.length === 0 || state === "loading") return;
    const prev = history[history.length - 1];
    const nextHistory = history.slice(0, -1);

    setSlideDirection(-1);
    setHistory(nextHistory);
    setQuestion(prev.question);
    setDistribution(prev.distribution);
    setAsked(prev.askedCount);
    setRestoredOptionId(prev.answeredOptionId);
    setSelectedOptionId(null);
    setPendingOptionId(null);
    setInsertVisible(false);
    setState("question");

    const askedIds = nextHistory.map((e) => e.question.id);
    const sessionId = sessionIdRef.current;
    if (sessionId) {
      void fetch("/api/inquisitor/back", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, distribution: prev.distribution, askedIds }),
      });
    }
  }, [history, state]);

  // ── Submit + consume the SSE stream ─────────────────────────────────────
  const submitAnswer = useCallback(
    async (questionId: string, optionId: string) => {
      const sessionId = resolveSessionId(sessionIdRef.current);
      if (!sessionId) {
        setError("Session is not ready yet.");
        return;
      }

      setSlideDirection(1);
      setRestoredOptionId(null);

      // Save current state to history before advancing
      setHistory((prev) =>
        question
          ? [...prev, { question, distribution, askedCount: asked, answeredOptionId: optionId }]
          : prev,
      );

      setSelectedOptionId(optionId);
      setState("loading");
      setSummary("");

      // Brief flash so the user perceives the selection before the wizard bounces.
      await new Promise((r) => setTimeout(r, FLASH_MS));

      try {
        const sessionId = resolveSessionId(sessionIdRef.current);
        const res = await fetch("/api/inquisitor/answer", {
          method: "POST",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
          body: JSON.stringify({ sessionId, questionId, optionId }),
        });
        if (!res.ok || !res.body) {
          throw new Error("The server didn't return a stream.");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let nlIdx: number;
          while ((nlIdx = buffer.indexOf("\n\n")) >= 0) {
            const frame = buffer.slice(0, nlIdx);
            buffer = buffer.slice(nlIdx + 2);
            handleFrame(frame);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save your answer.");
        setState("question");
      }
    },
    [question, distribution, asked],
  );

  /** Parse one SSE `data: { ... }` frame and dispatch to state. */
  const handleFrame = useCallback((frame: string) => {
    const trimmed = frame.trim();
    if (!trimmed.startsWith("data:")) return;
    const payload = trimmed.slice(5).trim();
    if (!payload) return;
    let evt: SSEEvent;
    try {
      evt = JSON.parse(payload) as SSEEvent;
    } catch {
      return;
    }

    switch (evt.type) {
      case "distribution":
        if (evt.distribution) setDistribution(evt.distribution);
        if (typeof evt.askedCount === "number") setAsked(evt.askedCount);
        break;
      case "question":
        if (evt.question) {
          setQuestion(evt.question);
          setReasoning(evt.reasoning ?? "");
          resetSelection();
          setRestoredOptionId(null);
          setState("question");
        }
        break;
      case "summary":
        setState("mandate");
        if (evt.text) setSummary((prev) => prev + evt.text);
        break;
      case "done":
        if (evt.mandate) {
          setMandate(evt.mandate);
          setStoredMandate(evt.mandate);
          setSummary((prev) => prev || evt.mandate!.summary_human);
        }
        setState("mandate");
        break;
      case "error":
        setError(evt.message ?? "Something went wrong.");
        break;
    }
  }, [resetSelection]);

  const handleOptionClick = useCallback(
    (optionId: string) => {
      if (!question || state !== "question") return;
      if (selectedOptionId) return; // already submitting

      const triggersInsert =
        question.educationalInsert?.triggerOptionId === optionId;

      if (triggersInsert) {
        setPendingOptionId(optionId);
        setInsertVisible(true);
        return;
      }

      void submitAnswer(question.id, optionId);
    },
    [question, state, selectedOptionId, submitAnswer],
  );

  const handleInsertContinue = useCallback(() => {
    if (!question || !pendingOptionId) return;
    setInsertVisible(false);
    void submitAnswer(question.id, pendingOptionId);
  }, [question, pendingOptionId, submitAnswer]);

  const handleStartOver = useCallback(async () => {
    setBuilding(false);
    setMandate(null);
    setSummary("");
    setAsked(0);
    setDistribution(initDistribution());
    setError(null);
    setReasoning("");
    setState("loading");
    sessionIdRef.current = null;
    clearStoredSession();

    try {
      await fetch("/api/inquisitor/reset", {
        method: "POST",
        cache: "no-store",
      });
    } catch {
      /* The next mount will retry. */
    }
    router.refresh();
    location.reload();
  }, [router]);

  const handleBuildPlan = useCallback(() => {
    setBuilding(true);
    router.push("/strategy");
  }, [router]);

  // ── Render ──────────────────────────────────────────────────────────────
  const isMandateState = state === "mandate" || mandate !== null;
  const isLoading = state === "loading" && !isMandateState;

  return (
    <>
      <ProbabilityBarsPanel distribution={distribution} reasoning={reasoning} asked={asked} />

      <div className="min-h-[calc(100dvh-3.5rem)] bg-gradient-to-b from-[#EDF5FF] to-white">
      <main className="mx-auto h-[calc(100dvh-3.5rem)] w-full max-w-2xl overflow-y-auto px-4 py-6 lg:pr-64 xl:pr-72">
        <div
          className={`flex min-h-full w-full flex-col items-center ${
            isMandateState ? "justify-start py-4" : "justify-center py-4"
          }`}
        >
        {error ? (
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
        ) : null}

        <AnimatePresence mode="wait" custom={slideDirection}>
          {isMandateState ? (
            <motion.div
              key="mandate"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full"
            >
              <MandateCard
                summary={summary}
                mandate={mandate}
                onBuildPlan={handleBuildPlan}
                onStartOver={handleStartOver}
                building={building}
              />
            </motion.div>
          ) : (
            <motion.div
              key={question?.id ?? "loading"}
              custom={slideDirection}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="flex w-full max-w-xl flex-col items-center"
            >
              <nav
                aria-label="Question navigation"
                className="mb-8 flex w-full items-center gap-3"
              >
                <button
                  type="button"
                  onClick={() => void handleBack()}
                  disabled={history.length === 0 || isLoading}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-white text-text-muted transition-all hover:border-accent-earn/40 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-border disabled:hover:text-text-muted"
                  aria-label="Previous question"
                >
                  <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 3L5 8l5 5" />
                  </svg>
                </button>
                <ProgressDots total={MAX_QUESTIONS} asked={asked} />
              </nav>

              <WizardIcon
                size={72}
                variant={isLoading ? "fast-float" : "bounce"}
                bounceKey={question?.id ?? "wait"}
                className="mb-4"
              />

              <QuestionBlock
                question={question}
                dim={insertVisible}
                onSelect={handleOptionClick}
                selectedOptionId={selectedOptionId}
                pendingOptionId={pendingOptionId}
                restoredOptionId={restoredOptionId}
                disabled={Boolean(selectedOptionId)}
                loading={isLoading}
              />

              <AnimatePresence>
                {insertVisible && question?.educationalInsert ? (
                  <EducationalInsert
                    insert={question.educationalInsert}
                    onContinue={handleInsertContinue}
                  />
                ) : null}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
        </div>
      </main>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

interface QuestionBlockProps {
  question: ClientQuestion | null;
  dim: boolean;
  onSelect: (optionId: string) => void;
  selectedOptionId: string | null;
  pendingOptionId: string | null;
  restoredOptionId: string | null;
  disabled: boolean;
  loading: boolean;
}

function QuestionBlock({
  question,
  dim,
  onSelect,
  selectedOptionId,
  pendingOptionId,
  restoredOptionId,
  disabled,
  loading,
}: QuestionBlockProps) {
  const ghostOptions = useMemo(
    () => question?.options.filter((o) => o.ghost) ?? [],
    [question],
  );
  const primaryOptions = useMemo(
    () => question?.options.filter((o) => !o.ghost) ?? [],
    [question],
  );

  return (
    <div
      className={`flex w-full flex-col items-center transition-opacity duration-200 ${
        dim ? "pointer-events-none opacity-50" : "opacity-100"
      }`}
    >
      <SpeechBubble className="w-full max-w-xl">
        <p className="font-display text-2xl font-semibold leading-snug text-text-primary">
          {question?.text ?? (loading ? "One moment…" : "")}
        </p>
        {question?.subtext ? (
          <p className="mt-2 text-sm leading-relaxed text-text-muted">{question.subtext}</p>
        ) : null}
      </SpeechBubble>

      {question ? (
        <>
          <div className="mt-4 flex w-full max-w-xl flex-col gap-3">
            {primaryOptions.map((option) => {
              const isPending = pendingOptionId === option.id;
              const isSelected = selectedOptionId === option.id || isPending;
              const isRestored =
                !isSelected && restoredOptionId === option.id && !selectedOptionId;
              return (
                <AnswerButton
                  key={option.id}
                  onClick={() => onSelect(option.id)}
                  selected={isSelected}
                  restored={isRestored}
                  disabled={disabled}
                >
                  {option.text}
                </AnswerButton>
              );
            })}
          </div>
          {ghostOptions.length > 0 ? (
            <div className="mt-2 flex w-full max-w-xl flex-col gap-2">
              {ghostOptions.map((option) => (
                <AnswerButton
                  key={option.id}
                  ghost
                  onClick={() => onSelect(option.id)}
                  selected={selectedOptionId === option.id}
                  disabled={disabled}
                >
                  {option.text}
                </AnswerButton>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function ErrorBanner({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div className="mb-4 flex w-full max-w-xl items-start justify-between gap-3 rounded-2xl border border-status-danger/40 bg-status-danger/10 px-4 py-3 text-sm text-status-danger">
      <span>{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="text-xs underline underline-offset-2 hover:opacity-80"
      >
        dismiss
      </button>
    </div>
  );
}
