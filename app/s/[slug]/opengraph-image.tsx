import { ImageResponse } from "next/og";

/**
 * Dynamic OG image for a shared audit (P0.3).
 *
 * This is the organic-growth creative: when someone shares their result,
 * the link preview shows THEIR store's real score + annotated screenshot
 * on the EliteVault brand canvas. The screenshot IS the hook — "I want
 * that number for my store" — which is exactly the TikTok/Reels loop.
 *
 * Edge runtime: we read the public diagnosis via the Supabase REST RPC
 * (anon key) so there's no Node dependency. Falls back to a clean
 * brand-only card if the slug can't be resolved.
 */
export const runtime = "edge";
export const alt = "EliteVault store audit";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

interface SharedAudit {
  url: string | null;
  score: number | null;
  screenshot_url: string | null;
  summary: string | null;
}

async function fetchAudit(slug: string): Promise<SharedAudit | null> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!base || !key) return null;
  try {
    const res = await fetch(`${base}/rest/v1/rpc/get_shared_audit`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_slug: slug }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as SharedAudit | null;
    return data ?? null;
  } catch {
    return null;
  }
}

function domainOf(url: string | null): string {
  if (!url) return "your store";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "your store";
  }
}

export default async function Image({
  params,
}: {
  params: { slug: string } | Promise<{ slug: string }>;
}) {
  const { slug } = await Promise.resolve(params);
  const audit = await fetchAudit(slug);
  const domain = domainOf(audit?.url ?? null);
  const rawScore = audit?.score ?? null;
  const score =
    rawScore == null
      ? null
      : Math.round(rawScore > 1 ? rawScore : rawScore * 100);
  const shot = audit?.screenshot_url ?? null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#0A0A0F",
          fontFamily: "system-ui, -apple-system, sans-serif",
          position: "relative",
        }}
      >
        {/* Gold ambient glow */}
        <div
          style={{
            position: "absolute",
            left: "-180px",
            top: "-200px",
            width: "640px",
            height: "640px",
            background:
              "radial-gradient(circle, rgba(212,175,55,0.22) 0%, rgba(212,175,55,0) 65%)",
            display: "flex",
          }}
        />

        {/* LEFT — score + domain */}
        <div
          style={{
            width: shot ? "560px" : "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "64px 56px",
            position: "relative",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <svg width="44" height="44" viewBox="0 0 32 32">
              <defs>
                <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
                  <stop offset="0" stopColor="#FFF8E1" />
                  <stop offset="0.5" stopColor="#D4AF37" />
                  <stop offset="1" stopColor="#8A6A1A" />
                </linearGradient>
              </defs>
              <path
                d="M16 3 L29 16 L16 29 L3 16 Z"
                stroke="url(#g)"
                strokeWidth="2"
                strokeLinejoin="round"
                fill="rgba(212,175,55,0.06)"
              />
            </svg>
            <span style={{ fontSize: "30px", color: "white", fontWeight: 500 }}>
              EliteVault
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <span
              style={{
                fontSize: "30px",
                color: "rgba(255,255,255,0.6)",
                marginBottom: "8px",
                display: "flex",
              }}
            >
              {domain} scored
            </span>
            <div style={{ display: "flex", alignItems: "flex-end", gap: "14px" }}>
              <span
                style={{
                  fontSize: "150px",
                  lineHeight: 1,
                  fontWeight: 600,
                  background:
                    "linear-gradient(135deg, #FFF8E1 0%, #D4AF37 50%, #8A6A1A 100%)",
                  backgroundClip: "text",
                  color: "transparent",
                  display: "flex",
                }}
              >
                {score ?? "—"}
              </span>
              <span
                style={{
                  fontSize: "40px",
                  color: "rgba(255,255,255,0.4)",
                  marginBottom: "22px",
                  display: "flex",
                }}
              >
                / 100
              </span>
            </div>
          </div>

          <span
            style={{
              fontSize: "22px",
              color: "rgba(212,175,55,0.85)",
              letterSpacing: "0.02em",
              display: "flex",
            }}
          >
            Audit your store free → elitevault.app
          </span>
        </div>

        {/* RIGHT — the store screenshot (the hook). */}
        {shot && (
          <div
            style={{
              width: "640px",
              height: "100%",
              display: "flex",
              borderLeft: "1px solid rgba(255,255,255,0.08)",
              overflow: "hidden",
              position: "relative",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={shot}
              alt=""
              width={640}
              height={630}
              style={{ objectFit: "cover", width: "640px", height: "630px" }}
            />
          </div>
        )}
      </div>
    ),
    { ...size },
  );
}
