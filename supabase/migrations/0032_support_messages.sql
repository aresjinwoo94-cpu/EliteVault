-- ──────────────────────────────────────────────────────────────────────────
-- EliteVault — 0032 support contact-form messages
--
-- Durable store for the /support/contact form so a submission is NEVER lost
-- when email delivery fails (Resend down / unconfigured). The action writes
-- here FIRST, then attempts the email, then flips email_sent. Purely additive.
--
-- RLS on; NO public policies — writes happen ONLY via the service role (the
-- server action), which bypasses RLS, exactly like 0014_support.sql. The client
-- can neither read nor forge rows. Idempotent.
-- ──────────────────────────────────────────────────────────────────────────

create table if not exists public.support_messages (
  id          uuid primary key default gen_random_uuid(),
  -- nullable: the contact form is public (logged-out visitors can submit).
  user_id     uuid references public.profiles(id) on delete set null,
  name        text not null,
  email       text not null,
  topic       text,
  message     text not null,
  -- true once the notification email was accepted by Resend.
  email_sent  boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists support_messages_created_idx
  on public.support_messages (created_at desc);

alter table public.support_messages enable row level security;
-- No policies on purpose: only the service role (the contact action) writes
-- here, and it bypasses RLS. Reviewed internally via the Supabase dashboard.
