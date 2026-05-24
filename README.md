<div align="center">
  <img src="public/icon.svg" alt="Stakinator" width="100" />
  <h1>Stakinator</h1>
  <p><strong>An agentic interface for modern finance.</strong></p>
  <p>The kind of app you could hand to your mom and watch her invest in tokenized
  Treasuries — without ever hearing the words <em>wallet</em>, <em>gas</em>, or
  <em>blockchain</em>.</p>
  <p>
    <a href="https://www.circle.com/arc">Built on Arc</a> ·
    <a href="https://developers.circle.com">Powered by Circle</a> ·
    <a href="https://www.anthropic.com">Reasoning by Claude</a>
  </p>
  <p><em>Submission for the Agora × Circle Agentic Stablecoin Finance hackathon · May 2026</em></p>
</div>

---

## The pitch

Between an ordinary person with a thousand dollars and any modern on-chain
financial product stand roughly thirty concepts that nobody can explain in
five minutes: signatures, gas, slippage, bridges, custody, contracts.

Banks hide the complexity but give you nothing useful to do with the money.
DeFi gives you everything to do but expects you to be a developer to do it.
Robo-advisors split the difference and end up offering "Earn 5%" buttons that
make no real decisions on your behalf.

**Stakinator takes a third path: the agent absorbs the barrier.** You tell it
about your life through a short, game-like conversation. It builds a strategy,
opens you a wallet you'll never have to think about, settles trades on Arc in
USDC, and checks in daily — explaining every decision in plain language.

Think of it as a private banker that costs nothing to talk to, never sleeps,
and walks your mom through tokenized Treasuries without making her feel old.

## What's in the box

Four agentic decisions, each backed by Claude and demoable in under three
minutes:

1. **Inquisitor — the dialogue that does the work.** Akinator-style.
   Maintains a probability distribution over ~8,000 possible mandates and
   asks Claude to pick the next question that will most reduce uncertainty.
   Six questions in, it has a structured mandate — and the user never
   filled out a form.

2. **Strategy — the allocation plan.** Given the mandate and live yields,
   Claude proposes a split across a safe Treasury bucket (USYC), ready cash
   (USDC), and a "coming soon" growth bucket (tokenized stock funds). Every
   percentage is justified in prose the user can actually read.

3. **Execution — on Arc, in USDC, in seconds.** Circle App Kit + Modular
   Wallets push the trades. The user signs nothing, pays no gas, never sees
   a network selector.

4. **Loop — the daily check-in.** Claude looks at portfolio drift and
   market moves, decides whether to rebalance, and writes a one-sentence
   notification ("the safe fund yield went up 0.3% — I moved $50 there
   from cash").

## The accessibility rule

Every user-visible string passes through `lib/translations/actions.ts`.
This is enforced in review. Tokens, gas, hashes, slippage — none of it
ever reaches the dashboard. The only place these words appear is inside
the Inquisitor's educational inserts, where they're paired with a plain
definition in the same sentence.

> Result: the dashboard looks like a banking app for people over 50,
> not a Bybit clone. That's the whole point.

## Try it

```bash
npm install
cp .env.example .env.local   # add ANTHROPIC_API_KEY + Arc keys
npm run dev                  # → http://localhost:3000
```

Full setup, the canonical demo script, and graceful-degradation behavior
when keys are missing — all in [`docs/DEMO.md`](docs/DEMO.md).

For the system map and repo layout, see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Stack

- **Next.js 16** (App Router, Turbopack) · **TypeScript strict** · **Tailwind CSS** · **Framer Motion**
- **Claude Sonnet 4.5** via `@anthropic-ai/sdk` for every agentic decision
- **Arc Testnet** via **Circle App Kit** + **viem**; server-derived Modular Wallets
- **Prisma + Postgres** for persistence (with an in-memory fallback for dev)
- Custom email + OTP auth on signed-cookie sessions

The repo deliberately ships with zero dead dependencies: every package in
`package.json` is reachable from `src/` or `lib/`.

## Status

- End-to-end demo runs against Arc Testnet
- USDC ↔ EURC swap settles on-chain via Circle App Kit
- USYC deposit is recorded as simulated pending Teller allowlisting
- Anthropic key optional; everything degrades gracefully

## Credits

Built in two weeks for the [Agora Agents Hackathon](https://agora.thecanteenapp.com)
on [Arc](https://www.circle.com/arc), powered by [Circle](https://developers.circle.com)
and [Claude](https://www.anthropic.com).
