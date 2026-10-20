/**
 * TEMPORARY — QA preview for docs/FIX-correos-recuperacion-checkout.md (Fase C).
 * Renders the three abandoned-checkout recovery emails to HTML (+ the plain-text
 * part) so they can be eyeballed in a browser. Not part of the app: delete this
 * file once the email QA is done.
 *
 *   npx tsx scripts/render-abandoned-checkout-preview.mts [outDir]
 *
 * outDir defaults to <os tmp>/elitevault-email-preview so nothing lands in git.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildAbandonedCheckout } from "../lib/email/abandoned-checkout";

const outDir = resolve(process.argv[2] ?? join(tmpdir(), "elitevault-email-preview"));
mkdirSync(outDir, { recursive: true });

const appUrl = "https://elitevaultapp.com";

// Mix plans/intervals so one pass shows the monthly label, the annual label
// and the short step-3 variant.
const cases = [
  { step: 1, plan: "pro", interval: "month", price: 19 },
  { step: 2, plan: "scale", interval: "year", price: 278 },
  { step: 3, plan: "pro", interval: "month", price: 19 },
] as const;

for (const c of cases) {
  const { subject, html, text } = buildAbandonedCheckout({
    plan: c.plan,
    price: c.price,
    interval: c.interval,
    step: c.step,
    appUrl,
    recoveryUrl: `${appUrl}/app/checkout?plan=${c.plan}&interval=${c.interval}`,
    unsubscribeUrl: `${appUrl}/api/email/unsubscribe?sid=cs_test_preview&t=preview`,
  });
  const htmlPath = join(outDir, `paso${c.step}.html`);
  writeFileSync(htmlPath, html);
  writeFileSync(join(outDir, `paso${c.step}.txt`), `Subject: ${subject}\n\n${text}\n`);
  console.log(`paso${c.step} (${c.plan}/${c.interval}) → ${htmlPath}\n  subject: ${subject}`);
}
