/**
 * User wallet provisioning.
 *
 * NOTE: This is a simplified hackathon implementation. Each user gets a
 * deterministic wallet derived from NEXTAUTH_SECRET + email. The key is never
 * stored — it is re-derived on every server-side signing request.
 *
 * In production this will be replaced with Circle Programmable Wallets:
 * each user gets a Circle-managed MPC wallet with proper KYC/entitlements,
 * no seed phrase, no private key management on our side.
 */
import { keccak256, toHex, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "./viem-chain";
import { ARC_TESTNET } from "./config";

export interface WalletResult {
  walletAddress: `0x${string}`;
  source: "deterministic";
}

/**
 * Derives a deterministic private key for a user from the app secret + email.
 * Re-derivable on demand — never persisted.
 */
export function deriveUserPrivateKey(email: string): `0x${string}` {
  const secret = process.env.NEXTAUTH_SECRET ?? "dev-secret-set-nextauth-secret";
  const input = `stakinator:wallet:v1:${secret}:${email.toLowerCase()}`;
  return keccak256(toHex(input));
}

/**
 * Returns the wallet address for a given email. Called at registration to
 * store the address in the User record.
 */
export async function provisionWallet(email: string): Promise<WalletResult> {
  const account = privateKeyToAccount(deriveUserPrivateKey(email));
  return { walletAddress: account.address, source: "deterministic" };
}

export interface UserSigner {
  walletClient: ReturnType<typeof createWalletClient>;
  account: ReturnType<typeof privateKeyToAccount>;
}

/**
 * Returns a ready-to-use viem WalletClient for the given user's wallet.
 * Used server-side only for signing transactions.
 */
export function getUserSigner(email: string): UserSigner {
  const pk = deriveUserPrivateKey(email);
  const account = privateKeyToAccount(pk);
  const rpcUrl = process.env.ARC_RPC_URL ?? ARC_TESTNET.rpcUrl;
  const walletClient = createWalletClient({
    account,
    chain: arcTestnet,
    transport: http(rpcUrl),
  });
  return { walletClient, account };
}
