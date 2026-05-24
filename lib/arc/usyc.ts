/**
 * USYC support — read APY + execute deposits.
 *
 * Production path uses Circle Modular Wallets as the signer. For the demo
 * build we substitute a viem WalletClient backed by `ARC_TESTNET_PRIVATE_KEY`
 * so deposits can be submitted from a single test wallet that the developer
 * has funded via https://faucet.circle.com. The wallet's signer is server-
 * side; no MetaMask, no signing prompt.
 *
 * When no private key is configured at all, every deposit returns a
 * `source: "simulated"` result so the UI flow stays demoable.
 */
import {
  createWalletClient,
  formatUnits,
  http,
  parseUnits,
  type PublicClient,
  type WalletClient,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "./viem-chain";
import { getArcPublicClient } from "./client";
import { CONTRACTS } from "./contracts";
import { ARC_TESTNET, USYC_ERC20_DECIMALS, getExplorerUrl } from "./config";
import { getUserSigner } from "./wallet";

const FALLBACK_APY = 5.2;

// ─────────────────────────────────────────────────────────────────────────────
// APY read
// ─────────────────────────────────────────────────────────────────────────────

const RATE_PROBE_ABI = [
  {
    name: "currentAPY",
    type: "function",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    name: "getAPY",
    type: "function",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    name: "yield",
    type: "function",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
] as const;

export async function getCurrentAPY(): Promise<number> {
  try {
    const client = getArcPublicClient();
    for (const fn of RATE_PROBE_ABI) {
      try {
        const result = (await client.readContract({
          address: CONTRACTS.USYC,
          abi: [fn],
          functionName: fn.name,
        })) as bigint;
        const value = bigintToApy(result);
        if (Number.isFinite(value) && value > 0 && value < 100) {
          return value;
        }
      } catch {
        // try the next probe
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[usyc] getCurrentAPY fell back to default:", asReason(err));
  }
  return FALLBACK_APY;
}

function bigintToApy(raw: bigint): number {
  if (raw === 0n) return Number.NaN;
  const asEth = Number(formatUnits(raw, 18));
  if (asEth > 0 && asEth < 100) return Number(asEth.toFixed(2));
  const as6 = Number(formatUnits(raw, USYC_ERC20_DECIMALS));
  if (as6 > 0 && as6 < 100) return Number(as6.toFixed(2));
  const asBp = Number(raw) / 100;
  if (asBp > 0 && asBp < 100) return Number(asBp.toFixed(2));
  return Number.NaN;
}

// ─────────────────────────────────────────────────────────────────────────────
// Deposit
// ─────────────────────────────────────────────────────────────────────────────

const ERC20_ABI = [
  {
    name: "approve",
    type: "function",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    name: "balanceOf",
    type: "function",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    name: "allowance",
    type: "function",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
] as const;

const TELLER_ABI = [
  {
    name: "deposit",
    type: "function",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [{ name: "shares", type: "uint256" }],
    stateMutability: "nonpayable",
  },
] as const;

export interface DepositParams {
  /**
   * The amount the user expects to deposit (human-readable USDC).
   * If the funded test wallet has less than this, we cap to the available
   * balance and report `cappedAt`.
   */
  amountUsdc: number;
}

export type DepositResult =
  | {
      source: "arc";
      amountUsdc: number;
      cappedAt?: number;
      approveTxHash: Hex;
      depositTxHash: Hex;
      explorerUrl: string;
      walletAddress: `0x${string}`;
    }
  | {
      source: "simulated";
      amountUsdc: number;
      reason: string;
      /** Present when the approve tx landed on-chain but deposit() reverted. */
      approveTxHash?: Hex;
      approveExplorerUrl?: string;
    };

/**
 * Executes the USDC → USYC deposit via the Teller. Honors the contract spec:
 *   1) USDC.approve(USYC_TELLER, amount)
 *   2) USYC_TELLER.deposit(amount)
 *
 * Returns either:
 *   - `source: "arc"` with the real on-chain hashes + explorer URL, OR
 *   - `source: "simulated"` if no signer is configured (UI keeps working).
 */
export async function depositToUSYC(params: DepositParams, userEmail?: string): Promise<DepositResult> {
  if (!Number.isFinite(params.amountUsdc) || params.amountUsdc <= 0) {
    return {
      source: "simulated",
      amountUsdc: 0,
      reason: "Allocation amount is zero or invalid.",
    };
  }

  const signer = userEmail ? getUserSigner(userEmail) : getServerSigner();
  if (!signer) {
    return {
      source: "simulated",
      amountUsdc: params.amountUsdc,
      reason: "ARC_TESTNET_PRIVATE_KEY is not set; running the demo without on-chain submission.",
    };
  }

  const publicClient = getArcPublicClient();
  const walletAddress = signer.account.address;

  // Cap to the wallet's on-chain USDC balance.
  let amount = roundDownTo2dp(params.amountUsdc);
  let cappedAt: number | undefined;
  try {
    const balanceRaw = (await publicClient.readContract({
      address: CONTRACTS.USDC,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [walletAddress],
    })) as bigint;
    const balance = Number(formatUnits(balanceRaw, USYC_ERC20_DECIMALS));
    if (balance <= 0) {
      return {
        source: "simulated",
        amountUsdc: params.amountUsdc,
        reason:
          "Test wallet has no available balance — top it up at https://faucet.circle.com.",
      };
    }
    if (balance < amount) {
      cappedAt = roundDownTo2dp(balance);
      amount = cappedAt;
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[usyc] balance read failed, depositing requested amount:", asReason(err));
  }

  const amountUnits = parseUnits(amount.toFixed(USYC_ERC20_DECIMALS), USYC_ERC20_DECIMALS);

  // ── Step 1: approve ──────────────────────────────────────────────────────
  let approveTxHash: Hex;
  try {
    approveTxHash = await signer.walletClient.writeContract({
      account: signer.account,
      chain: arcTestnet,
      address: CONTRACTS.USDC,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [CONTRACTS.USYC_TELLER, amountUnits],
    });
    await publicClient.waitForTransactionReceipt({ hash: approveTxHash });
  } catch (approveErr) {
    // eslint-disable-next-line no-console
    console.error("[usyc] approve failed:", asReason(approveErr));
    return {
      source: "simulated",
      amountUsdc: amount,
      reason: friendlyDepositError(approveErr),
    };
  }

  // ── Step 2: deposit ──────────────────────────────────────────────────────
  try {
    const depositTxHash = await signer.walletClient.writeContract({
      account: signer.account,
      chain: arcTestnet,
      address: CONTRACTS.USYC_TELLER,
      abi: TELLER_ABI,
      functionName: "deposit",
      args: [amountUnits],
    });
    await publicClient.waitForTransactionReceipt({ hash: depositTxHash });

    return {
      source: "arc",
      amountUsdc: amount,
      ...(cappedAt !== undefined ? { cappedAt } : {}),
      approveTxHash,
      depositTxHash,
      explorerUrl: getExplorerUrl(depositTxHash),
      walletAddress,
    };
  } catch (depositErr) {
    // Approve landed on-chain; only the deposit reverted (entitlements check).
    // eslint-disable-next-line no-console
    console.error("[usyc] deposit reverted (wallet not whitelisted):", asReason(depositErr));
    return {
      source: "simulated",
      amountUsdc: amount,
      reason: friendlyDepositError(depositErr),
      approveTxHash,
      approveExplorerUrl: getExplorerUrl(approveTxHash),
    };
  }
}

interface ServerSigner {
  walletClient: WalletClient;
  account: ReturnType<typeof privateKeyToAccount>;
}

declare global {
  // eslint-disable-next-line no-var
  var __stakArcSigner: ServerSigner | undefined;
}

function getServerSigner(): ServerSigner | null {
  if (globalThis.__stakArcSigner) return globalThis.__stakArcSigner;
  const raw = process.env.ARC_TESTNET_PRIVATE_KEY;
  if (!raw || raw.length === 0) return null;

  try {
    const hex = (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;
    const account = privateKeyToAccount(hex);
    const walletClient = createWalletClient({
      account,
      chain: arcTestnet,
      transport: http(),
    });
    const signer: ServerSigner = { walletClient, account };
    globalThis.__stakArcSigner = signer;
    return signer;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      "[usyc] ARC_TESTNET_PRIVATE_KEY is set but invalid; falling back to simulated execution:",
      asReason(err),
    );
    return null;
  }
}

function roundDownTo2dp(value: number): number {
  return Math.floor(value * 100) / 100;
}

function friendlyDepositError(err: unknown): string {
  const msg = asReason(err);
  if (/entitlement|entitled|whitelist/i.test(msg)) {
    return "Your test wallet isn't whitelisted on the Entitlements contract yet — request access from Circle for this address.";
  }
  if (/insufficient/i.test(msg)) {
    return "The test wallet ran out of available balance during the call — top it up at https://faucet.circle.com.";
  }
  if (/timeout|exceeded the timeout/i.test(msg)) {
    return "Arc testnet is slow right now — the deposit hasn't confirmed yet, please retry.";
  }
  return `On-chain deposit failed (${msg.slice(0, 120)}).`;
}

/**
 * Used by /api/operator/execute to surface the configured wallet address in
 * the demo header. Returns null if no signer is configured.
 */
export function getServerWalletAddress(): `0x${string}` | null {
  return getServerSigner()?.account.address ?? null;
}

/** Pure helper exposed to tests + callers needing the publicClient handle. */
export { type PublicClient };

function asReason(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
