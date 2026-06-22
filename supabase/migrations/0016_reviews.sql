-- ══════════════════════════════════════════════════════════════════════════
-- EliteVault — 0016 Reviews
--
-- A self-owned reviews system the owner controls completely from /app/owner:
--   • reviews            — submitted testimonials (moderated)
--   • review_settings    — a single config row driving the PUBLIC surface
--
-- Both tables are SERVICE-ROLE ONLY (RLS enabled, NO policies) — exactly like
-- page_views / support. Every read and write goes through server code (server
-- actions + server components) using the service client, never the anon key.
-- That means: no anon can read pending/hidden reviews, no anon can write
-- directly, and the public list is computed server-side from approved rows.
--
-- Idempotent: safe to re-run (CREATE ... IF NOT EXISTS, DROP POLICY IF EXISTS).
-- ══════════════════════════════════════════════════════════════════════════

-- ── reviews ────────────────────────────────────────────────────────────────
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  author_name text not null,
  -- Kept private (owner-only): used to reply / verify, never shown publicly.
  author_email text,
  rating int not null default 5 check (rating between 1 and 5),
  title text,
  body text not null,
  -- Lifecycle: pending (default) → approved (public) | hidden (kept, not shown).
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'hidden')),
  -- Featured reviews float to the top of the public list.
  featured boolean not null default false,
  source text not null default 'site',
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

create index if not exists reviews_status_idx
  on public.reviews(status, featured desc, created_at desc);

alter table public.reviews enable row level security;
-- No policies on purpose: only the service role (server) can touch this table.

-- ── review_settings (single row) ───────────────────────────────────────────
-- The `id boolean primary key default true check (id)` trick enforces exactly
-- one settings row — the owner edits it; the public surface reads it.
create table if not exists public.review_settings (
  id boolean primary key default true check (id),
  -- Master switch. OFF = the ENTIRE public reviews section disappears
  -- (heading, form, list — everything). Nothing leaks.
  enabled boolean not null default true,
  -- Show the "leave a review" form.
  show_form boolean not null default true,
  -- Show the approved-reviews list.
  show_list boolean not null default true,
  -- Max approved reviews shown publicly.
  display_count int not null default 6 check (display_count between 0 and 60),
  -- Hide approved reviews below this rating from the PUBLIC list (owner can
  -- still see them in the panel). 1 = show all.
  min_rating int not null default 1 check (min_rating between 1 and 5),
  -- If true, new submissions go straight to 'approved'. If false (default),
  -- they land as 'pending' and the owner approves them by hand.
  auto_approve boolean not null default false,
  -- Optional custom copy; null → the app falls back to its i18n defaults.
  heading text,
  subheading text,
  updated_at timestamptz not null default now()
);

alter table public.review_settings enable row level security;
-- No policies: service-role only.

-- Seed the single settings row (no-op if it already exists).
insert into public.review_settings (id) values (true)
on conflict (id) do nothing;
