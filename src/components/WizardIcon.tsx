"use client";

import Image from "next/image";
import { motion, type Transition } from "framer-motion";

type Variant = "float" | "bounce" | "fast-float" | "pulse" | "celebrate";

interface WizardIconProps {
  size?: number;
  variant?: Variant;
  className?: string;
  rounded?: string;
  /** Set on the first render of a fresh question so the bounce plays once. */
  bounceKey?: string;
}

/**
 * The Stakinator character (`public/icon.svg`) with the project's standard
 * animation variants. The icon is presentational so it carries empty alt.
 */
export function WizardIcon({
  size = 120,
  variant = "float",
  className = "",
  rounded = "rounded-2xl",
  bounceKey,
}: WizardIconProps) {
  const animation = ANIMATIONS[variant];
  return (
    <motion.div
      key={bounceKey}
      className={`relative shrink-0 ${rounded} ${className}`}
      style={{ width: size, height: size }}
      initial={animation.initial}
      animate={animation.animate}
      transition={animation.transition}
    >
      <Image
        src="/icon.svg"
        alt=""
        width={size}
        height={size}
        priority
        className={`${rounded} h-full w-full select-none`}
      />
    </motion.div>
  );
}

type AnimationSpec = {
  initial?: Record<string, number | number[]>;
  animate: Record<string, number | number[]>;
  transition: Transition;
};

const ANIMATIONS: Record<Variant, AnimationSpec> = {
  float: {
    animate: { y: [0, -6, 0] },
    transition: { duration: 3, repeat: Infinity, ease: "easeInOut" },
  },
  "fast-float": {
    animate: { y: [0, -6, 0] },
    transition: { duration: 0.8, repeat: Infinity, ease: "easeInOut" },
  },
  bounce: {
    initial: { scale: 0.97 },
    animate: { scale: [0.97, 1.03, 1] },
    transition: { duration: 0.3, ease: "easeOut" },
  },
  pulse: {
    animate: { opacity: [1, 0.6, 1] },
    transition: { duration: 1, repeat: Infinity, ease: "easeInOut" },
  },
  celebrate: {
    initial: { scale: 1, opacity: 0 },
    animate: { scale: [1, 1.1, 1.05], opacity: 1 },
    transition: { duration: 0.5, ease: "easeOut" },
  },
};
