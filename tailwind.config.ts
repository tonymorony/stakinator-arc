import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          base: "#FFFFFF",
          surface: "#F5F7FA",
          elevated: "#EDF0F4",
        },
        border: {
          DEFAULT: "#E2E6EC",
        },
        text: {
          primary: "#1A1D21",
          muted: "#6B7280",
        },
        accent: {
          /** Primary brand blue (Figma) */
          earn: "#4A9FFF",
          yield: "#FFB020",
          launch: "#9D6BFF",
          /** Dark CTA buttons */
          cta: "#1A1D21",
        },
        status: {
          danger: "#DC2626",
          /** APY / profit highlight */
          success: "#16A34A",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-space-grotesk)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "ui-monospace", "monospace"],
        brand: ["var(--font-fredoka)", "var(--font-space-grotesk)", "system-ui", "sans-serif"],
      },
      fontSize: {},
      boxShadow: {
        card: "0 1px 3px rgba(26, 29, 33, 0.06)",
      },
    },
  },
  plugins: [],
};

export default config;
