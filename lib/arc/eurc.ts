/**
 * EURC support — swap USDC → EURC via Circle App Kit.
 *
 * Uses the same server-side private key as usyc.ts. When no key or kit key
 * is configured, returns source: "simulated" so the UI flow stays demoable.
 */
import { AppKit } from "@circle-fin/app-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { getExplorerUrl } from "./config";
import { deriveUserPrivateKey } from "./wallet";

export interface SwapToEurcParams {
  amountUsdc: number;
}

export type SwapToEurcResult =
  | {
      source: "arc";
      amountUsdc: number;
      txHash: string;
      explorerUrl: string;
      walletAddress: string;
    }
  | {
      source: "simulated";
      amountUsdc: number;
      reason: string;
    };

export async function swapUsdcToEurc(
  params: SwapToEurcParams,
  userEmail?: string,
): Promise<SwapToEurcResult> {
  if (!Number.isFinite(params.amountUsdc) || params.amountUsdc <= 0) {
    return { source: "simulated", amountUsdc: 0, reason: "Amount is zero or invalid." };
  }

  const kitKey = process.env.CIRCLE_KIT_KEY;
  if (!kitKey) {
    return {
      source: "simulated",
      amountUsdc: params.amountUsdc,
      reason: "CIRCLE_KIT_KEY is not set — running demo without on-chain swap.",
    };
  }

  const rawKey: `0x${string}` = userEmail
    ? deriveUserPrivateKey(userEmail)
    : (() => {
        const k = process.env.ARC_TESTNET_PRIVATE_KEY;
        if (!k) return null as unknown as `0x${string}`;
        return (k.startsWith("0x") ? k : `0x${k}`) as `0x${string}`;
      })();

  if (!rawKey) {
    return {
      source: "simulated",
      amountUsdc: params.amountUsdc,
      reason: "No signing key available — running demo without on-chain swap.",
    };
  }

  try {

    const adapter = createViemAdapterFromPrivateKey({ privateKey: rawKey });

    const kit = new AppKit();

    const result = await kit.swap({
      from: { adapter, chain: "Arc_Testnet" },
      tokenIn: "USDC",
      tokenOut: "EURC",
      amountIn: params.amountUsdc.toFixed(2),
      config: { kitKey },
    });

    return {
      source: "arc",
      amountUsdc: params.amountUsdc,
      txHash: result.txHash,
      explorerUrl: result.explorerUrl ?? getExplorerUrl(result.txHash),
      walletAddress: result.fromAddress,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error("[eurc] swap failed:", msg);
    return {
      source: "simulated",
      amountUsdc: params.amountUsdc,
      reason: `Swap failed (${msg.slice(0, 120)}) — showing simulated result.`,
    };
  }
}
