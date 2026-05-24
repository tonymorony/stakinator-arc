// Mandate axes — the 7-dimensional space the Inquisitor resolves

export type RiskTolerance = "very_conservative" | "conservative" | "moderate" | "aggressive" | "speculative";
export type Horizon = "<1y" | "1-3y" | "3-5y" | "5-10y" | ">10y";
export type CapitalTier = "<$1k" | "$1k-10k" | "$10k-100k" | ">$100k";
export type GoalType = "preservation" | "income" | "growth" | "specific_target" | "exploration";
export type Liquidity = "anytime" | "occasional" | "lock_6mo" | "lock_years";
export type CryptoFluency = "none" | "heard_of" | "user" | "native";
export type CurrencyPreference = "usd" | "eur";

export interface MandateAxes {
  risk_tolerance: RiskTolerance;
  horizon: Horizon;
  capital_tier: CapitalTier;
  goal_type: GoalType;
  liquidity: Liquidity;
  crypto_fluency: CryptoFluency;
  currency_preference: CurrencyPreference;
}

export interface AxisDistribution {
  risk_tolerance: Record<RiskTolerance, number>;
  horizon: Record<Horizon, number>;
  capital_tier: Record<CapitalTier, number>;
  goal_type: Record<GoalType, number>;
  liquidity: Record<Liquidity, number>;
  crypto_fluency: Record<CryptoFluency, number>;
  currency_preference: Record<CurrencyPreference, number>;
}

export type AxisSignal = Partial<{
  risk_tolerance: Partial<Record<RiskTolerance, number>>;
  horizon: Partial<Record<Horizon, number>>;
  capital_tier: Partial<Record<CapitalTier, number>>;
  goal_type: Partial<Record<GoalType, number>>;
  liquidity: Partial<Record<Liquidity, number>>;
  crypto_fluency: Partial<Record<CryptoFluency, number>>;
  currency_preference: Partial<Record<CurrencyPreference, number>>;
}>;

export type AxisName = keyof MandateAxes;

export interface QuestionAxes {
  primary: AxisName[];
  secondary?: AxisName[];
}

export interface AnswerOption {
  id: string;
  text: string;
  signal: AxisSignal;
  /** Optional ghost flavour for the 'I'm not sure' style option (rendered subtler). */
  ghost?: boolean;
}

/**
 * Inline educational insert. Triggered on the client when the user picks
 * `triggerOptionId`. The insert pauses the dialogue; the chosen answer is
 * only submitted to the server once the user clicks `continueLabel`.
 */
export interface EducationalInsert {
  triggerOptionId: string;
  title: string;
  body: string;
  learnMoreUrl?: string;
  learnMoreLabel?: string;
  continueLabel: string;
}

export interface Question {
  id: string;
  text: string;
  subtext?: string;
  options: AnswerOption[];
  axes: QuestionAxes;
  educationalInsert?: EducationalInsert;
  /** Optional gate; only ask this question when the prerequisite is met. */
  prerequisite?: (dist: AxisDistribution) => boolean;
}

export interface Mandate extends MandateAxes {
  confidence: Record<keyof MandateAxes, number>;
  summary_human: string;
  questions_asked: number;
}

/** Plain-English bucket labels surfaced in the probability-bars panel. */
export const AXIS_LABELS: {
  [K in keyof MandateAxes]: Record<MandateAxes[K], string>;
} = {
  risk_tolerance: {
    very_conservative: "Very safe",
    conservative: "Cautious",
    moderate: "Balanced",
    aggressive: "Growth",
    speculative: "Bold",
  },
  goal_type: {
    preservation: "Protect it",
    income: "Earn income",
    growth: "Grow it",
    specific_target: "Hit a goal",
    exploration: "Explore",
  },
  horizon: {
    "<1y": "Under 1 year",
    "1-3y": "1–3 years",
    "3-5y": "3–5 years",
    "5-10y": "5–10 years",
    ">10y": "10+ years",
  },
  capital_tier: {
    "<$1k": "Under $1k",
    "$1k-10k": "$1k–$10k",
    "$10k-100k": "$10k–$100k",
    ">$100k": "$100k+",
  },
  liquidity: {
    anytime: "Always accessible",
    occasional: "Mostly accessible",
    lock_6mo: "Can lock 6 months",
    lock_years: "Can lock years",
  },
  crypto_fluency: {
    none: "New to this",
    heard_of: "Familiar",
    user: "Experienced",
    native: "Expert",
  },
  currency_preference: {
    usd: "US Dollar",
    eur: "Euro",
  },
};

/** Human-friendly section heading for each axis. */
export const AXIS_TITLES: Record<keyof MandateAxes, string> = {
  goal_type: "What you want",
  risk_tolerance: "Risk comfort",
  horizon: "Time horizon",
  liquidity: "Access to your money",
  capital_tier: "Capital",
  crypto_fluency: "Experience level",
  currency_preference: "Home currency",
};
