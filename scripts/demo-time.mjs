#!/usr/bin/env node
/**
 * scripts/demo-time.mjs — End-to-end timing trace for the demo flow.
 *
 * Walks every API in order, measures wall time per step, prints a summary.
 * Maintains its own cookie jar so the anonymous session and auth session
 * are preserved across requests.
 *
 * Usage:  node scripts/demo-time.mjs [base-url]
 *         BASE_URL=http://localhost:3000 node scripts/demo-time.mjs
 */
const BASE = process.argv[2] || process.env.BASE_URL || "http://localhost:3000";

// ── Cookie jar ─────────────────────────────────────────────────────────────
const cookieJar = new Map();
function applySetCookies(setCookieHeaders) {
  if (!setCookieHeaders) return;
  const list = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  for (const raw of list) {
    const [pair] = raw.split(";");
    const eq = pair.indexOf("=");
    if (eq < 0) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (!value || value.toLowerCase() === "deleted") {
      cookieJar.delete(name);
    } else {
      cookieJar.set(name, value);
    }
  }
}
function cookieHeader() {
  return [...cookieJar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}
async function http(method, path, body) {
  const headers = { accept: "*/*" };
  if (body !== undefined) headers["content-type"] = "application/json";
  const ch = cookieHeader();
  if (ch) headers["cookie"] = ch;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  // node's fetch exposes Set-Cookie via getSetCookie() in newer versions.
  const setCookie =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : res.headers.raw?.()?.["set-cookie"];
  applySetCookies(setCookie);
  return res;
}

// ── Timer helper ───────────────────────────────────────────────────────────
const t0 = Date.now();
const steps = [];
function step(label, ms) {
  steps.push({ label, ms });
  console.log(label.padEnd(48) + String(ms).padStart(6) + " ms");
}
async function timed(label, fn) {
  const s = Date.now();
  const out = await fn();
  step(label, Date.now() - s);
  return out;
}

// ── SSE reader ─────────────────────────────────────────────────────────────
async function readSSE(response, onEvent) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    // SSE events are separated by blank lines.
    let idx;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const dataLines = [];
      for (const line of chunk.split("\n")) {
        if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
      }
      if (!dataLines.length) continue;
      const payload = dataLines.join("\n");
      try {
        const obj = JSON.parse(payload);
        const stop = await onEvent(obj);
        if (stop === "stop") return;
      } catch {
        /* ignore malformed chunks */
      }
    }
  }
}

// ── Option pick policy ─────────────────────────────────────────────────────
function pickOption(question) {
  // Educational answers for Q1/Q2 (triggers the inserts in the real demo).
  if (question.id === "Q1_USDC_LITERACY") return "no_what";
  if (question.id === "Q2_ARC_LITERACY") return "no_tell_me";
  return question.options[0]?.id;
}

// ── Main run ───────────────────────────────────────────────────────────────
(async () => {
  await timed("1. GET / (landing)", async () => {
    const res = await http("GET", "/");
    if (!res.ok) throw new Error(`landing ${res.status}`);
  });

  await timed("2. POST /api/inquisitor/start", async () => {
    const res = await http("POST", "/api/inquisitor/start");
    if (!res.ok) throw new Error(`start ${res.status}`);
  });

  // Fetch Q1 explicitly.
  let nextQuestion = await timed("3. POST /api/inquisitor/next (Q1)", async () => {
    const res = await http("POST", "/api/inquisitor/next");
    if (!res.ok) throw new Error(`next ${res.status}`);
    return (await res.json()).question;
  });

  // Loop through Q1…done. Each /answer SSE stream yields events:
  //   { type: "distribution", ... }
  //   { type: "question", question, reasoning }   ← more questions remain
  //   { type: "summary", text }                   ← repeated for each chunk
  //   { type: "done", mandate }                   ← terminal
  const inqStart = Date.now();
  let qNum = 1;
  let mandate = null;
  while (nextQuestion) {
    const qid = nextQuestion.id;
    const oid = pickOption(nextQuestion);
    const s = Date.now();
    const sseRes = await http("POST", "/api/inquisitor/answer", {
      questionId: qid,
      optionId: oid,
    });
    if (!sseRes.ok) throw new Error(`answer ${sseRes.status}`);
    let nextFromStream = null;
    await readSSE(sseRes, (evt) => {
      if (evt.type === "question") nextFromStream = evt.question;
      if (evt.type === "done") mandate = evt.mandate || null;
    });
    step(`   Q${qNum} (${qid} → ${oid})`, Date.now() - s);
    qNum++;
    nextQuestion = nextFromStream;
  }
  step("→ Inquisitor loop total", Date.now() - inqStart);
  if (!mandate) console.warn("WARNING: no mandate received from inquisitor stream");

  // ── Strategy SSE ─────────────────────────────────────────────────────────
  let allocation = null;
  await timed("4. POST /api/operator/strategy (SSE)", async () => {
    const res = await http("POST", "/api/operator/strategy", {});
    if (!res.ok) throw new Error(`strategy ${res.status}`);
    await readSSE(res, (evt) => {
      if (evt.type === "done") {
        allocation = evt.allocation;
        return "stop";
      }
    });
  });
  if (!allocation) console.warn("WARNING: strategy stream returned no allocation");

  // Unique per-run email avoids the OTP rate-limit between repeated traces.
  const email = `demo+timing-${Date.now()}@stakinator.app`;

  // ── OTP request ──────────────────────────────────────────────────────────
  const devCode = await timed("5. POST /api/auth/email", async () => {
    const res = await http("POST", "/api/auth/email", { email });
    if (!res.ok) throw new Error(`email ${res.status}`);
    return (await res.json()).devCode;
  });
  if (!devCode) throw new Error("no devCode returned");

  // ── OTP verify ───────────────────────────────────────────────────────────
  await timed("6. POST /api/auth/otp", async () => {
    const res = await http("POST", "/api/auth/otp", {
      email,
      code: devCode,
    });
    if (!res.ok) throw new Error(`otp ${res.status} ${await res.text()}`);
  });

  // ── Link anonymous session to authed user ────────────────────────────────
  await timed("7. POST /api/auth/link-session", async () => {
    const res = await http("POST", "/api/auth/link-session", {});
    if (!res.ok) throw new Error(`link-session ${res.status}`);
  });

  // ── Execute ──────────────────────────────────────────────────────────────
  await timed("8. POST /api/operator/execute (SSE)", async () => {
    const res = await http("POST", "/api/operator/execute", {});
    if (!res.ok) throw new Error(`execute ${res.status}`);
    await readSSE(res, (evt) => {
      if (evt.type === "done") return "stop";
    });
  });

  // ── Dashboard render ─────────────────────────────────────────────────────
  await timed("9. GET /dashboard", async () => {
    const res = await http("GET", "/dashboard");
    if (!res.ok && res.status !== 307 && res.status !== 308) {
      throw new Error(`dashboard ${res.status}`);
    }
  });

  // ── Simulate loop ────────────────────────────────────────────────────────
  await timed("10. POST /api/operator/loop (simulate)", async () => {
    const res = await http("POST", "/api/operator/loop", { simulate: true });
    if (!res.ok) throw new Error(`loop ${res.status}`);
  });

  const totalMs = Date.now() - t0;
  console.log("");
  console.log("─".repeat(56));
  console.log("TOTAL (server-side, no UI animation delays):".padEnd(48) + String(totalMs).padStart(6) + " ms");
  console.log("Approx demo-floor estimate (server + animations):".padEnd(48) + String(totalMs + 21000).padStart(6) + " ms");
})().catch((err) => {
  console.error("FAILED:", err.message);
  process.exit(1);
});
