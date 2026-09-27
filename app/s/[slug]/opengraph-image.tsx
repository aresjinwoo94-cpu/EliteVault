import { ImageResponse } from "next/og";
import { analyzerReportV2Enabled } from "@/lib/flags";
import { buildShareResult, shareVerdictPhrase, type SharedAuditRow } from "@/lib/analyzer/share-v2";
import { potentialBandForResult } from "@/lib/analyzer/report-v2";

/**
 * Dynamic OG image for a shared audit (P0.3 + share-v2).
 *
 * The organic-growth creative: when someone shares their result, the link
 * preview shows THEIR store on the EliteVault brand canvas next to the
 * annotated screenshot. Under ANALYZER_REPORT_V2 (prod default) it shows the
 * ad-readiness VERDICT + revenue-potential band — matching the report, with no
 * score. With the flag off it shows the legacy X/100.
 *
 * Edge runtime: reads the public diagnosis via the Supabase REST RPC (anon key)
 * so there's no Node dependency. Falls back to a clean brand-only card if the
 * slug can't be resolved.
 */
export const runtime = "edge";
export const alt = "EliteVault store audit";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type SharedAudit = SharedAuditRow;

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
    // (The RPC returns the extended report-v2 fields when the 0033 migration is
    //  applied; older/pre-migration rows simply omit them and degrade cleanly.)
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
  const shot = audit?.screenshot_url ?? null;

  const v2 = analyzerReportV2Enabled();
  // v2: verdict in words + revenue-potential band (no score). Legacy: X/100.
  const result = audit ? buildShareResult(audit) : null;
  const verdict = result ? shareVerdictPhrase(result) : null;
  const band = result ? potentialBandForResult(result) : null;
  const rawScore = audit?.score ?? null;
  const score =
    rawScore == null
      ? null
      : Math.round(rawScore > 1 ? rawScore : rawScore * 100);

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
              "radial-gradient(circle, rgba(45, 212, 191,0.22) 0%, rgba(45, 212, 191,0) 65%)",
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
                  <stop offset="0" stopColor="#99F6E4" />
                  <stop offset="0.5" stopColor="#2DD4BF" />
                  <stop offset="1" stopColor="#0D9488" />
                </linearGradient>
              </defs>
              <path
                d="M16 3 L29 16 L16 29 L3 16 Z"
                stroke="url(#g)"
                strokeWidth="2"
                strokeLinejoin="round"
                fill="rgba(45, 212, 191,0.06)"
              />
            </svg>
            <span style={{ fontSize: "30px", color: "white", fontWeight: 500 }}>
              EliteVault
            </span>
          </div>

          {v2 ? (
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span
                style={{
                  fontSize: "30px",
                  color: "rgba(255,255,255,0.6)",
                  marginBottom: "10px",
                  display: "flex",
                }}
              >
                {domain}
              </span>
              <span
                style={{
                  fontSize: shot ? "56px" : "68px",
                  lineHeight: 1.05,
                  fontWeight: 600,
                  color: "white",
                  display: "flex",
                  maxWidth: shot ? "440px" : "900px",
                }}
              >
                {verdict ?? "Here's what's costing you sales"}
              </span>
              {band && (
                <div style={{ display: "flex", flexDirection: "column", marginTop: "22px" }}>
                  <span
                    style={{
                      fontSize: "20px",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "rgba(255,255,255,0.45)",
                      display: "flex",
                    }}
                  >
                    Revenue potential
                  </span>
                  <span
                    style={{
                      fontSize: "52px",
                      fontWeight: 600,
                      background:
                        "linear-gradient(135deg, #99F6E4 0%, #2DD4BF 50%, #0D9488 100%)",
                      backgroundClip: "text",
                      color: "transparent",
                      display: "flex",
                    }}
                  >
                    {band}
                  </span>
                </div>
              )}
            </div>
          ) : (
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
                      "linear-gradient(135deg, #99F6E4 0%, #2DD4BF 50%, #0D9488 100%)",
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
          )}

          <span
            style={{
              fontSize: "22px",
              color: "rgba(45, 212, 191,0.85)",
              letterSpacing: "0.02em",
              display: "flex",
            }}
          >
            Audit your store free → elitevaultapp.com
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
