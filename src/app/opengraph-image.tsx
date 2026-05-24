import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt = "Stakinator — Your money, working smarter.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Dynamic Open Graph image generated at request time via next/og.
 * Blue gradient (#0B92F9 → #1E3A8A) with the Stakinator wordmark and tagline.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: "80px",
          background:
            "linear-gradient(135deg, #0B92F9 0%, #1E3A8A 100%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "20px",
            marginBottom: "24px",
          }}
        >
          <div
            style={{
              width: "84px",
              height: "84px",
              borderRadius: "20px",
              background: "rgba(255,255,255,0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "52px",
              fontWeight: 700,
            }}
          >
            S
          </div>
          <span
            style={{
              fontSize: "28px",
              fontWeight: 500,
              opacity: 0.85,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            Stakinator
          </span>
        </div>

        <div
          style={{
            display: "flex",
            fontSize: "104px",
            fontWeight: 700,
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
          }}
        >
          Your money,
        </div>
        <div
          style={{
            display: "flex",
            fontSize: "104px",
            fontWeight: 700,
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
            marginBottom: "32px",
          }}
        >
          working smarter.
        </div>

        <div
          style={{
            display: "flex",
            fontSize: "30px",
            fontWeight: 400,
            opacity: 0.9,
            maxWidth: "880px",
          }}
        >
          AI wealth manager for everyone.
        </div>
      </div>
    ),
    { ...size }
  );
}
