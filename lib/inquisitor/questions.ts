import type { Question } from "./types";

/**
 * Behavioural Akinator pool — no fixed order, no Circle-product literacy gates.
 *
 * The LLM picks each question to maximise entropy reduction across the six
 * mandate axes. Education about USDC / ARC / USYC happens later, in the
 * strategy step (see `AllocationCard`).
 *
 * Coverage:
 *   goal_type        – Q_GOAL_PRIMARY, Q_GOAL_MOTIVATION, Q_GOAL_PRIORITY, Q_GOAL_RETURN
 *   risk_tolerance   – Q_RISK_SCENARIO, Q_RISK_VOLATILITY, Q_RISK_HISTORY
 *   horizon          – Q_HORIZON_ACCESS, Q_HORIZON_LIFE, Q_HORIZON_PATIENCE
 *   liquidity        – Q_LIQUIDITY_USE, Q_LIQUIDITY_LOCK
 *   capital_tier     – not asked (amount chosen on /strategy slider)
 *   crypto_fluency   – Q_EXPERIENCE_BACKGROUND, Q_EXPERIENCE_DIGITAL
 *
 * Signal weight semantics (multiplicative):
 *   ≥ 3.0   strongly indicates this bucket
 *   ~1.5    somewhat indicates it
 *   ~0.3    unlikely
 *   ~0.05   very unlikely
 *   1.0 (omitted)  neutral
 *
 * Every question phrases itself in plain English — no jargon, no Circle terms.
 */

// ─────────────────────────────────────────────────────────────────────────────
// GOAL axis (4 questions)
// ─────────────────────────────────────────────────────────────────────────────

const Q_GOAL_PRIMARY: Question = {
  id: "Q_GOAL_PRIMARY",
  text: "What's the main thing you'd like to do with your money?",
  axes: { primary: ["goal_type"], secondary: ["risk_tolerance"] },
  options: [
    {
      id: "keep_safe",
      text: "Keep it safe and earning a little",
      signal: {
        goal_type: { preservation: 2.5, income: 2.5, growth: 0.3, specific_target: 0.5, exploration: 0.1 },
        risk_tolerance: { very_conservative: 2.0, conservative: 2.5, moderate: 0.5, aggressive: 0.1, speculative: 0.05 },
      },
    },
    {
      id: "grow_over_time",
      text: "Grow it over time",
      signal: {
        goal_type: { growth: 3.0, income: 0.5, preservation: 0.2, specific_target: 0.5, exploration: 0.8 },
        risk_tolerance: { very_conservative: 0.2, conservative: 0.8, moderate: 2.0, aggressive: 2.0, speculative: 0.8 },
      },
    },
    {
      id: "specific_target",
      text: "Save for something specific",
      signal: {
        goal_type: { specific_target: 3.5, growth: 0.5, income: 0.5, preservation: 0.5, exploration: 0.2 },
        risk_tolerance: { very_conservative: 1.0, conservative: 1.5, moderate: 2.0, aggressive: 0.8, speculative: 0.2 },
      },
    },
    {
      id: "exploring",
      text: "Explore what's possible",
      signal: {
        goal_type: { exploration: 3.0, growth: 1.0, specific_target: 0.3, income: 0.3, preservation: 0.1 },
        risk_tolerance: { very_conservative: 0.1, conservative: 0.4, moderate: 1.5, aggressive: 2.0, speculative: 2.0 },
      },
    },
  ],
};

const Q_GOAL_MOTIVATION: Question = {
  id: "Q_GOAL_MOTIVATION",
  text: "What does this money mostly need to do for you?",
  axes: { primary: ["goal_type"], secondary: ["risk_tolerance"] },
  options: [
    {
      id: "stay_steady",
      text: "Stay steady — I just don't want to lose it",
      signal: {
        goal_type: { preservation: 3.0, income: 1.5, growth: 0.2, specific_target: 0.5, exploration: 0.1 },
        risk_tolerance: { very_conservative: 3.0, conservative: 1.5, moderate: 0.3, aggressive: 0.05, speculative: 0.02 },
      },
    },
    {
      id: "build_wealth",
      text: "Build something bigger over years",
      signal: {
        goal_type: { growth: 3.0, exploration: 1.0, specific_target: 0.5, income: 0.5, preservation: 0.2 },
        risk_tolerance: { very_conservative: 0.2, conservative: 0.8, moderate: 2.0, aggressive: 2.0, speculative: 0.8 },
      },
    },
    {
      id: "produce_income",
      text: "Make a little something I can rely on",
      signal: {
        goal_type: { income: 3.5, preservation: 1.0, specific_target: 0.5, growth: 0.3, exploration: 0.1 },
        risk_tolerance: { very_conservative: 1.5, conservative: 2.5, moderate: 1.0, aggressive: 0.2, speculative: 0.05 },
      },
    },
    {
      id: "fund_dream",
      text: "Help me hit a specific dream",
      signal: {
        goal_type: { specific_target: 3.5, growth: 1.0, preservation: 0.5, income: 0.3, exploration: 0.2 },
        risk_tolerance: { very_conservative: 0.8, conservative: 1.5, moderate: 2.0, aggressive: 1.0, speculative: 0.3 },
      },
    },
  ],
};

const Q_GOAL_RETURN: Question = {
  id: "Q_GOAL_RETURN",
  text: "If you could pick one outcome a year from now, which would you take?",
  axes: { primary: ["goal_type", "risk_tolerance"] },
  options: [
    {
      id: "small_steady",
      text: "A small steady gain — no surprises",
      signal: {
        goal_type: { preservation: 2.0, income: 2.5, growth: 0.3, specific_target: 0.5, exploration: 0.1 },
        risk_tolerance: { very_conservative: 3.0, conservative: 2.0, moderate: 0.3, aggressive: 0.05, speculative: 0.02 },
      },
    },
    {
      id: "nice_bump",
      text: "A nice bump from a few good moves",
      signal: {
        goal_type: { growth: 2.5, specific_target: 1.0, exploration: 0.5, income: 0.5, preservation: 0.2 },
        risk_tolerance: { very_conservative: 0.1, conservative: 0.8, moderate: 2.5, aggressive: 2.0, speculative: 0.5 },
      },
    },
    {
      id: "swing_for_fences",
      text: "Could be huge — I'm fine with it being all over the place",
      signal: {
        goal_type: { exploration: 2.5, growth: 1.5, specific_target: 0.3, income: 0.1, preservation: 0.05 },
        risk_tolerance: { very_conservative: 0.02, conservative: 0.1, moderate: 0.5, aggressive: 2.5, speculative: 3.5 },
      },
    },
    {
      id: "steady_cash",
      text: "Regular cash I can actually spend",
      signal: {
        goal_type: { income: 3.5, preservation: 1.0, specific_target: 0.5, growth: 0.2, exploration: 0.1 },
        risk_tolerance: { very_conservative: 1.5, conservative: 2.5, moderate: 1.0, aggressive: 0.3, speculative: 0.1 },
      },
    },
  ],
};

const Q_GOAL_PRIORITY: Question = {
  id: "Q_GOAL_PRIORITY",
  text: "Which of these would bother you the most?",
  axes: { primary: ["goal_type"], secondary: ["risk_tolerance", "liquidity"] },
  options: [
    {
      id: "lose_money",
      text: "Seeing the number drop",
      signal: {
        goal_type: { preservation: 3.0, income: 1.5, growth: 0.3, specific_target: 0.5, exploration: 0.1 },
        risk_tolerance: { very_conservative: 3.0, conservative: 2.0, moderate: 0.3, aggressive: 0.05, speculative: 0.02 },
      },
    },
    {
      id: "miss_a_gain",
      text: "Watching others make money while I sit still",
      signal: {
        goal_type: { growth: 2.5, exploration: 2.0, specific_target: 0.5, income: 0.3, preservation: 0.1 },
        risk_tolerance: { very_conservative: 0.05, conservative: 0.3, moderate: 1.0, aggressive: 2.5, speculative: 2.5 },
      },
    },
    {
      id: "lose_access",
      text: "Not being able to touch the money when I need to",
      signal: {
        goal_type: { preservation: 1.5, income: 1.0, growth: 0.5, specific_target: 1.0, exploration: 0.5 },
        liquidity: { anytime: 3.5, occasional: 1.5, lock_6mo: 0.2, lock_years: 0.05 },
      },
    },
    {
      id: "inflation",
      text: "Watching it slowly lose value to inflation",
      signal: {
        goal_type: { growth: 2.0, income: 2.0, preservation: 0.3, specific_target: 0.5, exploration: 0.5 },
        risk_tolerance: { very_conservative: 0.3, conservative: 1.0, moderate: 2.0, aggressive: 1.5, speculative: 0.5 },
      },
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// RISK axis (3 questions)
// ─────────────────────────────────────────────────────────────────────────────

const Q_RISK_SCENARIO: Question = {
  id: "Q_RISK_SCENARIO",
  text: "Imagine you put $1,000 in today. A month later, the balance shows $850. What do you do?",
  axes: { primary: ["risk_tolerance"] },
  options: [
    {
      id: "pull_out",
      text: "Pull out — this is too stressful",
      signal: {
        risk_tolerance: { very_conservative: 4.0, conservative: 1.5, moderate: 0.1, aggressive: 0.02, speculative: 0.01 },
      },
    },
    {
      id: "wait_nervously",
      text: "Wait nervously and hope it recovers",
      signal: {
        risk_tolerance: { very_conservative: 1.5, conservative: 3.0, moderate: 1.5, aggressive: 0.3, speculative: 0.1 },
      },
    },
    {
      id: "leave_it",
      text: "Leave it — I expected some ups and downs",
      signal: {
        risk_tolerance: { very_conservative: 0.1, conservative: 0.8, moderate: 3.0, aggressive: 2.0, speculative: 1.0 },
      },
    },
    {
      id: "buy_more",
      text: "Add more while it's low",
      signal: {
        risk_tolerance: { very_conservative: 0.02, conservative: 0.1, moderate: 0.8, aggressive: 3.0, speculative: 4.0 },
      },
    },
    {
      id: "not_sure",
      text: "I'm not sure",
      ghost: true,
      signal: {},
    },
  ],
};

const Q_RISK_VOLATILITY: Question = {
  id: "Q_RISK_VOLATILITY",
  text: "How would you feel watching your balance swing 5–10% in a single week?",
  axes: { primary: ["risk_tolerance"] },
  options: [
    {
      id: "anxious",
      text: "Anxious — I'd rather not look",
      signal: {
        risk_tolerance: { very_conservative: 3.5, conservative: 1.5, moderate: 0.2, aggressive: 0.05, speculative: 0.02 },
      },
    },
    {
      id: "uneasy",
      text: "A little uneasy, but I'd manage",
      signal: {
        risk_tolerance: { very_conservative: 1.0, conservative: 3.0, moderate: 1.5, aggressive: 0.3, speculative: 0.1 },
      },
    },
    {
      id: "fine",
      text: "Fine — that's part of the game",
      signal: {
        risk_tolerance: { very_conservative: 0.05, conservative: 0.5, moderate: 3.0, aggressive: 2.0, speculative: 0.8 },
      },
    },
    {
      id: "excited",
      text: "Honestly? Kind of exciting",
      signal: {
        risk_tolerance: { very_conservative: 0.02, conservative: 0.1, moderate: 0.8, aggressive: 2.5, speculative: 3.5 },
      },
    },
  ],
};

const Q_RISK_HISTORY: Question = {
  id: "Q_RISK_HISTORY",
  text: "Have you ever lost money on something you put money into?",
  axes: { primary: ["risk_tolerance"], secondary: ["crypto_fluency"] },
  options: [
    {
      id: "yes_burned",
      text: "Yes — and it really stung",
      signal: {
        risk_tolerance: { very_conservative: 2.5, conservative: 2.5, moderate: 0.8, aggressive: 0.3, speculative: 0.1 },
        crypto_fluency: { none: 0.5, heard_of: 1.5, user: 1.5, native: 0.5 },
      },
    },
    {
      id: "yes_learned",
      text: "Yes — but I learned from it",
      signal: {
        risk_tolerance: { very_conservative: 0.3, conservative: 1.0, moderate: 2.5, aggressive: 2.0, speculative: 1.0 },
        crypto_fluency: { none: 0.3, heard_of: 1.0, user: 2.5, native: 1.5 },
      },
    },
    {
      id: "never_tried",
      text: "No — I've never tried investing",
      signal: {
        risk_tolerance: { very_conservative: 2.5, conservative: 1.5, moderate: 0.5, aggressive: 0.2, speculative: 0.1 },
        crypto_fluency: { none: 3.5, heard_of: 1.0, user: 0.1, native: 0.05 },
      },
    },
    {
      id: "no_careful",
      text: "No — I've been careful and lucky",
      signal: {
        risk_tolerance: { very_conservative: 1.5, conservative: 2.5, moderate: 1.0, aggressive: 0.3, speculative: 0.1 },
      },
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// HORIZON axis (3 questions)
// ─────────────────────────────────────────────────────────────────────────────

const Q_HORIZON_ACCESS: Question = {
  id: "Q_HORIZON_ACCESS",
  text: "When might you want to access this money?",
  axes: { primary: ["horizon"], secondary: ["liquidity"] },
  options: [
    {
      id: "anytime",
      text: "Could be any time",
      signal: {
        horizon: { "<1y": 3.0, "1-3y": 1.5, "3-5y": 0.5, "5-10y": 0.2, ">10y": 0.1 },
        liquidity: { anytime: 3.0, occasional: 1.5, lock_6mo: 0.3, lock_years: 0.1 },
      },
    },
    {
      id: "one_two_years",
      text: "In about 1–2 years",
      signal: {
        horizon: { "<1y": 1.5, "1-3y": 3.5, "3-5y": 0.8, "5-10y": 0.2, ">10y": 0.1 },
        liquidity: { anytime: 1.0, occasional: 2.5, lock_6mo: 1.0, lock_years: 0.2 },
      },
    },
    {
      id: "three_five_years",
      text: "In 3–5 years",
      signal: {
        horizon: { "<1y": 0.1, "1-3y": 0.8, "3-5y": 4.0, "5-10y": 1.0, ">10y": 0.3 },
        liquidity: { anytime: 0.3, occasional: 1.0, lock_6mo: 2.5, lock_years: 0.8 },
      },
    },
    {
      id: "long_term",
      text: "5+ years — I'm thinking long-term",
      signal: {
        horizon: { "<1y": 0.05, "1-3y": 0.1, "3-5y": 0.8, "5-10y": 2.5, ">10y": 3.0 },
        liquidity: { anytime: 0.1, occasional: 0.5, lock_6mo: 1.5, lock_years: 3.0 },
      },
    },
  ],
};

const Q_HORIZON_LIFE: Question = {
  id: "Q_HORIZON_LIFE",
  text: "Anything big on the horizon this money might help with?",
  axes: { primary: ["horizon"], secondary: ["goal_type"] },
  options: [
    {
      id: "soon",
      text: "Sooner than later — within a year",
      signal: {
        horizon: { "<1y": 3.5, "1-3y": 1.0, "3-5y": 0.2, "5-10y": 0.05, ">10y": 0.02 },
        goal_type: { specific_target: 2.0, preservation: 1.5, income: 1.0, growth: 0.3, exploration: 0.5 },
      },
    },
    {
      id: "next_few_years",
      text: "In the next few years (move, family, school)",
      signal: {
        horizon: { "<1y": 0.5, "1-3y": 2.5, "3-5y": 2.0, "5-10y": 0.3, ">10y": 0.1 },
        goal_type: { specific_target: 3.0, growth: 1.0, preservation: 1.0, income: 0.5, exploration: 0.2 },
      },
    },
    {
      id: "far_off",
      text: "Way down the line — retirement, kids' future",
      signal: {
        horizon: { "<1y": 0.05, "1-3y": 0.2, "3-5y": 0.8, "5-10y": 2.5, ">10y": 3.5 },
        goal_type: { growth: 2.5, preservation: 1.0, specific_target: 1.0, income: 0.8, exploration: 0.5 },
      },
    },
    {
      id: "nothing_planned",
      text: "Nothing planned — this is extra",
      signal: {
        horizon: { "<1y": 0.5, "1-3y": 1.0, "3-5y": 1.5, "5-10y": 1.5, ">10y": 1.5 },
        goal_type: { exploration: 2.5, growth: 1.5, preservation: 0.5, income: 0.5, specific_target: 0.3 },
      },
    },
  ],
};

const Q_HORIZON_PATIENCE: Question = {
  id: "Q_HORIZON_PATIENCE",
  text: "How often do you usually check on an investment?",
  axes: { primary: ["horizon"], secondary: ["risk_tolerance", "liquidity"] },
  options: [
    {
      id: "constantly",
      text: "Several times a day",
      signal: {
        horizon: { "<1y": 2.0, "1-3y": 1.0, "3-5y": 0.5, "5-10y": 0.2, ">10y": 0.1 },
        risk_tolerance: { very_conservative: 0.5, conservative: 0.8, moderate: 1.0, aggressive: 2.0, speculative: 2.5 },
        liquidity: { anytime: 2.5, occasional: 1.0, lock_6mo: 0.3, lock_years: 0.1 },
      },
    },
    {
      id: "daily",
      text: "Once a day or so",
      signal: {
        horizon: { "<1y": 1.5, "1-3y": 2.0, "3-5y": 1.0, "5-10y": 0.5, ">10y": 0.3 },
        risk_tolerance: { conservative: 1.0, moderate: 2.0, aggressive: 1.5 },
      },
    },
    {
      id: "weekly",
      text: "Maybe once a week",
      signal: {
        horizon: { "<1y": 0.5, "1-3y": 1.0, "3-5y": 2.5, "5-10y": 2.0, ">10y": 1.0 },
        risk_tolerance: { conservative: 2.0, moderate: 2.0, aggressive: 0.8 },
        liquidity: { anytime: 0.5, occasional: 2.0, lock_6mo: 1.5, lock_years: 0.8 },
      },
    },
    {
      id: "rarely",
      text: "Almost never — I prefer set-and-forget",
      signal: {
        horizon: { "<1y": 0.1, "1-3y": 0.5, "3-5y": 1.5, "5-10y": 2.5, ">10y": 3.0 },
        risk_tolerance: { very_conservative: 2.0, conservative: 2.0, moderate: 1.0, aggressive: 0.3, speculative: 0.1 },
        liquidity: { anytime: 0.3, occasional: 1.0, lock_6mo: 2.0, lock_years: 2.5 },
      },
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// LIQUIDITY axis (2 questions)
// ─────────────────────────────────────────────────────────────────────────────

const Q_LIQUIDITY_USE: Question = {
  id: "Q_LIQUIDITY_USE",
  text: "How often do you expect to move this money in and out?",
  axes: { primary: ["liquidity"] },
  options: [
    {
      id: "often",
      text: "Often — I like having access",
      signal: {
        liquidity: { anytime: 4.0, occasional: 0.8, lock_6mo: 0.1, lock_years: 0.05 },
      },
    },
    {
      id: "sometimes",
      text: "Sometimes, for the bigger stuff",
      signal: {
        liquidity: { anytime: 1.5, occasional: 3.5, lock_6mo: 1.0, lock_years: 0.2 },
      },
    },
    {
      id: "rarely",
      text: "Rarely — I'd leave it alone",
      signal: {
        liquidity: { anytime: 0.3, occasional: 1.0, lock_6mo: 3.0, lock_years: 1.5 },
      },
    },
    {
      id: "never",
      text: "Never — once it's in, it's in",
      signal: {
        liquidity: { anytime: 0.05, occasional: 0.3, lock_6mo: 1.5, lock_years: 3.5 },
      },
    },
  ],
};

const Q_LIQUIDITY_LOCK: Question = {
  id: "Q_LIQUIDITY_LOCK",
  text: "Some products pay a bit more if you commit to leaving the money for a while. How does that sit with you?",
  axes: { primary: ["liquidity"], secondary: ["risk_tolerance"] },
  options: [
    {
      id: "no_locks",
      text: "No thanks — I want full access",
      signal: {
        liquidity: { anytime: 3.5, occasional: 1.0, lock_6mo: 0.2, lock_years: 0.05 },
      },
    },
    {
      id: "few_months",
      text: "A few months is fine",
      signal: {
        liquidity: { anytime: 0.8, occasional: 2.5, lock_6mo: 1.5, lock_years: 0.3 },
      },
    },
    {
      id: "year",
      text: "I could lock it for a year",
      signal: {
        liquidity: { anytime: 0.3, occasional: 1.0, lock_6mo: 3.0, lock_years: 1.5 },
        risk_tolerance: { conservative: 1.5, moderate: 1.5 },
      },
    },
    {
      id: "multi_year",
      text: "Lock it for years if it pays better",
      signal: {
        liquidity: { anytime: 0.1, occasional: 0.3, lock_6mo: 1.0, lock_years: 3.5 },
        risk_tolerance: { conservative: 1.5, moderate: 1.5, aggressive: 1.0 },
      },
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// GOAL / RISK scenario (behavioural — not about capital amount)
// ─────────────────────────────────────────────────────────────────────────────

const Q_CAPITAL_MINDSET: Question = {
  id: "Q_CAPITAL_MINDSET",
  text: "Imagine you wake up with an unexpected $500 bonus. What's your first thought?",
  axes: { primary: ["goal_type", "risk_tolerance"] },
  options: [
    {
      id: "put_safe",
      text: "Put it somewhere safe and forget about it",
      signal: {
        goal_type: { preservation: 3.0, income: 1.5, growth: 0.2, specific_target: 0.5, exploration: 0.1 },
        risk_tolerance: { very_conservative: 3.5, conservative: 2.0, moderate: 0.3, aggressive: 0.05, speculative: 0.02 },
      },
    },
    {
      id: "pay_off_save",
      text: "Pay something off, save the rest",
      signal: {
        goal_type: { specific_target: 2.5, preservation: 1.5, income: 1.0, growth: 0.5, exploration: 0.2 },
        risk_tolerance: { very_conservative: 1.0, conservative: 3.0, moderate: 1.5, aggressive: 0.3, speculative: 0.1 },
      },
    },
    {
      id: "invest_straight",
      text: "Invest it straight away",
      signal: {
        goal_type: { growth: 2.5, income: 1.5, exploration: 1.0, specific_target: 0.5, preservation: 0.2 },
        risk_tolerance: { very_conservative: 0.1, conservative: 0.5, moderate: 2.5, aggressive: 2.5, speculative: 1.0 },
      },
    },
    {
      id: "make_it_grow",
      text: "Figure out how to make it grow faster",
      signal: {
        goal_type: { growth: 2.0, exploration: 3.0, income: 0.5, specific_target: 0.5, preservation: 0.05 },
        risk_tolerance: { very_conservative: 0.05, conservative: 0.2, moderate: 1.0, aggressive: 3.0, speculative: 3.0 },
      },
    },
  ],
};

// Q_CAPITAL_RHYTHM removed — deposit amount/rhythm is handled on /strategy.

// ─────────────────────────────────────────────────────────────────────────────
// EXPERIENCE / CRYPTO-FLUENCY axis (2 questions)
// These probe fluency *without* naming any specific Circle product, so we
// can adapt the strategy vocabulary later (see VOCAB_RULES in mandate.ts).
// ─────────────────────────────────────────────────────────────────────────────

const Q_EXPERIENCE_BACKGROUND: Question = {
  id: "Q_EXPERIENCE_BACKGROUND",
  text: "How would you describe your investing experience so far?",
  axes: { primary: ["crypto_fluency"], secondary: ["risk_tolerance"] },
  options: [
    {
      id: "savings_only",
      text: "Mostly a savings account — that's about it",
      signal: {
        crypto_fluency: { none: 3.5, heard_of: 1.0, user: 0.1, native: 0.05 },
        risk_tolerance: { very_conservative: 2.5, conservative: 2.0, moderate: 0.5, aggressive: 0.1, speculative: 0.05 },
      },
    },
    {
      id: "stocks_funds",
      text: "I've owned some stocks or funds",
      signal: {
        crypto_fluency: { none: 0.5, heard_of: 2.5, user: 1.5, native: 0.5 },
        risk_tolerance: { conservative: 1.5, moderate: 2.0, aggressive: 1.0 },
      },
    },
    {
      id: "active_investor",
      text: "I invest actively — I follow the markets",
      signal: {
        crypto_fluency: { none: 0.05, heard_of: 0.8, user: 3.0, native: 1.5 },
        risk_tolerance: { conservative: 0.5, moderate: 1.5, aggressive: 2.5, speculative: 1.5 },
      },
    },
    {
      id: "pro",
      text: "I work in finance or do this professionally",
      signal: {
        crypto_fluency: { none: 0.02, heard_of: 0.2, user: 2.0, native: 3.5 },
      },
    },
  ],
};

const Q_EXPERIENCE_DIGITAL: Question = {
  id: "Q_EXPERIENCE_DIGITAL",
  text: "How comfortable are you with online money apps and digital accounts?",
  axes: { primary: ["crypto_fluency"] },
  options: [
    {
      id: "paper_branch",
      text: "I prefer the bank branch or paper statements",
      signal: {
        crypto_fluency: { none: 4.0, heard_of: 0.5, user: 0.05, native: 0.02 },
      },
    },
    {
      id: "online_banking",
      text: "Online banking is fine for me",
      signal: {
        crypto_fluency: { none: 0.5, heard_of: 3.5, user: 0.8, native: 0.2 },
      },
    },
    {
      id: "many_apps",
      text: "I use lots of money apps already",
      signal: {
        crypto_fluency: { none: 0.05, heard_of: 0.5, user: 3.5, native: 1.0 },
      },
    },
    {
      id: "live_online",
      text: "Everything I do is online — including investing",
      signal: {
        crypto_fluency: { none: 0.02, heard_of: 0.2, user: 1.5, native: 3.5 },
      },
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// CURRENCY PREFERENCE axis (1 question)
// Determines whether the user wants a Euro-denominated reserve alongside
// their USD positions. Signals directly onto currency_preference.
// ─────────────────────────────────────────────────────────────────────────────

const Q_CURRENCY_PREFERENCE: Question = {
  id: "Q_CURRENCY_PREFERENCE",
  text: "When you think about your money day-to-day, which currency feels most natural to you?",
  axes: { primary: ["currency_preference"] },
  options: [
    {
      id: "usd",
      text: "US Dollars — that's what I use",
      signal: {
        currency_preference: { usd: 10.0, eur: 0.1 },
      },
    },
    {
      id: "eur",
      text: "Euros — I live or work in Europe",
      signal: {
        currency_preference: { usd: 0.1, eur: 10.0 },
      },
    },
    {
      id: "both",
      text: "Both — I deal in multiple currencies",
      signal: {
        currency_preference: { usd: 1.5, eur: 2.5 },
      },
    },
    {
      id: "neither",
      text: "Neither — I use a different currency",
      signal: {
        currency_preference: { usd: 3.0, eur: 1.0 },
      },
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Public pool
// ─────────────────────────────────────────────────────────────────────────────

export const QUESTION_POOL: Question[] = [
  // GOAL
  Q_GOAL_PRIMARY,
  Q_GOAL_MOTIVATION,
  Q_GOAL_RETURN,
  Q_GOAL_PRIORITY,
  // RISK
  Q_RISK_SCENARIO,
  Q_RISK_VOLATILITY,
  Q_RISK_HISTORY,
  // HORIZON
  Q_HORIZON_ACCESS,
  Q_HORIZON_LIFE,
  Q_HORIZON_PATIENCE,
  // LIQUIDITY
  Q_LIQUIDITY_USE,
  Q_LIQUIDITY_LOCK,
  // GOAL / RISK scenario ($500 bonus — not a capital-amount question)
  Q_CAPITAL_MINDSET,
  // EXPERIENCE
  Q_EXPERIENCE_BACKGROUND,
  Q_EXPERIENCE_DIGITAL,
  // CURRENCY
  Q_CURRENCY_PREFERENCE,
];

/**
 * All question ids are candidates at every step. The LLM (or the entropy
 * fallback) picks the most informative unanswered one each turn.
 */
export const LLM_QUESTION_IDS = QUESTION_POOL.map((q) => q.id) as readonly string[];

export function findQuestion(id: string): Question | undefined {
  return QUESTION_POOL.find((q) => q.id === id);
}
