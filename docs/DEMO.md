# Running the demo

Stakinator is built for the Agora × Circle "Agentic Stablecoin Finance"
hackathon. This doc covers local setup and the canonical demo script.

For a system overview see [`ARCHITECTURE.md`](./ARCHITECTURE.md).

---

## Prerequisites

- Node.js 20+
- npm (or pnpm/yarn — only `package.json` scripts are used)
- Optional: Postgres (Supabase, Neon, or local). Without it, the app
  keeps sessions in memory and the demo still works end-to-end.
- Optional: an Anthropic API key. Without it, all three Claude-driven
  decisions fall back to deterministic logic.

---

## Setup

```bash
git clone <repo> && cd stakinator-arc
npm install
cp .env.example .env.local
# fill in whichever keys you have; missing keys degrade gracefully
```

Required for live demo:

| Variable                  | Why                                            |
|---------------------------|------------------------------------------------|
| `NEXTAUTH_SECRET`         | Signs the session cookie                       |
| `ANTHROPIC_API_KEY`       | Live reasoning traces (Claude Sonnet)          |
| `CIRCLE_KIT_KEY`          | Real USDC → EURC swap on Arc Testnet           |
| `ARC_TESTNET_PRIVATE_KEY` | Seed for the server-derived wallets            |
| `ARC_RPC_URL`             | Arc Testnet RPC endpoint                       |
| `DATABASE_URL`            | Postgres connection string (optional)          |

If you set `DATABASE_URL`, run the migrations once:

```bash
npx prisma migrate dev --name init
```

Then start the dev server:

```bash
npm run dev
# → http://localhost:3000
```

---

## Canonical demo script (3 minutes)

1. **Landing.** One paragraph, one button. No "Connect wallet".
2. **Onboarding (Inquisitor).** 6 questions. Watch the probability bars on
   the right shift after each answer — every question is picked by Claude to
   maximally reduce the remaining uncertainty.
3. **Mandate summary.** Plain English: "You're saving for the medium term,
   want most of the money safe, with some room to grow."
4. **Strategy.** Allocation card streams in. Three buckets:
   - Safe Treasury Fund (USYC, ~5.2% APY)
   - Ready cash (USDC)
   - Tokenized stock funds (held as ready cash until Circle launches it on Arc)

   "Read full reasoning →" expands Claude's complete explanation.
5. **Auth modal.** Email → OTP. A new server-derived wallet is provisioned
   and shown in the funding step.
6. **Execution.** SSE stream paints one transaction at a time. USDC and
   EURC settle on Arc; USYC is recorded as simulated (Teller allowlist
   is required for real deposits).
7. **Dashboard.** Total balance, today's earnings, allocation donut, action
   log. The wallet bar shows live on-chain balances; the buckets show the
   strategy split — they match.
8. **Run agent check-in.** Claude evaluates drift + a simulated APY move
   and either explains why nothing changed or executes a small rebalance.

The whole flow is wired up so a fresh user lands at `/`, a returning user
with a mandate but no positions lands at `/strategy`, and a fully
onboarded user lands at `/dashboard` — see `lib/app/context.ts`.

---

## Smoke test

End-to-end timing trace:

```bash
node scripts/demo-time.mjs http://localhost:3000
```

It walks every API in order, prints per-step wall time, and surfaces any
broken endpoint before you click around.

---

## Degraded modes

| Missing                | What happens                                          |
|------------------------|-------------------------------------------------------|
| `ANTHROPIC_API_KEY`    | Inquisitor uses entropy fallback; Strategy uses Vault template; Loop uses "portfolio on track" — no live reasoning text |
| `CIRCLE_KIT_KEY`       | USDC → EURC swap is simulated; UI shows "simulated" badge |
| `DATABASE_URL`         | Sessions persist in memory (process-local), warning logged once |
| Arc RPC unreachable    | Wallet balances default to zero; execution still records the plan |

These are not silent — each module logs a one-line warning so the demo
operator can spot it.
