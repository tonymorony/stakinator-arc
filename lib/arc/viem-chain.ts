import { defineChain } from "viem";
import { ARC_TESTNET } from "./config";

/**
 * Viem chain definition for Arc Testnet.
 * USDC is the native gas token (18-decimal accounting); ERC-20 transfers use 6 decimals.
 */
export const arcTestnet = defineChain({
  id: ARC_TESTNET.chainId,
  name: ARC_TESTNET.name,
  nativeCurrency: ARC_TESTNET.nativeCurrency,
  rpcUrls: {
    default: { http: [ARC_TESTNET.rpcUrl] },
    public: { http: [ARC_TESTNET.rpcUrl] },
  },
  blockExplorers: {
    default: { name: "ArcScan", url: ARC_TESTNET.explorerUrl },
  },
  testnet: true,
});
