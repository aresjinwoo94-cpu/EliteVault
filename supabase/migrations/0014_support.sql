-- ──────────────────────────────────────────────────────────────────────────
-- EliteVault — 0014 support chatbot log (Phase 5)
--
-- Logs support-chat questions the knowledge base could NOT confidently answer,
-- so we can expand the KB over time. Purely additive. RLS on; writes happen
-- ONLY via the service role (the chat route) — there are no public policies,
-- so the client can neither read nor forge rows. Idempotent.
-- ──────────────────────────────────────────────────────────────────────────

create table if not exists public.support_questions (
  id          uuid primary key default gen_random_uuid(),
  -- nullable: anonymous (logged-out) visitors can use the chatbot.
  user_id     uuid references public.profiles(id) on delete set null,
  question    text not null,
  -- true if the KB answered it; false rows are the backlog to document.
  answered    boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists support_questions_unanswered_idx
  on public.support_questions (created_at desc)
  where answered = false;

alter table public.support_questions enable row level security;
-- No policies on purpose: only the service role (the chat API) writes here,
-- and it bypasses RLS. Reviewed internally via the Supabase dashboard.
