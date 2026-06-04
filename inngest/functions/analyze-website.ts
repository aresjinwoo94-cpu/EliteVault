import { inngest } from "../client";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { enterMeter } from "@/lib/usage/context";
import type { PlanTier } from "@/lib/supabase/types";
import { captureScreenshot } from "@/lib/screenshot";
import {
  readScreenshotCache,
  writeScreenshotCache,
} from "@/lib/screenshot-cache";
import { discoverSite } from "@/lib/site-discovery";
import { runAnalyzerAgent } from "@/ai/agents/analyzer-agent";
import { runQuickScore } from "@/ai/agents/quick-score-agent";
import { runMetaAdsOptimizerAgent } from "@/ai/agents/meta-ads-optimizer-agent";
// Auto-Rewrite agent removed from the v2.1 Scale pipeline — kept in
// /ai/agents for future on-demand routes ("regenerate hero") but not
// auto-run on every analysis.
import type { BuyerPersona } from "@/lib/supabase/types";

/**
 * Long-running website analysis pipeline.
 *
 * Each `step.run` is independently durable — Inngest persists results
 * between steps so a retry on a transient failure won't repeat the work
 * already done in earlier steps.
 *
 * On retryable failures (e.g. Gemini 429 quota), Inngest backs off and
 * retries. After 2 retries (3 total attempts) the `onFailure` handler
 * persists the real error and refunds the credit.
 */
export const analyzeWebsite = inngest.createFunction(
  {
    id: "analyze-website",
    name: "Analyze website",
    retries: 2,
    onFailure: async ({ event, error }) => {
      const service = createSupabaseServiceClient();
      const data = (event as unknown as {
        data: { event: { data: { analysisId: string; userId: string } } };
      }).data.event.data;

      // Surface a useful — but bounded — error to the user
      const friendly = humanizeError(error);

      await service
        .from("analyses")
        .update({
          status: "refunded",
          error: friendly,
          finished_at: new Date().toISOString(),
        })
        .eq("id", data.analysisId);

      const { data: profile } = await service
        .from("profiles")
        .select("credits")
        .eq("id", data.userId)
        .single();
      if (profile) {
        await service
          .from("profiles")
          .update({ credits: profile.credits + 1 })
          .eq("id", data.userId);
      }
    },
  },
  { event: "analysis/requested" },
  async ({ event, step }) => {
    const { analysisId, userId, url, screenshotUrl, persona, runRewrite, fast, plan } =
      event.data;
    // Attribute every Gemini call in this pipeline to the user + 'analysis'
    // feature for the usage_events cost ledger. enterWith persists through all
    // the step.run async continuations below.
    enterMeter({
      userId,
      plan: (plan as PlanTier | null | undefined) ?? null,
      eventType: "analysis",
      meta: { analysisId },
    });
    const service = createSupabaseServiceClient();

    await step.run("mark-running", async () => {
      await service
        .from("analyses")
        .update({ status: "running", started_at: new Date().toISOString() })
        .eq("id", analysisId);
    });

    const screenshot = await step.run("capture-screenshot", async () => {
      if (screenshotUrl) {
        const res = await fetch(screenshotUrl);
        const buf = Buffer.from(await res.arrayBuffer());
        return {
          base64: buf.toString("base64"),
          mediaType: "image/jpeg" as const,
        };
      }
      if (!url) throw new Error("Either url or screenshotUrl is required");

      // P1.4 — URL-hash cache. If we've already captured this exact store,
      // re-download the stored public image (fast) instead of re-running
      // the slow capture providers. Self-healing: a 404 on the cached URL
      // falls through to a fresh capture below.
      const cached = await readScreenshotCache(service, url);
      if (cached) {
        try {
          const res = await fetch(cached.screenshot_url);
          if (res.ok) {
            const buf = Buffer.from(await res.arrayBuffer());
            if (buf.length > 1000) {
              console.log("[analyzer] screenshot cache hit");
              return {
                base64: buf.toString("base64"),
                mediaType: cached.media_type,
              };
            }
          }
        } catch (err) {
          console.warn(
            "[analyzer] cached screenshot fetch failed, recapturing:",
            (err as Error).message,
          );
        }
      }
      return captureScreenshot(url);
    });

    // P1.2 — instant teaser score. Runs as soon as we have the screenshot,
    // well before the full audit (and the extra-page captures) finish, so
    // the analyzing screen can show a real number in a few seconds. Pure
    // best-effort: never throws, never blocks the audit.
    await step.run("quick-score", async () => {
      const preview = await runQuickScore({
        screenshotBase64: screenshot.base64,
        mediaType: screenshot.mediaType,
        url,
      });
      if (preview) {
        await (
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          service.from("analyses") as any
        )
          .update({
            preview_score: preview.score,
            preview_summary: preview.headline,
          })
          .eq("id", analysisId);
      }
      return preview;
    });

    const niche = await step.run("infer-niche", async () => {
      const host = url ? new URL(url).hostname.replace("www.", "") : "ecommerce";
      return host.split(".")[0];
    });

    // v2.2: discover product URLs + prices to enrich the audit context.
    const discovery = await step.run("discover-site", async () => {
      if (!url) return null;
      try {
        return await discoverSite(url);
      } catch (err) {
        console.warn("[analyzer] discovery skipped:", (err as Error).message);
        return null;
      }
    });

    // v2.2b: capture screenshots of up to 2 ADDITIONAL pages discovered
    // (typically the top product page + one more). Each capture is its own
    // step so a single bad URL doesn't abort the run — Inngest just retries
    // the failing step. The model sees ALL screenshots in one conversation.
    const extraShots = await step.run("capture-extra-screenshots", async () => {
      const extraUrls = (discovery?.pageUrls ?? [])
        .filter((u) => u !== url)
        .slice(0, 2);
      if (extraUrls.length === 0) return [];
      const out: { url: string; base64: string; mediaType: "image/png" | "image/jpeg" }[] = [];
      for (const u of extraUrls) {
        try {
          const shot = await captureScreenshot(u);
          out.push({ url: u, ...shot });
        } catch (err) {
          console.warn(`[analyzer] extra shot failed for ${u}:`, (err as Error).message);
        }
      }
      console.log(`[analyzer] captured ${out.length} extra screenshots`);
      return out;
    });

    // Save the primary screenshot so the UI overlay aligns 1:1 with the
    // annotations Gemini returns on the homepage.
    const screenshotPublicUrl = await step.run("save-screenshot", async () => {
      const ext = screenshot.mediaType === "image/png" ? "png" : "jpg";
      const path = `${analysisId}.${ext}`;
      const { error: upErr } = await service.storage
        .from("screenshots")
        .upload(path, Buffer.from(screenshot.base64, "base64"), {
          contentType: screenshot.mediaType,
          upsert: true,
        });
      if (upErr) {
        console.warn("[analyzer] screenshot upload failed:", upErr.message);
        return null;
      }
      const { data: pub } = service.storage
        .from("screenshots")
        .getPublicUrl(path);
      await service
        .from("analyses")
        .update({ screenshot_url: pub.publicUrl })
        .eq("id", analysisId);

      // P1.4 — populate the URL-hash cache with this public image so a
      // future re-analysis of the same store skips the capture providers.
      // Only for URL-based runs (uploaded screenshots aren't re-capturable).
      if (url) {
        await writeScreenshotCache(
          service,
          url,
          pub.publicUrl,
          screenshot.mediaType,
        );
      }
      return pub.publicUrl;
    });

    const result = await step.run("run-analyzer-agent", async () => {
      return runAnalyzerAgent({
        screenshotBase64: screenshot.base64,
        mediaType: screenshot.mediaType,
        url,
        persona: persona as BuyerPersona | null,
        // P1.1 — free audits run on the cheap/fast model tier.
        fast,
        // v2.2: multi-image input — homepage + 1-2 product pages. The model
        // now reasons across multiple views of the store at once, with the
        // homepage as the *primary* one for annotation positioning.
        extraScreenshots: extraShots,
        siteInfo: discovery
          ? {
              title: discovery.title,
              description: discovery.description,
              prices: discovery.prices,
              platform: discovery.platform,
              extraPages: discovery.pageUrls.slice(1, 3),
              // v3.3 — full-page text content. The screenshot only shows
              // the first viewport; these fields give the agent what's
              // below the fold (reviews, trust, FAQ, body, CTAs, etc.)
              headings: discovery.headings,
              bodyExcerpt: discovery.bodyExcerpt,
              reviewSnippets: discovery.reviewSnippets,
              ratingSignal: discovery.ratingSignal,
              trustSignals: discovery.trustSignals,
              faqQuestions: discovery.faqQuestions,
              ctaTexts: discovery.ctaTexts,
              imageAlts: discovery.imageAlts,
            }
          : null,
      });
    });

    // Scale-plan extra: Meta Ads Optimizer ONLY. Inngest persists each
    // step independently — if this fails we still save the core analysis
    // (the user just doesn't see the Meta Ads panel) rather than refund
    // the whole job. The legacy `runRewrite` event flag still routes here
    // so upstream callers don't have to change.
    let metaAds = null;
    if (runRewrite) {
      metaAds = await step.run("run-meta-ads-agent", async () => {
        try {
          return await runMetaAdsOptimizerAgent({
            url: url ?? "",
            score: result.score,
            summary: result.summary,
            topFixes: result.top_fixes,
            persona: persona as BuyerPersona | null,
            niche,
            // Discovered product + price context — drives more realistic
            // CPC/CPM targets and creative angle suggestions.
            siteInfo: discovery
              ? {
                  title: discovery.title,
                  description: discovery.description,
                  prices: discovery.prices,
                  platform: discovery.platform,
                }
              : null,
          });
        } catch (err) {
          console.warn("[analyzer] meta-ads skipped:", (err as Error).message);
          return null;
        }
      });
    }

    await step.run("save-result", async () => {
      await service
        .from("analyses")
        .update({
          status: "succeeded",
          result,
          meta_ads: metaAds,
          finished_at: new Date().toISOString(),
        })
        .eq("id", analysisId);
    });

    // Activation (Phase 5): stamp time-to-first-value the first time a user
    // reaches a successful audit, and kick off the delayed follow-up email.
    // Additive — never affects the audit result itself.
    const firstValue = await step.run("mark-first-value", async () => {
      const { data: prof } = await service
        .from("profiles")
        .select("first_value_at")
        .eq("id", userId)
        .single();
      const already = (prof as { first_value_at?: string | null } | null)
        ?.first_value_at;
      if (prof && !already) {
        await service
          .from("profiles")
          .update({ first_value_at: new Date().toISOString() })
          .eq("id", userId);
        return true;
      }
      return false;
    });

    if (firstValue) {
      await step.sendEvent("activation-first-value", {
        name: "activation/first-value",
        data: {
          userId,
          analysisId,
          score: result.score,
          plan: plan ?? null,
        },
      });
    }

    return { analysisId, score: result.score };
  },
);

/**
 * Reduces a noisy SDK error to something useful for the user.
 * We surface the *cause* in plain words but never the raw stack trace.
 */
function humanizeError(err: unknown): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : JSON.stringify(err);

  // Gemini quota / 429
  if (/RESOURCE_EXHAUSTED|429|quota/i.test(raw)) {
    if (/gemini-2\.5-pro/.test(raw)) {
      return "Gemini Pro requires a Google Cloud project with billing enabled. We've fallen back to Flash — try again in a moment.";
    }
    return "AI provider rate-limited this request. Wait a minute and try again — your credit was refunded.";
  }

  // Anthropic 529 / overload
  if (/overloaded_error|529/i.test(raw)) {
    return "Claude is overloaded right now. Try again in a few minutes — your credit was refunded.";
  }

  // Screenshot service — all providers exhausted
  if (/All screenshot providers failed/i.test(raw)) {
    return "We couldn't capture this site (it likely blocks automated screenshots, e.g. Cloudflare or anti-bot). Try uploading a screenshot manually, or pick a different URL. Your credit was refunded.";
  }
  if (/Cloudflare-protected|placeholder after/i.test(raw)) {
    return "This site appears to block automated capture (Cloudflare or similar). Upload a manual screenshot instead — your credit was refunded.";
  }
  if (/screenshot.*fail|mshots|Microlink|ScreenshotOne/i.test(raw)) {
    return "We couldn't capture a screenshot of that URL. Verify it loads in an incognito tab and try again — your credit was refunded.";
  }

  // Schema validation
  if (/schema mismatch|failed validation/i.test(raw)) {
    return "The AI returned malformed output. This is on us — please try again.";
  }

  // Generic
  const trimmed = raw.replace(/\s+/g, " ").trim();
  return trimmed.length > 300 ? trimmed.slice(0, 297) + "…" : trimmed;
}
