"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export interface MiniTx {
  id: string;
  description: string;
}

interface NotificationCardProps {
  text: string;
  rebalanceTxs?: MiniTx[];
  onDismiss?: () => void;
}

const AUTO_DISMISS_MS = 8000;

export function NotificationCard({ text, rebalanceTxs, onDismiss }: NotificationCardProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(false);
      onDismiss?.();
    }, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [onDismiss]);

  if (!visible) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="mb-6 rounded-xl border border-border bg-bg-surface p-4"
    >
      <div className="flex items-start gap-3">
        <Image
          src="/icon.svg"
          alt=""
          width={32}
          height={32}
          className="h-8 w-8 shrink-0 rounded-lg"
        />
        <div className="flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-text-primary">
              Agent check-in complete
            </p>
            <button
              type="button"
              onClick={() => { setVisible(false); onDismiss?.(); }}
              className="text-xs text-text-muted hover:text-text-primary"
            >
              ✕
            </button>
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-text-muted">{text}</p>

          {rebalanceTxs && rebalanceTxs.length > 0 ? (
            <ul className="mt-2 space-y-0.5">
              {rebalanceTxs.map((tx) => (
                <li key={tx.id} className="text-xs text-text-secondary">
                  · {tx.description}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </motion.section>
  );
}
