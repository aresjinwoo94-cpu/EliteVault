# Auditoría de features premium — WP-4 (solo lectura)

Fecha: 2026-10-09 · Rama `docs/wp4-premium-audit` (sin cambios de producto) · Brief: `docs/store-audit-fix-tracks-premium.md` §4.1

## Qué se hizo y qué NO

**Hecho (evidencia dura):** lectura de código de cada feature y su gating; consultas de solo lectura a producción (`winning_sites` con la service key y con la anon key; `scripts/analyzer-latency-report.mjs`); comprobación de las promesas del pricing contra el código.

**NO hecho:** no se crearon cuentas de prueba por plan ni se ejecutaron análisis/simulaciones reales de extremo a extremo (el brief lo pide con `force-plan.mjs` / `create-test-user.mjs` y 3 tiendas de nichos distintos). Esas pruebas escriben usuarios y gastan cuota gratuita de Gemini en producción; las marco como pendientes y las propongo dentro de WP-5/WP-6, donde cada arreglo se verifica en vivo. Todo lo que dice "funciona" abajo es por lectura de código + datos, no por una ejecución en vivo.

## Resumen

| Feature | Plan | Estado | Resumen |
|---|---|---|---|
| Simulador Meta (Campaign Scenario Modeler) | Pro 1/mes, Scale ∞ | **Engañoso** | Los números los inventa la IA; sin invariantes ni break-even; 3 llamadas secuenciales |
| Meta Ads Optimizer | "solo Scale" | **Engañoso (pricing ↔ código)** | Pro lo recibe dentro de su 1 ejecución mensual; el pricing/gating fijado dice lo contrario |
| Library (listado, búsqueda, contadores, SEO) | Pro/Scale | **Roto (grave)** | Muestra 17 tiendas en `review` y 2 muertas; ningún filtro `published`/`is_live` |
| Library — cobertura por nicho | — | **Insuficiente** | 6 de 13 nichos con < 5 tiendas vivas; 9 de 13 sin ningún teardown |
| Winners en tu nicho (card) | Free teaser / pago | Funciona (con la salvedad del CTA) | Enlaza a la Ad Library, no a la tienda (WP-6 §4.3) |
| Fixes completos + buyer persona | Pro/Scale | Funciona | Gating server-side; free ve 1 fix (ahora 1 track elegido, ver pricing) |
| Cuotas (40 / 200 / 1 proyección) | todos | Funciona | `lib/quota/guard.ts` enforcea en servidor; mensaje de límite presente |
| Compare Mode | Pro/Scale | **Gating solo en cliente** | La ruta `/app/community/compare` no comprueba plan |
| REST API | Scale | Funciona | `lib/api-auth.ts` exige `unlocksScale` |
| "Priority queue + priority support" | Scale | **No existe** | Promesa del pricing sin implementación |
| Coherencia pricing ↔ producto | todos | **Varias incoherencias** | Ver sección propia |

## Hallazgos detallados

### H1 — Library muestra tiendas no publicadas y muertas (GRAVE, a decidir)
- Evidencia datos: `winning_sites` = 87 filas → 68 `published/live`, **17 `review/live`**, **2 `review/dead`** (`manscaped.com`, `barkbox.com`). La política RLS `sites: public read` (`0001_init.sql:236`) deja leer todo, y la anon key devuelve exactamente las mismas 87 filas.
- Evidencia código: `app/actions/search.ts:123` (listado/búsqueda), `:208`/`:219` (`getNiches`, `getLibraryStats`), `lib/library/niche-pages.ts:53,79` (páginas SEO por nicho) y `app/(app)/app/page.tsx:40` (contador del dashboard) leen `winning_sites` **sin** `status='published'` ni `is_live=true`. Solo el módulo "Winners" (`niche-winners.ts`) filtra bien.
- Impacto: el usuario de pago ve tiendas que no pasaron la puerta de calidad (`review`) y 2 storefronts muertos (incumple el brief: "que no haya tiendas muertas"). Los contadores y las páginas SEO de nicho se inflan (87 vs 68 reales).
- Fix propuesto (WP-6): filtrar `status='published' AND is_live=true` en esas 5 lecturas (o endurecer RLS para `anon`/`authenticated`, que además deja de exponer los borradores por la API pública). Decisión del dueño: ¿filtrar solo en código o también cerrar RLS?

### H2 — Cobertura de la Library por nicho (criterio 15)
Publicadas y vivas por nicho (`NICHE_LABELS`, 13 nichos) y cuántas tienen `teardown` (lo necesita el track `competitor`):

| Nicho | Vivas | Con teardown | ¿≥ 5 vivas? | ¿≥ 1 teardown? |
|---|---|---|---|---|
| baby | 8 | 0 | sí | **no** |
| grooming | 8 | 0 | sí | **no** |
| pet | 7 | 0 | sí | **no** |
| eyewear | 7 | 0 | sí | **no** |
| apparel | 9 | 1 | sí | sí |
| beverage | 5 | 1 | sí | sí |
| home | 5 | 0 | sí | **no** |
| skincare | 4 | 0 | **no** | **no** |
| accessories | 3 | 0 | **no** | **no** |
| fitness | 3 | 0 | **no** | **no** |
| wellness | 3 | 0 | **no** | **no** |
| footwear | 3 | 1 | **no** | sí |
| beauty | 3 | 1 | **no** | sí |

- 6 nichos por debajo de 5 vivas: skincare (4), accessories, fitness, wellness, footwear y beauty (3 cada uno). Candidatas a subir de `review` a `published` sin descubrir nada nuevo: hay tiendas en `review` en accessories (2), skincare (3), beauty (1), apparel (2), beverage (3), home (6).
- **9 de 13 nichos no tienen ningún teardown** → el track `competitor` (WP-2/3) mostrará el estado vacío honesto en la mayoría de nichos. Solo apparel, beverage, footwear y beauty tienen 1.
- Frescura: `last_verified_at` de todas las filas es **2026-10-04** (una única pasada). No hay cron (Vercel Hobby); `scripts/library/verify.mts` y `refresh.ts` se corren a mano. Recomendación: correr `verify` cada ~2 semanas y tras cada alta.
- Esto es la cola de WP-6 (cobertura): correr `scripts/library/` (discover → verify → momentum → audit/teardown) offline.

### H3 — El simulador de Meta no cumple §4.2 (ENGAÑOSO)
Evidencia: `ai/agents/meta-campaign-scenario-agent.ts` (esquema `:44-121`, llamada `:404-421`, post-proceso `:430-446`) y `ai/agents/run-meta-simulation.ts:57-72`.
1. **Matemática no calculada en código:** gasto, impresiones, CPM, CTR, compras, revenue, CPA y ROAS son salida de la IA; el único post-proceso es normalizar el CTR (`normalizeCtr`). El prompt dice "Math must be internally consistent" pero nada lo verifica. `lib/meta/niche-benchmarks.ts` y `roas-range.ts` **no los usa el agente** (solo la UI).
2. **Sin orden garantizado** conservador ≤ balanceado ≤ agresivo: tres llamadas independientes (T 0.4/0.4/0.55).
3. **Sensibilidad:** depende de que la IA la respete; sin test.
4. **Sin break-even visible:** el margen del usuario solo se inyecta en el prompt (`:391`); no hay ROAS de equilibrio ni "gana/pierde dinero" por escenario.
5. **Velocidad/cuota:** 3 llamadas **secuenciales** con 2,5 s de pausa (`STAGGER_MS`) = ≥ 3 llamadas + 5 s; con Flash-Lite gratis (15 RPM) un 429 en la 1ª aborta las otras (`run-meta-simulation.ts` lo reconoce). Además el comentario de `inngest/functions/run-meta-simulation.ts:15-17` dice "3 parallel calls": está desactualizado.
6. Honestidad: existe el rótulo "ejemplo — no son tus números" en la UI de bloqueo; en el resultado real no verificado en vivo.
- Fix propuesto (WP-5): motor determinista en `lib/meta/` (inputs: benchmarks del nicho + AOV/presupuesto/margen/país + score de ad-readiness) con tests de propiedades; IA solo para narrativa en **1** llamada; break-even visible.

### H4 — Meta Ads Optimizer llega a Pro (pricing ↔ código)
- Gating fijado por el dueño y pricing: Optimizer solo Scale (`plans.ts`: Pro excluye "Unlimited Meta projections + Ads optimizer + REST API"; brief: Pro ve `LockedMetaAdsPreview`).
- Código: `inngest/functions/run-meta-simulation.ts:167-197` calcula el Optimizer para el análisis de un usuario Pro dentro de su ejecución mensual ("el Meta block = Modeler + Ads Optimizer como UNA unidad"), y `client-payload.ts` entrega `meta_ads` a todo el que `canRunMeta` (Pro incluido).
- Efecto: Pro recibe el Optimizer 1 vez/mes aunque el pricing lo lista como Scale. O se cambia el pricing ("incluye 1 proyección con Optimizer") o se bloquea el Optimizer para Pro. Decisión de producto del dueño.
- Targets: los CPC/CPM/CTR/ROAS son salida de la IA, **no se fuerzan dentro** de `niche-benchmarks.ts`; la UI los muestra junto a la banda de mediana del nicho y si no hay banda oculta la métrica (`meta-ads-optimizer.tsx`), pero no hay test que garantice que caigan en rango ni que no contradigan al simulador. Se resuelve junto a H3.

### H5 — Compare Mode: gating solo en el cliente
`app/(app)/app/community/compare/page.tsx` no consulta el plan; el botón se oculta en `components/community/feed.tsx` (`canCompare`), pero la URL `/app/community/compare?slugs=…` abre para cualquier usuario logueado. Impacto bajo (compara reportes públicos de Community), pero el pricing lo vende como Pro/Scale. Fix: comprobar plan en la página o quitar "Compare Mode" del pricing.

### H6 — Pricing ↔ producto
| Promesa | Realidad | Acción |
|---|---|---|
| Scale: "Priority queue + priority support" | Sin implementación (no hay prioridad de cola en `inngest/` ni soporte priorizado en código) | **Quitar del pricing** (o construir; preferible quitar) |
| Pro: "Compare Mode" | Existe, sin gating server (H5) | Gatear o retirar |
| Pro/Scale: Optimizer "solo Scale" | Pro lo recibe 1×/mes (H4) | Decidir copy vs gating |
| Free: "Your #1 highest-impact fix — unlocked" | Tras WP-3 el usuario free elige 1 de 4 grupos de fixes; el #1 sigue abierto dentro del grupo elegido | Actualizar el texto del plan Free (EN/ES) al lanzar WP-3 |
| "AI image & text search across 45+ stores" | Library real: 68 publicadas / 87 totales | Texto correcto como mínimo; revisar al limpiar H1 |
| Pro "40 analyses / month", Scale "200" | `quotas.analysesPerMonth` 40 / 200 y guardia en servidor | OK |
| Scale "REST API access" | `lib/api-auth.ts` exige `unlocksScale` | OK |
| Free "3 hand-picked winning stores with full metrics" | `libraryFullMetricsCap: 3` | OK |

### H7 — Lo que funciona (por código)
- Cuotas: `lib/quota/guard.ts` cuenta `meta_simulations` por periodo; Free 0, Pro 1, Scale ilimitado; mensaje al límite ("Scale includes unlimited projections").
- Winners: `loadNicheWinnersModule` degrada a `null`, bloquea a Free en el servidor (solo envía conteo) y no mezcla otros nichos como "tu nicho" (`scope: "global"` con su propio título).
- Gating de `meta_ads` y de `niche_winners` en el payload del cliente (`lib/analyzer/client-payload.ts`).

## Latencia (guardarraíl §5)
| Momento | n | p50 | p90 | Éxito |
|---|---|---|---|---|
| Línea base WP-0 (desde 2026-10-02) | 47 | 20 s | 38 s | 46/47 |
| Tras WP-1 (copy) y WP-2 (backend, flag OFF) | — | sin cambio: no tocan el pipeline | | |
| WP-3 (flag ON → `observed_palette` en el schema) | **pendiente** | medir con `analyzer-latency-report.mjs --since <fecha de deploy>` | | |
- La A/B local del campo `observed_palette` fue **inconclusa** (el modelo configurado en local estaba saturado: 503/429, fallos en ambos brazos). Entre las llamadas que terminaron, el brazo con paleta no fue más lento y devolvió hex válidos (6/6), pero no es prueba. Regla de reversión: p50 > ~22 s o éxito < ~98 % → `ANALYZER_FIX_TRACKS=false`.
- Este WP no cambia código de producto: no afecta a la latencia.

## Propuesta para WP-5 y WP-6 (espera aprobación)
**WP-5:** simulador determinista + 1 llamada de IA + break-even + tests de propiedades (H3); coherencia Optimizer ↔ simulador (H4, según decisión de pricing).
**WP-6:** filtro `published/is_live` en las 5 lecturas de la Library (H1); card de Winners → enlazar a la tienda (§4.3); cobertura de la Library (subir tiendas de `review` revisadas + correr el pipeline offline para llegar a ≥ 5 vivas y ≥ 1 teardown por nicho, H2); incoherencias de pricing (H5/H6; **lo que se quite del pricing lo apruebas tú**).

## Decisiones que necesito del dueño
1. H1: ¿filtrar en código, endurecer RLS, o ambos?
2. H4: ¿Pro recibe el Optimizer 1×/mes (cambiar copy) o se bloquea (cambiar código)?
3. H6: aprobar quitar "Priority queue + priority support" del pricing; ¿Compare Mode: gatear o retirar?
4. H2: ¿subimos a `published` las tiendas en `review` tras revisarlas, o solo descubrimos nuevas?
5. ¿Hago ahora las pruebas con cuentas reales por plan (crean usuarios de prueba y gastan cuota gratuita) o las integro en WP-5/6?
