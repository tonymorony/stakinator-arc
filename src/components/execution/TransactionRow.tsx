"use client";

import { motion } from "framer-motion";

export interface ExecutionTx {
  description: string;
  txHash: string | null;
  explorerUrl: string | null;
  source: "arc" | "simulated" | "off-chain";
}

interface TransactionRowProps {
  tx: ExecutionTx;
  index: number;
}

export function TransactionRow({ tx, index }: TransactionRowProps) {
  return (
    <motion.li
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut", delay: index * 0.15 }}
      className="flex items-start gap-3 border-b border-border py-3 last:border-0"
    >
      <CheckCircle delay={index * 0.15 + 0.1} />

      <div className="flex-1">
        <p className="text-sm font-medium leading-relaxed text-text-primary">
          {tx.description}
        </p>

        {tx.txHash && tx.explorerUrl ? (
          <a
            href={tx.explorerUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-accent-earn/30 bg-accent-earn/5 px-2.5 py-1 text-xs font-mono text-accent-earn transition-opacity hover:opacity-80"
          >
            <svg
              viewBox="0 0 16 16"
              className="h-3 w-3 shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <path d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h10a1 1 0 001-1v-3M10 2h4m0 0v4m0-4L7 9" />
            </svg>
            {shortHash(tx.txHash)} · See on Arc Explorer
          </a>
        ) : tx.source === "simulated" ? (
          <span className="mt-1 inline-block rounded-full border border-border/60 bg-bg-subtle px-2 py-0.5 text-[10px] text-text-muted">
            simulated
          </span>
        ) : null}
      </div>
    </motion.li>
  );
}

function CheckCircle({ delay }: { delay: number }) {
  return (
    <motion.div
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.25, ease: "easeOut", delay }}
      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-status-success/10"
      aria-hidden
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        className="h-3.5 w-3.5 text-status-success"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 10.5l3.2 3.2L15 7" />
      </svg>
    </motion.div>
  );
}

function shortHash(hash: string): string {
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}
