-- ──────────────────────────────────────────────────────────────────────────
-- Liquid Blocks WP-A — one row per "a user pointed us at a product page".
--
-- Deliberately its own table rather than a column set bolted onto `analyses`.
-- Blocks is a separate tool: it has a different unit of work (one PRODUCT page,
-- never a store), a different lifecycle (free preview now, paid export later or
-- never), and a different failure mode (a failed preview costs nothing and is
-- simply retried, where a failed audit has to refund a credit). Sharing the
-- audit table would have made every Analyzer query filter around rows that
-- aren't audits.
--
-- What lives here:
--   product_json   — the payload from Shopify's public /products/<handle>.js,
--                    normalized by lib/blocks/product-json.ts. This is the ONLY
--                    source of product facts in the feature; persisting it means
--                    the preview and the later export agree on the same numbers
--                    instead of re-fetching a store that may have changed.
--   design_tokens  — populated by WP-B from getComputedStyle on the real page.
--                    Null until then. These are what style the block; nothing
--                    downstream may substitute a colour of its own.
--
-- RLS on with owner-only policies (auth.uid() = user_id), matching every other
-- user-owned table here. The Inngest worker writes through the service client,
-- which bypasses RLS by design.
--
-- Idempotent; rollback in supabase/rollbacks/0032_blocks_projects_rollback.sql.
-- ──────────────────────────────────────────────────────────────────────────

create table if not exists public.blocks_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_url text not null,
  product_handle text not null,
  product_json jsonb,
  design_tokens jsonb,
  status text not null default 'queued',
  -- Why a preview failed, in the user's language. Null while it hasn't.
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The status vocabulary is closed on purpose: the UI switches on it, and a typo
-- in a worker ('capture' vs 'capturing') would otherwise strand a project in a
-- state nothing renders.
do $$
begin
  alter table public.blocks_projects
    add constraint blocks_projects_status_check
    check (status in ('queued', 'capturing', 'ready', 'failed'));
exception
  when duplicate_object then null;
end $$;

-- The list view is "my projects, newest first" — the only read path that isn't
-- by primary key.
create index if not exists blocks_projects_user_created_idx
  on public.blocks_projects (user_id, created_at desc);

alter table public.blocks_projects enable row level security;

drop policy if exists "blocks_projects: select own" on public.blocks_projects;
create policy "blocks_projects: select own"
  on public.blocks_projects for select
  using (auth.uid() = user_id);

drop policy if exists "blocks_projects: insert own" on public.blocks_projects;
create policy "blocks_projects: insert own"
  on public.blocks_projects for insert
  with check (auth.uid() = user_id);

drop policy if exists "blocks_projects: update own" on public.blocks_projects;
create policy "blocks_projects: update own"
  on public.blocks_projects for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "blocks_projects: delete own" on public.blocks_projects;
create policy "blocks_projects: delete own"
  on public.blocks_projects for delete
  using (auth.uid() = user_id);
