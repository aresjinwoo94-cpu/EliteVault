-- Analítica propia (first-party) para el panel del dueño.
-- Registra visitas de página con geo (de cabeceras Vercel) y dispositivo, sin
-- depender de PostHog ni de terceros. Solo el service role lee/escribe.

create table if not exists public.page_views (
  id              bigint generated always as identity primary key,
  created_at      timestamptz not null default now(),
  anon_id         text not null,                 -- cookie anónima por visitante
  path            text,
  referrer_domain text,                           -- dominio de origen, o 'Directo'
  country         text,                           -- código ISO de 2 letras (x-vercel-ip-country)
  city            text,
  device          text                            -- 'Móvil' | 'Escritorio' | 'Tablet'
);

create index if not exists page_views_created_idx on public.page_views (created_at desc);
create index if not exists page_views_anon_idx    on public.page_views (anon_id);

-- RLS activado SIN políticas: nadie con la clave pública/anon puede leerla.
-- El backend usa el service role (que bypassa RLS) para escribir y consultar.
alter table public.page_views enable row level security;
