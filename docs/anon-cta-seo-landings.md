# WP-1 — SEO landings now run the real anonymous audit

Closes §3 of `docs/analyzer-anon-free-audit-brief.md`. Companion docs:
`docs/analyzer-latency.md` (§4/WP-5, still open), `docs/infra-debt.md`
(typecheck, deliberately out of scope here).

Branch: `fix/seo-landing-anon-cta`, based on `main` @ `efbf53e`.

---

## 1. What was actually wrong

The homepage hero ran a real audit inline with no account
(`createAnonAnalysis()` → `/audit/[id]`). Every dedicated SEO landing instead
linked to `/sign-up`, so the pages built to rank for "free shopify store
audit" demanded an account before showing anything — while their own on-page
copy promised the opposite ("FREE WEBSITE AUDIT · NO CREDIT CARD").

The brief's §3 table was verified line by line and is accurate.

## 2. What changed

`components/marketing/anon-audit-box.tsx` (new) is the homepage hero's audit
box, extracted verbatim. Same server action, same Inngest pipeline, same
`/audit/[id]` reveal — no new flow, no backend change. `hero.tsx` now consumes
it instead of its own private copy, so there is one implementation, not two.

| Page | CTAs rewired | Notes |
|---|---|---|
| `/free-website-audit` | 2 (hero + final) | |
| `/meta-ads-forecast` | 2 (hero + final) | free audit already carries the modeled ROAS range |
| `/ai-buyer-persona-simulator` | 2 (hero + final) | persona sim is part of the free audit |
| `/convertmate-alternative` | 2 (hero + final) | copy is hardcoded EN, not i18n |
| `/winning-shopify-stores/[niche]` | 1 (hero) | |
| `/winning-shopify-stores` (hub) | **0 — deliberately unchanged** | see §3 |

Each box keeps the page's own CTA label and caption (so the SEO/persona-tuned
wording survives) and adds a quiet `/sign-up` fallback link for visitors who
click without pasting a URL, per the brief. New i18n key `hero.signUpFallback`
in EN + ES.

The per-IP daily anon limit needs no change: it is enforced server-side in
`checkAnonAuditRate()`, so it applies across all these pages for free.

## 3. Deliberate deviation — the `/winning-shopify-stores` hub

The brief's table lists the hub's two CTAs as part of the bug. They are not,
and they were left alone:

- Both point at `/sign-up?next=/app/library`, and both CTA labels are
  library-intent ("Browse winning stores", and a final card whose body is
  "Browse 3 hand-picked winners free, then unlock the full library…").
- **There is no anonymous Library to route them to.** `middleware.ts` →
  `lib/supabase/middleware.ts:113`: `if (isApp && !user)` redirects any
  `/app/*` path to `/sign-in?next=…`. So `/sign-up` is the correct
  destination for that intent, not a leak.

Replacing them with an audit box would have contradicted the page's own
promise. The `[niche]` child page *was* rewired, because its single CTA is
audit-intent ("Audit my store free", and its copy ends "run the same audit on
your own store, free").

Flagging it rather than silently applying the table — if the owner wants an
audit box added to the hub *in addition to* the library CTA, that is a copy
decision, not a bug fix.

## 4. Spot-check of brief §2.2 (Library free-tier cap) — passes, brief was wrong about where

The brief asked for a 5-minute check of `libraryFullMetricsCap: 3` and flagged
it as "client-side cap enforcement in `components/library/library-view.tsx`,
not traced line by line".

It is **not enforced client-side at all**. The cap is applied server-side in
`app/actions/search.ts:186-193`, inside the `searchLibrary()` server action:

```
const cap = PLANS[plan].libraryFullMetricsCap;
let unlocked = 0;
items = items.map((it) => {
  if (cap === null) return { ...it, metrics_locked: false };
  const canUnlock = it.is_preselected && unlocked < cap;
  if (canUnlock) unlocked++;
  return { ...it, metrics_locked: !canUnlock };
});
```

And `plan` is not accepted from the caller — it is derived from the session
inside the same action (`search.ts:88-95`: `getUser()` → `profiles.plan`,
defaulting to `"free"`). So the cap is not spoofable from the client, and the
`plan` prop passed into `LibraryView` is presentational only.

**Result: stronger than the brief assumed. No change needed.**

## 5. Line-endings (brief's §7.1 / "before starting")

The brief warned about ~362 files showing as modified from a CRLF/LF mismatch
and asked for an isolated `chore/` fix. **That state no longer exists.** On a
clean checkout of `main`, `git status --porcelain` returns a single entry (the
untracked brief itself). `core.autocrlf=true` comes from the system gitconfig
(`C:/Program Files/Git/etc/gitconfig`); there is no `.gitattributes`. The
`warning: LF will be replaced by CRLF` lines git prints are informational and
do not dirty the tree.

No `chore/` branch was needed, and none was created. If the 362-file state
returns, that is when to revisit `.gitattributes` — not pre-emptively.

## 6. Verification

Measured on this branch, not assumed:

| Gate | Baseline (`main` @ efbf53e) | After | Result |
|---|---|---|---|
| `npm run typecheck` | 252 errors | 252 errors | **0 new**; none in touched files |
| `npm test` | 252 pass / 0 fail | 252 pass / 0 fail | unchanged |
| `npm run lint` | 2 errors, 114 warnings | same | 0 problems in touched files |
| `npm run build` | — | succeeds | all routes emitted |

Typecheck baseline measured by stashing the branch's changes and re-running,
not quoted from `docs/infra-debt.md` (which says 258, at a different commit).

Browser verification, dev server on port 3100 from this worktree (port 3000
deliberately left alone — a parallel session owns that checkout):

- All 6 pages return `GET … 200`, zero server errors, zero console errors.
- Audit box present: 2 on each of `/free-website-audit`,
  `/meta-ads-forecast`, `/ai-buyer-persona-simulator`,
  `/convertmate-alternative`; 1 on `/winning-shopify-stores/apparel`;
  **0 on `/winning-shopify-stores`**, whose "Browse winning stores" CTA is
  still intact.
- **The box really calls the server action**, it is not decorative: submitting
  `notavalidhost` produced `POST /free-website-audit 200` in the dev log and
  the toast "Enter a full domain, e.g. yourstore.com." — that string comes
  from `validatePublicStoreUrl()`, server-side. An invalid host was used on
  purpose: it is rejected before any DB write, and `.env.local` points at
  the production Supabase project.
- Centered final-CTA variant measured in the DOM: 576px wide (`max-w-xl`),
  200px gutters both sides, fallback link present.
- Homepage hero re-verified after the extraction: renders identically, and
  Enter-to-submit fires the handler (confirmed with a native `keydown`; the
  browser automation's synthetic key event does not reach React, which is a
  tooling artifact and not a product bug — it behaves the same on `main`).

## 7. What this does NOT prove

- **No end-to-end anonymous audit was run.** Every submit tested was
  intentionally rejected at URL validation, so nothing reached Inngest,
  Gemini or the `analyses` table. A full anonymous → report → gating run is
  the brief's §5 checklist and belongs against production, on the 5-store
  reference set from `docs/analyzer-latency.md` §5.
- **No conversion claim.** The brief's "very likely costing real signups" is a
  hypothesis. Each box emits `anon_audit_started` with a distinct `source`
  (`free-website-audit-hero`, `…-final`, etc.), so the effect is measurable in
  PostHog once deployed — measure it before claiming it.

## 8. Not touched

Nothing under `app/(app)/app/liquid`, `ai/agents/liquid-block-agent.ts`,
`inngest/functions/blocks-preview.ts`, `components/**/blocks-*`,
`components/**/liquid-*`, or `app/api/blocks-projects`. `app/api/inngest/route.ts`
(the one shared file anticipated by the brief) was **not** modified either —
this work needed no change there.
