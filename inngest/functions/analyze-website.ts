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
import { startDeadline, isDeadlineError } from "@/lib/deadline";

/**
 * How many audits may run at once, globally.
 *
 * The ceiling that actually matters isn't ours — it's the free tiers we sit
 * on: Gemini is 15 RPM per key and ScreenshotOne's free plan is 100 captures a
 * month. Left unbounded, a burst of users doesn't fail *some* audits, it fails
 * *most* of them: every run 429s at once and they all refund together. Inngest
 * queues the excess instead, so a burst turns into a slightly longer wait
 * rather than a wave of failures.
 *
 * Raise ANALYZER_CONCURRENCY as the key pool grows (the Gemini provider
 * rotates GEMINI_API_KEY_2..10, so headroom scales with keys configured).
 */
const GLOBAL_CONCURRENCY = (() => {
  const raw = Number(process.env.ANALYZER_CONCURRENCY);
  return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 5;
})();

/**
 * How many ADDITIONAL product-page screenshots to capture per audit.
 *
 * Was hardcoded to 2, which made every audit cost up to 3 ScreenshotOne
 * captures. Only the primary shot is URL-cached, so the extras re-billed on
 * every run — 2/3 of the quota (the free tier is 100/month: ~33 audits at 3
 * shots vs ~100 at 1). They were also the biggest latency cost: an extra
 * capture round-trip plus two more 1-4MB full-page images in the vision call.
 *
 * Set to 0 because the model already receives the discovery step's TEXT
 * context for those same pages — headings, prices, CTA copy, trust signals,
 * review snippets, FAQ, image alts — which costs no captures, and the prompt
 * omits the multi-screenshot preamble cleanly when there are none.
 *
 * Raise via ANALYZER_EXTRA_SHOTS once capture volume isn't rationed.
 */
const MAX_EXTRA_SHOTS = Number(process.env.ANALYZER_EXTRA_SHOTS ?? 0);

/**
 * Fetch an image URL and return its raw base64. Used to pull screenshot bytes
 * INSIDE the steps that need them, so the large base64 is a local variable and
 * never a persisted step output (Inngest rejects step outputs over its size
 * limit — "step output size is greater than the limit").
 */
async function urlToBase64(imageUrl: string): Promise<string> {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`fetch image ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.toString("base64");
}

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
    // Queue rather than fail under load. The per-user key stops one person
    // (or a stuck client re-submitting) from occupying the whole pool; the
    // global limit protects the shared free-tier quotas above.
    concurrency: [
      { limit: GLOBAL_CONCURRENCY },
      { key: "event.data.userId", limit: 1 },
    ],
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

    // Returns a SMALL reference { publicUrl, mediaType } — never the raw
    // base64. The screenshot is uploaded to storage here (merging the old
    // save-screenshot step); steps that need the bytes fetch them via
    // urlToBase64() so nothing large is ever a persisted step output.
    const screenshot = await step.run("capture-screenshot", async () => {
      // Every step below opens its own budget. It has to expire BEFORE the
      // route's maxDuration, otherwise Vercel kills the request mid-step and
      // Inngest only sees "your server returned HTTP 504" — an opaque failure
      // that loses the work and refunds the audit. See lib/deadline.ts.
      const dl = startDeadline();
      const extOf = (m: "image/png" | "image/jpeg") =>
        m === "image/png" ? "png" : "jpg";

      const uploadAndUrl = async (
        base64: string,
        mediaType: "image/png" | "image/jpeg",
      ) => {
        const path = `${analysisId}.${extOf(mediaType)}`;
        const { error: upErr } = await service.storage
          .from("screenshots")
          .upload(path, Buffer.from(base64, "base64"), {
            contentType: mediaType,
            upsert: true,
          });
        if (upErr) throw new Error(`screenshot upload failed: ${upErr.message}`);
        const { data: pub } = service.storage
          .from("screenshots")
          .getPublicUrl(path);
        await service
          .from("analyses")
          .update({ screenshot_url: pub.publicUrl })
          .eq("id", analysisId);
        // P1.4 — populate the URL-hash cache for fast re-analysis.
        if (url) {
          await writeScreenshotCache(service, url, pub.publicUrl, mediaType);
        }
        return { publicUrl: pub.publicUrl, mediaType };
      };

      if (screenshotUrl) {
        const res = await fetch(screenshotUrl);
        const buf = Buffer.from(await res.arrayBuffer());
        return uploadAndUrl(buf.toString("base64"), "image/jpeg");
      }
      if (!url) throw new Error("Either url or screenshotUrl is required");

      // P1.4 — URL-hash cache: reuse the stored public image (no re-upload).
      // Self-healing: a 404 on the cached URL falls through to a fresh capture.
      const cached = await readScreenshotCache(service, url);
      if (cached) {
        try {
          const res = await fetch(cached.screenshot_url);
          if (res.ok) {
            const buf = Buffer.from(await res.arrayBuffer());
            if (buf.length > 1000) {
              console.log("[analyzer] screenshot cache hit");
              await service
                .from("analyses")
                .update({ screenshot_url: cached.screenshot_url })
                .eq("id", analysisId);
              return {
                publicUrl: cached.screenshot_url,
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
      // Leave room for the upload + DB writes that follow inside this step —
      // a capture that used the whole budget would 504 on the upload instead.
      const UPLOAD_RESERVE_MS = 12_000;
      const shot = await captureScreenshot(url, {
        budgetMs: Math.max(5_000, dl.remaining() - UPLOAD_RESERVE_MS),
      });
      return uploadAndUrl(shot.base64, shot.mediaType);
    });

    // P1.2 — instant teaser score, and v2.2 site discovery.
    //
    // These two are INDEPENDENT of each other: the teaser reads the screenshot
    // we already have, discovery fetches the site's HTML. They used to run one
    // after the other, so the user waited through the sum (~5s + ~10s) for no
    // reason. Promise.all makes Inngest run both steps in parallel and the
    // audit starts at whichever finishes last — the wait becomes the max, not
    // the sum. Both stay best-effort: neither can fail the audit.
    const [, discovery] = await Promise.all([
      step.run("quick-score", async () => {
        const dl = startDeadline();
        let preview = null;
        try {
          const base64 = await urlToBase64(screenshot.publicUrl);
          preview = await runQuickScore({
            screenshotBase64: base64,
            mediaType: screenshot.mediaType,
            url,
            deadlineAt: dl.at,
          });
        } catch (err) {
          console.warn(
            "[analyzer] quick-score skipped:",
            (err as Error).message,
          );
        }
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
      }),

      step.run("discover-site", async () => {
        if (!url) return null;
        try {
          return await discoverSite(url);
        } catch (err) {
          console.warn("[analyzer] discovery skipped:", (err as Error).message);
          return null;
        }
      }),
    ]);

    const niche = await step.run("infer-niche", async () => {
      // A malformed URL is not a reason to fail an audit that already has its
      // screenshot — fall back to a generic label.
      try {
        const host = url
          ? new URL(url).hostname.replace("www.", "")
          : "ecommerce";
        return host.split(".")[0] || "ecommerce";
      } catch {
        return "ecommerce";
      }
    });

    // v2.2b: capture screenshots of up to 2 ADDITIONAL pages discovered
    // (typically the top product page + one more). Each capture is its own
    // step so a single bad URL doesn't abort the run — Inngest just retries
    // the failing step. The model sees ALL screenshots in one conversation.
    const extraShots = await step.run("capture-extra-screenshots", async () => {
      const extraUrls = (discovery?.pageUrls ?? [])
        .filter((u) => u !== url)
        .slice(0, MAX_EXTRA_SHOTS);
      if (extraUrls.length === 0) return [];
      type Extra = {
        url: string;
        publicUrl: string;
        mediaType: "image/png" | "image/jpeg";
      };

      // Captured in PARALLEL. These used to run in a sequential for-loop, so
      // two extra pages added ~2x a full capture (~15s each) to every audit
      // that discovered them — pure wall-clock the user waits through, since
      // the pages are independent. The index is bound per URL (not derived
      // from a mutating array length) so concurrent uploads can't collide on
      // the same storage path.
      const settled = await Promise.all(
        extraUrls.map(async (u, i): Promise<Extra | null> => {
          try {
            const shot = await captureScreenshot(u);
            const ext = shot.mediaType === "image/png" ? "png" : "jpg";
            const path = `${analysisId}-extra-${i}.${ext}`;
            const { error: upErr } = await service.storage
              .from("screenshots")
              .upload(path, Buffer.from(shot.base64, "base64"), {
                contentType: shot.mediaType,
                upsert: true,
              });
            if (upErr) {
              console.warn(
                `[analyzer] extra shot upload failed for ${u}:`,
                upErr.message,
              );
              return null;
            }
            const { data: pub } = service.storage
              .from("screenshots")
              .getPublicUrl(path);
            return { url: u, publicUrl: pub.publicUrl, mediaType: shot.mediaType };
          } catch (err) {
            console.warn(
              `[analyzer] extra shot failed for ${u}:`,
              (err as Error).message,
            );
            return null;
          }
        }),
      );
      const out = settled.filter((s): s is Extra => s !== null);
      console.log(`[analyzer] captured ${out.length} extra screenshots`);
      return out;
    });

    // (The primary screenshot was already uploaded + screenshot_url set in
    // capture-screenshot, so the old separate save-screenshot step is gone.)

    const result = await step.run("run-analyzer-agent", async () => {
      // The longest step in the pipeline, and the one that used to run into
      // the platform ceiling: the vision call plus the provider's own 429/503
      // retry ladders could add up to well over 60s. The budget now bounds all
      // of it (see ai/providers/gemini.ts) so we fail cleanly — and retryably —
      // instead of being cut off with a 504.
      const dl = startDeadline();
      // Pull the image bytes HERE as local vars — never returned/persisted —
      // so a large screenshot can't blow Inngest's step-output size limit.
      const primaryBase64 = await urlToBase64(screenshot.publicUrl);
      const extraScreenshots: {
        url: string;
        base64: string;
        mediaType: "image/png" | "image/jpeg";
      }[] = [];
      for (const e of extraShots) {
        try {
          extraScreenshots.push({
            url: e.url,
            base64: await urlToBase64(e.publicUrl),
            mediaType: e.mediaType,
          });
        } catch (err) {
          console.warn(
            "[analyzer] extra shot refetch failed:",
            (err as Error).message,
          );
        }
      }
      return runAnalyzerAgent({
        screenshotBase64: primaryBase64,
        mediaType: screenshot.mediaType,
        url,
        persona: persona as BuyerPersona | null,
        // P1.1 — free audits run on the cheap/fast model tier.
        fast,
        deadlineAt: dl.at,
        // v2.2: multi-image input — homepage + 1-2 product pages. The model
        // now reasons across multiple views of the store at once, with the
        // homepage as the *primary* one for annotation positioning.
        extraScreenshots,
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
        const dl = startDeadline();
        try {
          return await runMetaAdsOptimizerAgent({
            deadlineAt: dl.at,
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

  // Ran out of the per-step wall-clock budget (lib/deadline.ts). This is the
  // clean, honest version of what used to surface as an opaque 504.
  if (isDeadlineError(err) || /step budget exhausted/i.test(raw)) {
    return "This store took longer to audit than one run allows — usually a very tall page or a slow AI provider. Try again in a minute; your credit was refunded.";
  }

  // The platform cut a step off before we could (belt and braces — the step
  // budgets should mean users never see this).
  if (/HTTP 504|FUNCTION_INVOCATION_TIMEOUT|before the SDK responded/i.test(raw)) {
    return "The audit timed out mid-run. Try again — your credit was refunded. If it keeps happening on the same store, upload a screenshot instead.";
  }

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

  // Empty AI response — usually a blank/placeholder screenshot (a site whose
  // capture was still warming or briefly returned the "generating preview"
  // placeholder). A re-run almost always succeeds once the capture is ready.
  if (/empty response/i.test(raw)) {
    return "We couldn't read this page on the first pass — the screenshot may have still been generating. Click Try again; it usually works on the second run. Your credit was refunded.";
  }

  // Schema validation
  if (/schema mismatch|failed validation/i.test(raw)) {
    return "The AI returned malformed output. This is on us — please try again.";
  }

  // Generic
  const trimmed = raw.replace(/\s+/g, " ").trim();
  return trimmed.length > 300 ? trimmed.slice(0, 297) + "…" : trimmed;
}
