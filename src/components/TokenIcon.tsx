import Image from "next/image";

export type TokenSymbol = "USDC" | "USYC" | "EURC";

const LOGOS: Record<"USDC" | "USYC", { src: string; alt: string }> = {
  USDC: { src: "/logos/usdc.png", alt: "USDC" },
  USYC: { src: "/logos/usyc.png", alt: "USYC" },
};

interface TokenIconProps {
  token: TokenSymbol;
  size?: number;
  className?: string;
}

export function TokenIcon({ token, size = 40, className = "" }: TokenIconProps) {
  if (token === "EURC") {
    return (
      <div
        className={`flex shrink-0 items-center justify-center rounded-full bg-[#7c3aed] ${className}`}
        style={{ width: size, height: size }}
        aria-hidden
      >
        <span className="font-bold text-white" style={{ fontSize: size * 0.45 }}>
          €
        </span>
      </div>
    );
  }

  const meta = LOGOS[token];
  return (
    <Image
      src={meta.src}
      alt={meta.alt}
      width={size}
      height={size}
      className={`shrink-0 rounded-full ${className}`}
    />
  );
}

/** Map portfolio bucket keys to underlying token symbols. */
export function bucketToken(key: "safe" | "liquid" | "euro" | "growth"): TokenSymbol | null {
  switch (key) {
    case "safe":
      return "USYC";
    case "liquid":
      return "USDC";
    case "euro":
      return "EURC";
    default:
      return null;
  }
}

/** Map strategy allocation bucket keys to token symbols. */
export function strategyBucketToken(
  key: "safe" | "liquid" | "growth",
): TokenSymbol | null {
  if (key === "safe") return "USYC";
  if (key === "liquid") return "USDC";
  return null;
}
