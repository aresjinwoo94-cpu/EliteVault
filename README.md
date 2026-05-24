# EliteVault

> **Copy what's actually converting.** AI-powered audit, curated library of winning ecommerce stores, and a Meta-Ads-grade conversion analyzer that thinks like a senior media buyer.

A production-ready Next.js 15 SaaS built with Claude (Anthropic), Stripe, Supabase, and Inngest.

---

## ✨ What's inside

- **Analyzer** — paste a URL → annotated screenshot, 4-scenario conversion estimate, buyer-persona simulation, top-impact fixes.
- **Auto-Rewrite** (Scale) — Claude drafts a redesigned hero/PDP next to yours.
- **Meta Ads Optimizer** (Scale) — CPC/CPM/CTR/ROAS targets + creative angles + sequential testing plan, calibrated to your audit.
- **Library** — AI-curated winning ecommerce stores with Ad Activity proxy signals. Free tier sees 8 hand-picked previews.
- **Intelligent Search** — text prompts + image-similarity search, AI re-ranked.
- **Community feed** — publish audits, browse what other founders are tearing apart, **Compare Mode** for 2-3 side-by-side.
- **REST API** (Scale) — bearer-token endpoints for embedding the Analyzer into your stack.
- **3 plans** — Free / Pro $19 / Scale $49 with Stripe Checkout + Customer Portal.

## 🧱 Stack

| Layer | Tool |
|---|---|
| Framework | Next.js 15 (App Router, Server Components, Server Actions) |
| Styling | Tailwind CSS + custom design tokens + Framer Motion |
| UI | shadcn/ui (custom-tuned) + Radix primitives |
| Auth | Supabase Auth (magic link + Google OAuth) |
| Database | Supabase Postgres + pgvector + RLS |
| AI | Claude (Anthropic) — vision, streaming, tool calling |
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
│   │   ├── analyses/[id]/       ← polling endpoint
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
│   └── functions/analyze-website.ts
├── lib/
│   ├── supabase/                ← server, client, middleware, types
│   ├── stripe/                  ← client + plan catalog
│   ├── screenshot.ts
│   ├── fonts.ts
│   └── utils.ts
├── supabase/
│   ├── migrations/0001_init.sql
│   └── seed.sql
├── scripts/seed-stripe.ts
├── middleware.ts
├── next.config.ts
├── tailwind.config.ts
└── package.json
```

## 🔐 Security model

- **RLS everywhere.** Profiles, subscriptions, analyses, search history — every row is gated by `auth.uid()`.
- **Webhook idempotency.** `stripe_events` table with `UNIQUE` on `event.id` makes double-deliveries no-ops.
- **No untrusted HTML in DOM.** Auto-Rewrite HTML/CSS renders inside an `<iframe srcDoc>` sandbox.
- **Service role is server-only.** `SUPABASE_SERVICE_ROLE_KEY` never reaches the browser.

## 🧠 How Claude is integrated

This isn't an "AI wrapper". The integration is structural:

1. **Tool-forced JSON output.** Every agent uses `tool_choice: { type: "tool", name: "submit_xxx" }` with a strict JSON schema. The model can't ramble — it must call the tool. Zod validates as a final guardrail in [`ai/schemas.ts`](ai/schemas.ts).
2. **Vision first.** The Analyzer receives the actual screenshot as a base64 image part. It scores against a real CRO rubric encoded in the [system prompt](ai/prompts.ts).
3. **Normalized coordinates.** Claude returns `{x, y, width, height}` in 0..1 space — we render the SVG overlay deterministically with [`components/analyzer/annotations-overlay.tsx`](components/analyzer/annotations-overlay.tsx). Claude doesn't "draw"; we do, from its measurements.
4. **Two-model split.** Heavy reasoning (Analyzer, Rewrite) → Opus. Re-ranking / search → Haiku. Defined in `ANTHROPIC_MODEL` and `ANTHROPIC_MODEL_FAST`.
5. **Long jobs go to Inngest.** Vercel can timeout — Inngest runs the pipeline as durable steps. Failed analyses **refund the credit automatically** via `onFailure`.

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
- Stored in `analyses.meta_ads`, rendered below the Auto-Rewrite panel.

### REST API (Scale plan)
- Endpoints: `POST /api/v1/analyses` and `GET /api/v1/analyses/[id]`.
- Bearer auth via SHA-256 hashed tokens (`ev_live_…`).
- Manage keys at `/app/settings/api-keys`.

### Library expansion
Run `npm run library:expand -- "<niche>" -n 10` to ask Claude/Gemini to
discover candidate stores in a niche and upsert them into `winning_sites`
with **estimated** Ad Activity signals (marked `estimated: true` in UI).

## 🛣 What's next

- [ ] Real Meta Ad Library API integration (replace estimated signals)
- [ ] Embeddings job for image-similarity search (pgvector index already exists)
- [ ] Inngest cron for weekly Library refresh
- [ ] Slack notifications when analysis completes

## 📝 License

MIT — go build something great.
