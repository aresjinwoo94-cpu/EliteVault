-- 0027 — Playbook (retención post-analyzer, FASE B)
-- Aditivo sobre saved_sites. Convierte "guardado" en accionable:
-- estado por-aplicar / aplicado + columnas forward-compat (nullable) para
-- que el futuro rail personalizado pueda atar cada item a un issue de auditoría
-- sin migración adicional.
alter table public.saved_sites
  add column if not exists status text not null default 'to_apply',
  -- forward-compat (NO construir UI para esto ahora; solo reservar la columna):
  add column if not exists source_analysis_id uuid references public.analyses(id) on delete set null,
  add column if not exists issue_fingerprint text,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  alter table public.saved_sites
    add constraint saved_sites_status_check
    check (status in ('to_apply', 'applied'));
exception
  when duplicate_object then null;
end $$;

-- Las policies RLS existentes (select/insert/delete own) siguen sirviendo.
-- Ahora el usuario actualiza `status`, así que hace falta una policy de UPDATE
-- propia (mismo patrón auth.uid() = user_id).
drop policy if exists "saved_sites: update own" on public.saved_sites;
create policy "saved_sites: update own"
  on public.saved_sites for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
