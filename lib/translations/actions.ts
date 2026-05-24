/**
 * The accessibility layer.
 *
 * Every on-chain action gets translated into a single plain-English sentence
 * before it can be shown to the user. The translation is the *only* place in
 * the codebase that may mention asset semantics (the "safe Treasury fund",
 * "ready cash", etc.) — downstream consumers must use the output as-is.
 *
 * Banned forever in any user-visible string (whether passed through here or
 * not): wallet, blockchain, gas, slippage, APY, yield, staking, DeFi,
 * protocol, token, contract, hash, USDC, USYC, EURC, Polygon, txHash.
 */
import { formatUsd } from "@/lib/format";

export type TxEventType =
  | "USYC_DEPOSIT"
  | "USDC_HOLD"
  | "SWAP"
  | "REBALANCE";

export type RawTxEvent =
  | {
      type: "USYC_DEPOSIT";
      amountUsdc: number;
      apy: number;
    }
  | {
      type: "USDC_HOLD";
      amountUsdc: number;
    }
  | {
      type: "SWAP";
      fromAmountUsdc: number;
      toCurrencyLabel?: string;
    }
  | {
      type: "REBALANCE";
      driftPct?: number;
      reason?: string;
    };

export function translateTransaction(event: RawTxEvent): string {
  switch (event.type) {
    case "USYC_DEPOSIT": {
      const amount = formatUsd(event.amountUsdc);
      const apy = formatApy(event.apy);
      return `Moved ${amount} into a safe US Treasury fund — earns ${apy} a year, withdraw anytime.`;
    }
    case "USDC_HOLD": {
      const amount = formatUsd(event.amountUsdc);
      return `Kept ${amount} ready to access anytime.`;
    }
    case "SWAP": {
      const amount = formatUsd(event.fromAmountUsdc);
      const target = event.toCurrencyLabel ?? "your preferred currency";
      return `Exchanged ${amount} to ${target}.`;
    }
    case "REBALANCE": {
      if (event.reason) {
        return `Adjusted your mix slightly — ${event.reason}`;
      }
      return "Adjusted your mix slightly to stay on track.";
    }
  }
}

function formatApy(apy: number): string {
  const rounded = Number(apy.toFixed(1));
  return `${rounded.toString()}%`;
}

/**
 * Defensive: any string about to render to the user can be checked with this.
 * Returns the list of banned words found (empty = clean).
 */
const BANNED_WORDS = [
  "wallet",
  "blockchain",
  "gas",
  "slippage",
  "apy",
  "yield",
  "staking",
  "defi",
  "protocol",
  "token",
  "contract",
  "seed phrase",
  "private key",
  "hash",
  "usdc",
  "usyc",
  "eurc",
  "polygon",
  "txhash",
];

export function findBannedWords(text: string): string[] {
  const lower = text.toLowerCase();
  return BANNED_WORDS.filter((w) =>
    new RegExp(`(^|[^a-z])${w}([^a-z]|$)`).test(lower),
  );
}
