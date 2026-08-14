-- 0026 — Library teardown (retención post-analyzer, FASE A)
-- Aditivo. Guarda un desglose curado de conversión por tienda, con cada
-- elemento etiquetado por la MISMA dimensión que usa el Analyzer
-- (AnalysisResult.category_scores), para que Library y Analyzer compartan
-- vocabulario. Precomputado (nunca se genera por request).
alter table public.winning_sites
  add column if not exists teardown jsonb;

-- Índice parcial: sólo las filas que YA tienen teardown (para consultas
-- futuras del tipo "tiendas con teardown en el nicho X").
create index if not exists winning_sites_has_teardown_idx
  on public.winning_sites ((teardown is not null))
  where teardown is not null;
