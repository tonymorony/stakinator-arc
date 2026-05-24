import { createPublicClient, http, type PublicClient } from "viem";
import { arcTestnet } from "./viem-chain";
import { ARC_TESTNET } from "./config";

declare global {
  // eslint-disable-next-line no-var
  var __arcPublicClient: PublicClient | undefined;
}

/**
 * Singleton viem public client for read-only Arc Testnet calls.
 * Cached on the global to survive Next.js dev hot-reloads.
 */
export function getArcPublicClient(): PublicClient {
  if (globalThis.__arcPublicClient) return globalThis.__arcPublicClient;
  const rpcUrl = process.env.ARC_RPC_URL ?? ARC_TESTNET.rpcUrl;
  const client = createPublicClient({
    chain: arcTestnet,
    transport: http(rpcUrl),
  }) as PublicClient;
  globalThis.__arcPublicClient = client;
  return client;
}
