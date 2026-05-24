/**
 * Arc Testnet — single source of truth for network constants.
 *
 * USDC has DUAL decimal representation on Arc:
 *   - As native gas token: 18 decimals (handled internally by Arc)
 *   - As ERC-20 token balance/transfer: 6 decimals
 * Always use parseUnits(amount, 6) for ERC-20 token operations.
 */
export const ARC_TESTNET = {
  chainId: 5042002,
  chainIdHex: "0x4CEF52",
  name: "Arc Testnet",
  rpcUrl: "https://rpc.testnet.arc.network",
  wsUrl: "wss://rpc.testnet.arc.network",
  explorerUrl: "https://testnet.arcscan.app",
  faucetUrl: "https://faucet.circle.com",
  nativeCurrency: {
    name: "USDC",
    symbol: "USDC",
    decimals: 18,
  },
} as const;

export const ARC_CCTP_DOMAIN = 26;

export const USDC_ERC20_DECIMALS = 6;
export const EURC_ERC20_DECIMALS = 6;
export const USYC_ERC20_DECIMALS = 6;

export function getExplorerUrl(txHash: string): string {
  return `${ARC_TESTNET.explorerUrl}/tx/${txHash}`;
}

export function getAddressExplorerUrl(address: string): string {
  return `${ARC_TESTNET.explorerUrl}/address/${address}`;
}
