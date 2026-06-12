import { ImageResponse } from "next/og";

/**
 * Dynamic OG image at /opengraph-image
 *
 * Generated server-side via @vercel/og. Shows the brand mark, the headline
 * tagline, and a subtle gold + teal gradient on obsidian. 1200x630 is
 * the canonical OG dimension respected by Facebook / WhatsApp / Twitter /
 * LinkedIn / Slack / iMessage previews.
 *
 * Why dynamic instead of a static PNG: ImageResponse can be re-generated
 * with different headlines per route (e.g. a community audit page can
 * show that store's score + niche in the preview), and we don't have to
 * keep a binary asset in the repo.
 */

export const runtime = "edge";
export const alt = "EliteVault — Copy what actually converts";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "#0A0A0F",
          position: "relative",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        {/* Gold ambient glow (top-left) */}
        <div
          style={{
            position: "absolute",
            left: "-180px",
            top: "-200px",
            width: "700px",
            height: "700px",
            background:
              "radial-gradient(circle, rgba(212,175,55,0.22) 0%, rgba(212,175,55,0) 65%)",
            display: "flex",
          }}
        />
        {/* Teal ambient glow (bottom-right) */}
        <div
          style={{
            position: "absolute",
            right: "-150px",
            bottom: "-180px",
            width: "600px",
            height: "600px",
            background:
              "radial-gradient(circle, rgba(45,212,191,0.20) 0%, rgba(45,212,191,0) 65%)",
            display: "flex",
          }}
        />

        {/* Logo + brand mark, top */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "18px",
            position: "relative",
          }}
        >
          {/* Diamond mark — same as favicon, simplified for OG image scale */}
          <svg width="56" height="56" viewBox="0 0 32 32">
            <defs>
              <linearGradient id="og-gold" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0" stopColor="#FFF8E1" />
                <stop offset="0.5" stopColor="#D4AF37" />
                <stop offset="1" stopColor="#8A6A1A" />
              </linearGradient>
              <linearGradient id="og-signal" x1="0" x2="1" y1="1" y2="0">
                <stop offset="0" stopColor="#14B8A6" />
                <stop offset="1" stopColor="#5EEAD4" />
              </linearGradient>
            </defs>
            <path
              d="M16 3 L29 16 L16 29 L3 16 Z"
              stroke="url(#og-gold)"
              strokeWidth="2"
              strokeLinejoin="round"
              fill="rgba(212,175,55,0.06)"
            />
            <circle cx="16" cy="14" r="3.2" fill="url(#og-signal)" />
            <rect x="14.4" y="14" width="3.2" height="6.4" fill="url(#og-signal)" />
          </svg>
          <span
            style={{
              fontSize: "36px",
              fontWeight: 500,
              color: "white",
              letterSpacing: "-0.02em",
            }}
          >
            EliteVault
          </span>
        </div>

        {/* Headline tagline, middle/bottom */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "20px",
            position: "relative",
          }}
        >
          <div
            style={{
              fontSize: "92px",
              lineHeight: 1.02,
              letterSpacing: "-0.035em",
              color: "white",
              fontWeight: 500,
              display: "flex",
              flexWrap: "wrap",
            }}
          >
            <span>Copy what</span>
            <span
              style={{
                marginLeft: "20px",
                background:
                  "linear-gradient(135deg, #FFF8E1 0%, #D4AF37 50%, #8A6A1A 100%)",
                backgroundClip: "text",
                color: "transparent",
                fontStyle: "italic",
              }}
            >
              actually
            </span>
            <span style={{ width: "100%" }}>converts.</span>
          </div>

          <div
            style={{
              fontSize: "28px",
              color: "rgba(255,255,255,0.55)",
              lineHeight: 1.35,
              maxWidth: "920px",
              display: "flex",
            }}
          >
            AI-powered audit · curated library of winning ecommerce stores ·
            7-day Meta Ads campaign scenario modeler
          </div>

          {/* Subtle bottom row — domain + small accent */}
          <div
            style={{
              marginTop: "16px",
              display: "flex",
              alignItems: "center",
              gap: "14px",
            }}
          >
            <span
              style={{
                display: "flex",
                width: "10px",
                height: "10px",
                borderRadius: "50%",
                background: "#D4AF37",
              }}
            />
            <span
              style={{
                fontSize: "22px",
                color: "rgba(212,175,55,0.85)",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                fontFamily: "monospace",
              }}
            >
              elitevaultapp.com
            </span>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
