/**
 * GET /api/wallet/balance
 *
 * Returns live on-chain token balances (USDC, EURC, USYC) for the
 * authenticated user's derived wallet. Used by WalletFundingStep to poll
 * for testnet funds, and by the dashboard for real-time balance refresh.
 */
import { type NextRequest } from "next/server";
import { getAuthSession } from "@/lib/auth/session";
import { findUserById } from "@/lib/auth/users";
import { getArcPublicClient } from "@/lib/arc/client";
import { CONTRACTS } from "@/lib/arc/contracts";
import {
  USDC_ERC20_DECIMALS,
  EURC_ERC20_DECIMALS,
  USYC_ERC20_DECIMALS,
} from "@/lib/arc/config";
import { formatUnits } from "viem";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ERC20_BALANCE_ABI = [
  {
    name: "balanceOf",
    type: "function",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
] as const;

async function readBalance(
  address: `0x${string}`,
  tokenAddress: `0x${string}`,
  decimals: number,
): Promise<number> {
  const client = getArcPublicClient();
  const raw = await client.readContract({
    address: tokenAddress,
    abi: ERC20_BALANCE_ABI,
    functionName: "balanceOf",
    args: [address],
  });
  return Number(formatUnits(raw as bigint, decimals));
}

export async function GET(_req: NextRequest): Promise<Response> {
  const authed = await getAuthSession();
  if (!authed) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await findUserById(authed.sub);
  if (!user?.walletAddress) {
    return Response.json({ error: "No wallet provisioned" }, { status: 404 });
  }

  const addr = user.walletAddress as `0x${string}`;

  try {
    const [usdc, eurc, usyc] = await Promise.all([
      readBalance(addr, CONTRACTS.USDC, USDC_ERC20_DECIMALS),
      readBalance(addr, CONTRACTS.EURC, EURC_ERC20_DECIMALS),
      readBalance(addr, CONTRACTS.USYC, USYC_ERC20_DECIMALS),
    ]);

    return Response.json({
      walletAddress: user.walletAddress,
      usdc,
      eurc,
      usyc,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
