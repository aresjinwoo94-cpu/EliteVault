-- 0047 — per-audit "share the full report" flag for the public page /s/[slug].
--
-- By default /s/<slug> shows only the diagnosis (verdict, $ potential, annotated screenshot) and locks the rest.
-- When the OWNER sets share_full_report = true on ONE audit, that audit's public page renders the same
-- read-only report its owner sees (fixes, persona, simulator, optimizer). It is meant for audits the owner
-- shares on purpose (e.g. a Scale audit sent to a prospect). Default false, server-written only: migration 0039's
-- analyses trigger lets anon/authenticated update just share_slug / shared_at, so users cannot set it.
alter table public.analyses add column if not exists share_full_report boolean not null default false;
