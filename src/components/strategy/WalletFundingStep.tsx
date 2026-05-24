"use client";

import { useCallback, useEffect, useState } from "react";
import { WizardIcon } from "@/components/WizardIcon";

interface WalletFundingStepProps {
  onFunded: () => void;
}

const FAUCET_URL = "https://faucet.circle.com";
const POLL_INTERVAL_MS = 3000;

export function WalletFundingStep({ onFunded }: WalletFundingStepProps) {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [usdc, setUsdc] = useState<number>(0);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = useCallback(async () => {
    try {
      const res = await fetch("/api/wallet/balance", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { walletAddress: string; usdc: number };
      setWalletAddress(data.walletAddress);
      setUsdc(data.usdc);
    } catch {
      setError("Couldn't reach the network — check your connection.");
    }
  }, []);

  useEffect(() => {
    void fetchBalance();
    const interval = setInterval(() => void fetchBalance(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchBalance]);

  const copyAddress = useCallback(async () => {
    if (!walletAddress) return;
    await navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [walletAddress]);

  const openFaucet = useCallback(() => {
    const url = walletAddress
      ? `${FAUCET_URL}/?address=${walletAddress}`
      : FAUCET_URL;
    window.open(url, "_blank", "noopener");
  }, [walletAddress]);

  const hasFunds = usdc > 0;

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <WizardIcon size={48} variant="pulse" className="mb-2" />

      <div className="w-full rounded-2xl border border-border bg-bg-base p-6 shadow-card">
        <h2 className="mb-1 text-lg font-semibold text-text-primary">
          Your wallet is ready
        </h2>
        <p className="mb-5 text-sm text-text-muted">
          To run your strategy on testnet, add some test funds first.
        </p>

        {/* Wallet address */}
        <div className="mb-4">
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-text-muted">
            Your wallet address
          </p>
          {walletAddress ? (
            <div className="flex items-center gap-2 rounded-xl border border-border bg-bg-subtle px-3 py-2.5">
              <span className="num flex-1 truncate text-sm text-text-primary">
                {walletAddress}
              </span>
              <button
                type="button"
                onClick={copyAddress}
                className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-accent-earn transition-colors hover:bg-accent-earn/10"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          ) : (
            <div className="h-10 animate-pulse rounded-xl bg-bg-subtle" />
          )}
        </div>

        {/* Balance */}
        <div className="mb-5 flex items-center justify-between rounded-xl border border-border bg-bg-subtle px-4 py-3">
          <span className="text-sm text-text-muted">USDC balance</span>
          <span className={`num font-semibold ${hasFunds ? "text-status-success" : "text-text-primary"}`}>
            {hasFunds ? `$${usdc.toFixed(2)}` : "0.00"}
          </span>
        </div>

        {/* Faucet CTA */}
        {!hasFunds && (
          <div className="mb-5 rounded-xl border border-accent-earn/30 bg-accent-earn/5 px-4 py-3 text-sm text-text-secondary">
            <strong className="text-text-primary">Get test funds:</strong> the Circle faucet gives $20 USDC — free,
            instant, no sign-up.
          </div>
        )}

        {error && (
          <p className="mb-3 text-sm text-status-danger">{error}</p>
        )}

        <div className="flex flex-col gap-3">
          {!hasFunds && (
            <button
              type="button"
              onClick={openFaucet}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-accent-earn bg-accent-earn/10 px-4 py-3 text-sm font-semibold text-accent-earn transition-all hover:bg-accent-earn/20"
            >
              Get test funds →
            </button>
          )}

          <button
            type="button"
            onClick={onFunded}
            disabled={!hasFunds}
            className="w-full rounded-xl bg-accent-earn px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-accent-earn/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {hasFunds ? "Run my strategy →" : "Waiting for funds…"}
          </button>
        </div>
      </div>

      {/* Future note for judges */}
      <p className="max-w-sm text-center text-xs text-text-muted">
        In production, Circle Programmable Wallets will fund users automatically —
        no faucet step needed.
      </p>
    </div>
  );
}
