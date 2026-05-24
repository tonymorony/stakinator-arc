# Architecture

A high-level map of how Stakinator fits together. For setup and the demo
script see [`DEMO.md`](./DEMO.md).

---

## Three layers, four agentic decisions

```
                       ┌─────────────────────┐
   anonymous visit  →  │   1. INQUISITOR     │  ← Claude picks the next question
                       │  (Akinator-style)   │     to maximally reduce uncertainty
                       └─────────────────────┘
                                 ↓
                              Mandate
                                 ↓
                       ┌─────────────────────┐
                       │   2. STRATEGY       │  ← Claude turns the mandate into
                       │  (allocation plan)  │     a target allocation across
                       └─────────────────────┘     USYC / USDC / EURC, with prose
                                 ↓
                          Approved plan
                                 ↓
                       ┌─────────────────────┐
                       │   3. EXECUTION      │  ← Circle App Kit + Modular
                       │  (on-chain on Arc)  │     Wallets push the trades
                       └─────────────────────┘
                                 ↓
                       Positions on Arc testnet
                                 ↓
                       ┌─────────────────────┐
                       │   4. LOOP           │  ← Claude evaluates drift +
                       │  (daily check-in)   │     market shift, decides yes/no
                       └─────────────────────┘
                                 ↓
                      Dashboard + plain-English action log
```

Every user-visible string is translated by `lib/translations/actions.ts`;
no crypto jargon ever reaches the dashboard.

---

## Tech stack

| Concern         | Choice                                         |
|-----------------|------------------------------------------------|
| Framework       | Next.js 16 (App Router, Turbopack)             |
| Language        | TypeScript strict, ES2020 target               |
| Styling         | Tailwind CSS 3 + Framer Motion                 |
| AI              | `@anthropic-ai/sdk` (Claude Sonnet 4.5)        |
| Blockchain      | Arc Testnet via Circle App Kit + viem          |
| Wallets         | Server-derived keys (one per email)            |
| Persistence     | Prisma + Postgres, in-memory fallback in dev   |
| Auth            | Email + OTP, signed-cookie sessions (custom)   |

All LLM calls are routed through `lib/ai/client.ts`. If `ANTHROPIC_API_KEY`
is missing, every decision falls back to deterministic logic so the demo
still works end-to-end (just without a live reasoning trace).

---

## Repository layout

```
src/
  app/
    page.tsx                  ← landing (anonymous)
    (app)/
      onboarding/             ← Inquisitor dialogue
      strategy/               ← allocation card + execution
      dashboard/              ← portfolio view
    api/
      inquisitor/             ← start | next | answer | back | reset
      operator/               ← strategy | execute | loop
      auth/                   ← email | otp | bootstrap | link-session | me | signout
      wallet/                 ← balance | sync
  components/
    inquisitor/               ← Dialogue, ProbabilityBars, MandateCard, …
    strategy/                 ← AllocationCard, PlanExplanation, WalletFundingStep
    execution/                ← ExecutionProgress, TransactionRow
    dashboard/                ← PortfolioOverview, BucketBreakdown, ActionLog
    auth/                     ← AuthModal, AccountWidget
  lib/
    auth/client-events.ts     ← cross-component auth refresh
    format.ts                 ← USD / relative-time helpers

lib/
  inquisitor/                 ← question pool, distribution, mandate, serialize
  ai/                         ← Claude clients for inquisitor / operator / loop
                                + allocation type
  arc/                        ← Circle SDK glue (wallet, USYC, EURC, viem chain)
  auth/                       ← OTP storage, session HMAC, user store
  db/                         ← Prisma client + per-entity repositories
  operator/drift.ts           ← drift detection + simulation
  portfolio/buckets.ts        ← shared allocation → DB position math
  translations/actions.ts     ← single source of truth for user-facing copy
  app/context.ts              ← landing/onboarding/dashboard routing rules

prisma/
  schema.prisma               ← AnonymousSession, User, Mandate, Allocation,
                                Position, Transaction, Rebalance

scripts/
  demo-time.mjs               ← end-to-end timing trace for the demo flow

public/
  icon.svg, logo.png          ← brand
  logos/                      ← USDC, USYC, Circle, Arc, Anthropic
```

---

## State machine (one user)

```
visit /                       → anonymous cookie issued
  ↓
/onboarding                   → Inquisitor loop until Mandate complete
  ↓
/strategy                     → Strategy SSE stream paints AllocationCard
  ↓
[user clicks Continue]
  ├─ not signed in → AuthModal (email → OTP → server wallet derived)
  └─ signed in     → straight to execution
  ↓
Execution SSE                 → one tx per bucket (USYC simulated on testnet)
  ↓
/dashboard                    → positions, action log, "Run agent check-in"
```

`lib/app/context.ts` picks the right destination for every entry point so
a returning user never re-runs the wizard.

---

## Why each Circle / Arc primitive is used

- **USDC as gas** — the user never sees a gas dialog; the Arc economics make
  it cheap enough to rebalance freely.
- **Modular Wallets** — email login with no seed phrases, no extensions.
- **USYC** — the "safe bucket". Tokenized money-market fund.
- **App Kit Swap** — USDC ↔ EURC when the Inquisitor flags a European user.
- **Arc sub-second finality** — the execution SSE shows transactions
  settling live without waiting on L1 confirmations.

---

## Persistence model

```
AnonymousSession ──────► User (1:1, after OTP)
  distribution
  askedIds
  mandateJson                    Mandate ──► Allocation
  allocationJson                 Position[]    (target → applied)
  executedAt                     Transaction[] (humanDescription is canonical)
  userId                         Rebalance[]   (decisions made by the loop)
```

The anonymous session is the spine of the pre-auth flow. After OTP we
link it to the user record and fold its mandate + allocation into the
typed models above.

---

## Non-negotiable rules (in code review)

1. **No crypto jargon in user copy.** Everything user-facing routes through
   `lib/translations/actions.ts`. Tokens may only appear inside the
   Inquisitor's educational inserts, where they're explicitly defined.
2. **No user signing actions.** The Modular Wallet acts on the user's
   behalf — no MetaMask, no approval popups, no copy-paste.
3. **LLM calls are not optional for agentic decision points.** All four
   (question selection, strategy, loop, mandate summary) must try Claude
   first and fall back deterministically only on failure.
