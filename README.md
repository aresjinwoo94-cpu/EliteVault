# EliteVault

> **Copy what's actually converting.** AI-powered audit, curated library of winning ecommerce stores, and a Meta-Ads-grade conversion analyzer that thinks like a senior media buyer.

A production-ready Next.js 15 SaaS built with Claude (Anthropic), Stripe, Supabase, and Inngest.

---

## ✨ What's inside

- **Analyzer** — paste a URL → annotated screenshot, 4-scenario conversion estimate, buyer-persona simulation, top-impact fixes.
- **Meta Campaign Scenario Modeler** (Scale, v3.0) — feed AOV + daily budget; get a 7-day, 3-scenario (conservative / balanced / aggressive) projection with day-by-day spend, ROAS, CPA and risks. AI estimates, not predictions.
- **Meta Ads Optimizer** (Scale) — CPC/CPM/CTR/ROAS targets + creative angles + sequential testing plan, calibrated to your audit.
- **Library** — AI-curated winning ecommerce stores with Ad Activity proxy signals. Free tier sees 9 hand-picked previews.
- **Intelligent Search** — text prompts + image-similarity search, AI re-ranked.
- **Community feed** — publish audits, browse what other founders are tearing apart, **Compare Mode** for 2-3 side-by-side.
- **REST API** (Scale) — bearer-token endpoints for embedding the Analyzer into your stack.
- **3 plans** — Free / Pro $19 / Scale $29 with Stripe Checkout + Customer Portal.

## 🧱 Stack

| Layer | Tool |
|---|---|
| Framework | Next.js 16 (App Router, Server Components, Server Actions) |
| Styling | Tailwind CSS + custom design tokens + Framer Motion |
| UI | shadcn/ui (custom-tuned) + Radix primitives |
| Auth | Supabase Auth (email + Google OAuth) |
| Database | Supabase Postgres + pgvector + RLS |
| AI | Provider-agnostic — Gemini (default) or Claude. Vision, structured JSON, tool calling. |
| Async jobs | Inngest (retries + automatic credit refunds) |
| Payments | Stripe — Checkout, Webhooks, Customer Portal |
| Deploy | Vercel |

## 🚀 Setup in 10 minutes

### 1. Install

```bash
npm install
cp .env.example .env.local
```

### 2. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Project Settings → API → copy the URL + anon key + service-role key into `.env.local`.
3. SQL Editor → paste the contents of [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) and run.
4. (Optional) Paste [`supabase/seed.sql`](supabase/seed.sql) to populate the Library with 12 showcase sites.
5. Authentication → Providers → enable **Email** and **Google** (add your OAuth credentials).
6. Authentication → URL Configuration → add `http://localhost:3000/auth/callback` to "Redirect URLs".

### 3. Stripe

1. Create an account at [stripe.com](https://stripe.com) (test mode is fine).
2. Copy `STRIPE_SECRET_KEY` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` into `.env.local`.
3. Create products & prices automatically:
   ```bash
   npm run stripe:seed
   ```
   Paste the printed price IDs into `.env.local`.
4. For local webhooks, install the [Stripe CLI](https://stripe.com/docs/stripe-cli) then run:
   ```bash
   npm run stripe:listen
   ```
   Copy the `whsec_…` it prints into `STRIPE_WEBHOOK_SECRET`.

### 4. Anthropic

1. Get an API key at [console.anthropic.com](https://console.anthropic.com).
2. Set `ANTHROPIC_API_KEY` in `.env.local`. Optionally override `ANTHROPIC_MODEL` (default: `claude-opus-4-7`).

### 5. Inngest (optional in local dev)

The Analyzer queues long-running jobs via Inngest. For local dev, run the dev server:
```bash
npm run inngest:dev
```
Open the UI at [http://localhost:8288](http://localhost:8288).

For production, create a free account at [inngest.com](https://inngest.com), grab your event key + signing key, and put them in `.env.local`.

### 6. (Optional) Screenshots service

The Analyzer captures the user's URL as a screenshot. By default it uses the free WordPress mshots fallback (lower fidelity, sometimes shows "generating" placeholder). For production-grade screenshots, sign up at [screenshotone.com](https://screenshotone.com) and set `SCREENSHOTONE_ACCESS_KEY`.

### 7. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign up → run your first analysis → upgrade with the Stripe test card `4242 4242 4242 4242`.

---

## 🗂 Project structure

```
elitevault/
├── app/
│   ├── (auth)/                  ← Auth shell (sign-in, sign-up, callback)
│   ├── (app)/app/               ← Authenticated dashboard
│   │   ├── analyzer/[id]/       ← Analysis detail view
│   │   ├── library/             ← Winning sites + search
│   │   ├── billing/             ← Plan + Customer Portal
│   │   └── settings/
│   ├── api/
│   │   ├── stripe/              ← checkout, portal, webhook
│   │   ├── analyses/[id]/       ← analyzer polling endpoint
│   │   ├── meta-simulations/[id]/ ← scenario modeler polling endpoint
│   │   ├── v1/                  ← Scale-plan REST API (bearer tokens)
│   │   └── inngest/             ← Inngest function handler
│   ├── actions/                 ← Server actions
│   ├── pricing/                 ← Public pricing page
│   ├── layout.tsx + page.tsx    ← Root + landing
│   ├── globals.css
│   ├── not-found.tsx
│   └── error.tsx
├── ai/
│   ├── agents/                  ← Analyzer, Rewrite, Search agents
│   ├── prompts.ts               ← System prompts
│   ├── schemas.ts               ← Zod + tool input_schema
│   └── anthropic.ts             ← SDK client
├── components/
│   ├── ui/                      ← shadcn primitives
│   ├── marketing/               ← Landing page sections
│   ├── auth/
│   ├── dashboard/               ← Sidebar, topbar, command menu
│   ├── analyzer/                ← Star feature components
│   ├── library/
│   ├── billing/
│   ├── settings/
│   └── brand/                   ← Logo
├── inngest/
│   ├── client.ts
│   └── functions/
│       ├── analyze-website.ts
│       └── run-meta-simulation.ts
├── lib/
│   ├── supabase/                ← server, client, middleware, types
│   ├── stripe/                  ← client + plan catalog
│   ├── screenshot.ts
│   ├── fonts.ts
│   └── utils.ts
├── supabase/
│   ├── migrations/  ← 0001 init → 0005 meta_simulations
│   └── seed.sql
├── scripts/seed-stripe.ts
├── middleware.ts
├── next.config.ts
├── tailwind.config.ts
└── package.json
```

## 🔐 Security model

- **RLS everywhere.** Profiles, subscriptions, analyses, meta_simulations, search history — every row is gated by `auth.uid()`.
- **Webhook idempotency.** `stripe_events` table with `UNIQUE` on `event.id` makes double-deliveries no-ops.
- **Ownership defense in depth.** Server actions validate analysis ownership before queueing Inngest events; the Inngest functions re-validate before persisting (events can be replayed).
- **Service role is server-only.** `SUPABASE_SERVICE_ROLE_KEY` never reaches the browser.

## 🧠 How the AI is integrated

This isn't an "AI wrapper". The integration is structural:

1. **Provider abstraction.** `ai/provider.ts` exposes a `generateStructured` interface implemented by both Gemini and Anthropic adapters. Switch with `AI_PROVIDER=gemini|anthropic`. Same agents, two backends.
2. **Tool-forced JSON output.** Every agent calls a single function-declaration / tool with a strict JSON schema. The model can't ramble — it must produce the structured payload. Zod validates as a final guardrail.
3. **Vision first.** The Analyzer receives 1–3 actual screenshots (homepage + discovered product pages) as base64 image parts. It scores against a real CRO rubric encoded in the system prompt.
4. **Normalized coordinates.** Annotations come back as `{x, y, width, height}` in 0..1 space — we render the SVG overlay deterministically. The model doesn't "draw"; we do, from its measurements. A defensive `normalizeCoords()` rescales if the model ever returns pixels.
5. **Two-model split.** Heavy reasoning (Analyzer, Meta Ads Optimizer) → main model. Re-ranking / niche detection / Scenario Modeler → Flash-Lite tier (`fast: true`).
6. **Long jobs go to Inngest.** Vercel can timeout — Inngest runs the analyzer + the Scenario Modeler as durable steps. Failed analyses **refund the credit automatically** via `onFailure`.

## 💳 Stripe flow

```
User clicks "Upgrade to Pro"
  → POST /api/stripe/checkout    (creates session)
  → Stripe Checkout (hosted)
  → Stripe redirects to /app/billing?checkout=success
  → Stripe webhook → POST /api/stripe/webhook
      → dedup by event.id (UNIQUE constraint)
      → upsert subscription
      → grant monthly credits on invoice.payment_succeeded
      → set profile.plan = pro|scale
```

## 🚢 Deploy to Vercel

```bash
vercel
```

Add all `.env.local` keys to Vercel project settings. Set the Stripe webhook endpoint to:
```
https://your-domain.com/api/stripe/webhook
```
and the Supabase OAuth redirect to:
```
https://your-domain.com/auth/callback
```

For Inngest production, set the Inngest endpoint to `https://your-domain.com/api/inngest` and configure event/signing keys.

## 🧠 v2 — Community + Meta Ads + API

### Community feed
- After every successful audit (Pro+), users can **Publish to Community**.
- Published audits live in `community_analyses` as immutable snapshots
  (denormalized — the source row stays private).
- Anyone signed in can browse, filter by niche, sort by score/views.
- **Compare Mode**: select 2-3 cards (＋ button) → side-by-side view of
  scores, scenarios, category breakdowns, persona reactions and top fixes.
- Report flow auto-hides after 3 reports.

### Meta Ads Optimizer (Scale plan)
- Runs automatically as the third stage of the Inngest pipeline when the
  user is on Scale. Outputs CPC/CPM/CTR/ROAS targets, audience seed,
  3-5 creative angles, sequential testing plan, and honest caveats.
- Stored in `analyses.meta_ads`, rendered in the analyzer left column.

### REST API (Scale plan)
- Endpoints: `POST /api/v1/analyses` and `GET /api/v1/analyses/[id]`.
- Bearer auth via SHA-256 hashed tokens (`ev_live_…`).
- Manage keys at `/app/settings/api-keys`.

### Library expansion
Run `npm run library:expand -- "<niche>" -n 10` to ask Claude/Gemini to
discover candidate stores in a niche and upsert them into `winning_sites`
with **estimated** Ad Activity signals (marked `estimated: true` in UI).

## 🔮 v3.0 — Meta Campaign Scenario Modeler

The headline feature for Scale plan. Given a completed audit + the
user's AOV + daily budget, the modeler returns a **7-day, 3-scenario**
Meta Ads projection — conservative, balanced, aggressive — with
day-by-day spend, impressions, CTR, CPC, CPM, ROAS, CPA, sales, and
risk callouts.

### Why "Scenario Modeler" not "Simulator"
We deliberately avoid the word *simulator* in user-facing copy. These
are AI **estimates** calibrated on the audit score and niche benchmarks,
not financial predictions. The agent enforces hard plausibility bounds
(ROAS ≤ 6x, CTR ≤ 8%, math consistency between spend/purchases/revenue)
and every output ships with a "not a prediction" disclaimer.

### Architecture
- **3 parallel Gemini Flash-Lite calls**, one per variant — keeps each
  JSON output at ~3–5KB (Flash-Lite's structured-output sweet spot)
  instead of the 12–15KB combined output that truncates ~30% of the time.
- Partial-success orchestrator: if 1 of 3 scenarios fails schema
  validation, the other 2 still ship with the error surfaced as a
  soft warning. Only an all-3-failed run flips status to `failed`.
- Durable Inngest function with stale-job timeout (5 min) and
  ownership re-validation on event replay.
- Hand-rolled SVG chart — no recharts (~25KB saved) and full control
  over the brand-gold revenue / teal-dashed spend visualization.

### Trying it
1. As a Scale-plan user, run a normal analysis to completion.
2. Scroll down past the audit body — the form sits at the bottom.
3. Enter AOV ($45), daily budget ($50), optional margin & notes.
4. The 3 scenario cards appear after ~10–20 seconds (one card may
   land slightly later than the others — they're independent calls).
5. Hit "Re-run" with new inputs anytime — each run creates a fresh
   `meta_simulations` row.

Tables: `meta_simulations` (migration `0005`). Polling: `GET /api/meta-simulations/[id]`. Server action: `triggerSimulation` in [`app/actions/meta-simulator.ts`](app/actions/meta-simulator.ts).

## 🛣 What's next

- [ ] Real Meta Ad Library API integration (replace estimated signals)
- [ ] Inngest cron for weekly Library refresh + "Store of the Week" digest
- [ ] Slack / email notifications when analysis completes
- [ ] Calibrate the Scenario Modeler against real Meta campaign data once we have customer attribution exports
- [ ] "Steal This Section" — paste a Library card → Gemini returns Tailwind/HTML you can ship

## 📝 License

MIT — go build something great.
