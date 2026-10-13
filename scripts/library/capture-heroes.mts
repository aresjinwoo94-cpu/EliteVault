/**
 * Library hero captures from THIS machine (local Chrome, headless) — WP-L1 follow-up.
 *
 *   npx tsx --tsconfig scripts/tests/tsconfig.json --conditions=react-server \
 *     scripts/library/capture-heroes.mts --env <.env.local> --out <dir> [--only a.com,b.com] [--limit N] [--dry-run]
 *
 * For every Library row parked as `no_image` (no image at all, never an owner image) it opens the
 * store's home in a fresh headless browser, ONE STORE AT A TIME with a pause between them, and
 * takes a VIEWPORT screenshot (1440×900, not the full page) of the hero.
 *
 * Acceptance (a capture that fails any check is NOT saved; the row stays for a manual upload):
 *   • the page loaded (HTTP < 400) and is not a bot/anti-abuse wall;
 *   • cookie banners / popups are dismissed by clicking their own buttons (reject/decline first);
 *     if a big overlay still covers the viewport afterwards the capture is rejected;
 *   • the shared image acceptance check (lib/library/image-quality.ts): size, ratio, not a flat logo.
 * Accepted captures are saved with --hold semantics ALWAYS: the image is stored (source 'capture')
 * but the row is NOT published; its review_reason becomes `image_pending_review` — publication is
 * decided by the quality gate (WP-L2).
 *
 * Isolation: no Analyzer provider is used (no ScreenshotOne / thum.io / Microlink / mshots) and
 * nothing runs on Vercel. The browser is the locally installed Chrome (CHROME_PATH to override),
 * started with a throw-away profile; it is closed in a `finally` and, if the process is still alive,
 * ITS OWN process tree (never other Chrome windows) is killed. Nothing is left running.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const argv = process.argv.slice(2);
const arg = (n: string, d: string) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
for (const l of readFileSync(arg("--env", ".env.local"), "utf8").split(/\r?\n/)) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const outDir = arg("--out", "hero-captures");
const limit = Number(arg("--limit", "100"));
const only = argv.includes("--only") ? new Set(arg("--only", "").split(",").map((s) => s.trim().toLowerCase())) : null;
const dry = argv.includes("--dry-run");
const PAUSE_MS = 6000;
const CHROME =
  process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const W = 1440;
const H = 900;

mkdirSync(outDir, { recursive: true });
const { createSupabaseServiceClient } = await import("../../lib/supabase/server");
const { saveHeroImage } = await import("../../lib/library/images");
type Row = import("../../lib/library/images").MissingImageRow;

// ── select rows: parked for NO image, nothing stored, never an owner image ───────────────────
const svc = createSupabaseServiceClient();
const { data, error } = await svc
  .from("winning_sites")
  .select(
    "id, url, domain, domain_key, title, niche, status, is_live, thumbnail_url, thumbnail_source, thumbnail_attempts, thumbnail_checked_at, review_reason, active_ads_count, internal_score",
  )
  .eq("review_reason", "no_image")
  .is("thumbnail_url", null)
  .is("thumbnail_source", null)
  .order("niche")
  .order("domain");
if (error) throw new Error(error.message);
let rows = ((data ?? []) as unknown as (Row & { domain_key: string | null })[]).filter((r) => !only || only.has((r.domain_key ?? r.domain).toLowerCase()));
rows = rows.slice(0, limit);
console.log(`${rows.length} store(s) parked as no_image${dry ? " (dry run)" : ""}`);
if (dry) {
  for (const r of rows) console.log(`  · ${r.status.padEnd(7)} ${r.domain_key ?? r.domain}`);
  process.exit(0);
}

// ── browser (own profile, own process tree) ──────────────────────────────────────────────
const puppeteer = (await import("puppeteer-core")).default;
const profile = mkdtempSync(join(tmpdir(), "ev-hero-"));
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  userDataDir: profile,
  args: ["--no-first-run", "--disable-extensions", "--mute-audio", "--hide-scrollbars", "--disable-background-networking", "--lang=en-US"],
  defaultViewport: { width: W, height: H },
});
const pid = browser.process()?.pid;
console.log(`browser started (pid ${pid})`);

function pidAlive(p: number): boolean {
  try {
    return execFileSync("tasklist", ["/FI", `PID eq ${p}`, "/NH"], { encoding: "utf8" }).includes(String(p));
  } catch {
    return false;
  }
}
async function shutdown() {
  try {
    await browser.close();
  } catch {
    /* already closed */
  }
  if (pid && pidAlive(pid)) {
    try {
      execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"]);
    } catch {
      /* gone */
    }
  }
  rmSync(profile, { recursive: true, force: true });
}
process.on("SIGINT", async () => {
  await shutdown();
  process.exit(130);
});

type Res = { domain: string; ok: boolean; note: string; file?: string };
const results: Res[] = [];
const BOT_WALL = /access denied|forbidden|captcha|verify you are human|just a moment|attention required|are you a robot|unusual traffic|pardon our interruption|request blocked|security check|px-captcha|not available in your/i;

try {
  for (let n = 0; n < rows.length; n++) {
    const row = rows[n];
    const dom = row.domain_key ?? row.domain;
    const page = await browser.newPage();
    let res: Res;
    try {
      await page.evaluateOnNewDocument("window.__name = (f) => f;"); // esbuild helper used inside evaluate() callbacks
      await page.setUserAgent(UA);
      await page.setViewport({ width: W, height: H });
      const resp = await page.goto(row.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      const status = resp?.status() ?? 0;
      await page.waitForNetworkIdle({ idleTime: 1200, timeout: 8000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 2000));

      const gate = await page.evaluate(() => ({ title: document.title, text: (document.body?.innerText ?? "").slice(0, 600) }));
      if (status >= 400) throw Object.assign(new Error(`HTTP ${status}`), { reject: true });
      if (BOT_WALL.test(gate.title) || BOT_WALL.test(gate.text)) throw Object.assign(new Error(`bot wall ("${gate.title.slice(0, 40)}")`), { reject: true });

      // 1) dismiss cookie banners / popups with their own buttons (reject/decline before accept).
      await page.evaluate(() => {
        const CONSENT = /cookie|consent|gdpr|privacy|onetrust|usercentrics|osano|trustarc|cc-|cmp|didomi|truste|iubenda|klaro/i;
        const NEG = /^(reject( all)?|decline( all)?|deny|only (strictly )?necessary|necessary only|essential only|no,? thanks|refuse|continue without accepting)\b/i;
        const POS = /^(accept( all)?( cookies)?|agree|i agree|allow( all)?|got it|ok(ay)?|continue|understood|close)\b/i;
        const visible = (el: Element) => {
          const r = (el as HTMLElement).getBoundingClientRect();
          const s = getComputedStyle(el as HTMLElement);
          return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
        };
        const ctxOf = (el: Element) => {
          let p: Element | null = el;
          for (let i = 0; p && i < 8; i++, p = p.parentElement) {
            const sig = `${p.id} ${typeof p.className === "string" ? p.className : ""} ${p.getAttribute("role") ?? ""} ${p.getAttribute("aria-label") ?? ""}`;
            if (CONSENT.test(sig) || p.getAttribute("role") === "dialog" || p.getAttribute("aria-modal") === "true") return true;
          }
          return false;
        };
        const btns = [...document.querySelectorAll("button, [role=button], a[role=button], input[type=button]")].filter(visible);
        const label = (b: Element) => ((b as HTMLElement).innerText || (b as HTMLInputElement).value || b.getAttribute("aria-label") || "").trim();
        const inCtx = btns.filter(ctxOf);
        const pick = inCtx.find((b) => NEG.test(label(b))) ?? inCtx.find((b) => POS.test(label(b)));
        (pick as HTMLElement | undefined)?.click();
        // newsletter / promo modals: a visible close button inside a dialog
        const close = btns.find((b) => ctxOf(b) && /^(×|✕|x|close|dismiss|no thanks)$/i.test(label(b)));
        (close as HTMLElement | undefined)?.click();
      });
      await page.keyboard.press("Escape").catch(() => {});
      await new Promise((r) => setTimeout(r, 1500));

      // 2) anything big still covering the viewport? (fixed overlay ≥ 12% of the screen, or a visible modal)
      const overlay = await page.evaluate(
        (vw, vh) => {
          const found: string[] = [];
          for (const el of Array.from(document.querySelectorAll("body *"))) {
            const s = getComputedStyle(el as HTMLElement);
            if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) continue;
            const modal = el.getAttribute("role") === "dialog" || el.getAttribute("aria-modal") === "true";
            if (s.position !== "fixed" && !modal) continue;
            const r = (el as HTMLElement).getBoundingClientRect();
            const w = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
            const h = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
            const frac = (w * h) / (vw * vh);
            const header = r.top <= 2 && r.height <= 170; // sticky header / announcement bar
            if (!header && frac >= (modal ? 0.08 : 0.12)) found.push(`${el.tagName.toLowerCase()}#${el.id || ""}.${String(el.className).slice(0, 30)} ${(frac * 100) | 0}%`);
          }
          // slide-in cart / menu drawers are often position:absolute or transformed (skinfix.com opened its
          // cart on load): catch any visible element that LOOKS like a drawer and covers ≥ 12 % of the screen
          for (const el of Array.from(document.querySelectorAll("[id*='cart' i],[class*='cart-drawer' i],[class*='drawer' i],[class*='minicart' i],[class*='mini-cart' i]"))) {
            const s = getComputedStyle(el as HTMLElement);
            if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) continue;
            const r = (el as HTMLElement).getBoundingClientRect();
            const w = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
            const h = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
            if ((w * h) / (vw * vh) >= 0.12 && r.height > vh * 0.5) found.push(`drawer#${el.id}.${String(el.className).slice(0, 30)} ${(((w * h) / (vw * vh)) * 100) | 0}%`);
          }
          return found.slice(0, 3);
        },
        W,
        H,
      );
      if (overlay.length) throw Object.assign(new Error(`overlay still covering the hero (${overlay[0]})`), { reject: true });

      // 3) viewport screenshot of the hero
      const shot = Buffer.from(await page.screenshot({ type: "jpeg", quality: 85, clip: { x: 0, y: 0, width: W, height: H } }));
      const saved = await saveHeroImage(row, { buf: shot, mediaType: "image/jpeg", source: "capture" }, { hold: true, countAttempt: false });
      const file = join(outDir, `${saved.ok ? "ok" : "rej"}_${dom}.jpg`);
      writeFileSync(file, shot);
      res = { domain: dom, ok: saved.ok, note: saved.ok ? "saved (held)" : saved.note ?? "rejected", file };
    } catch (e) {
      const err = e as Error & { reject?: boolean };
      // a stamp only (no attempt counted): the row stays exactly as it was for a manual upload
      await saveHeroImage(row, null, { countAttempt: false, failNote: err.message }).catch(() => {});
      res = { domain: dom, ok: false, note: err.message.split("\n")[0].slice(0, 120) };
    } finally {
      await page.close().catch(() => {});
    }
    results.push(res);
    console.log(`  ${res.ok ? "✓" : "✗"} ${dom.padEnd(26)} ${res.note}`);
    if (n < rows.length - 1) await new Promise((r) => setTimeout(r, PAUSE_MS));
  }
} finally {
  await shutdown();
}

writeFileSync(join(outDir, "results.json"), JSON.stringify(results, null, 2));
const left = pid ? pidAlive(pid) : false;
console.log(`\nDone: ${results.filter((r) => r.ok).length} accepted, ${results.filter((r) => !r.ok).length} failed. Browser process (pid ${pid}) still running: ${left ? "YES" : "no"}.`);
