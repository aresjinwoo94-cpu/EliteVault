# Brief: claridad de métricas en el reporte del Analyzer (conversion rate + Meta Ads Optimizer)

> **ESTADO: APROBADO PARA EJECUTAR (2026-10-21).** Flujo habitual: una rama/PR desde `main`, typecheck + test,
> verificación adversarial, y Code revisa visualmente su propio trabajo (desktop y móvil, EN y ES) antes de mergear.

## Regla de oro (no negociable)

**Esto es solo presentación.** No se toca el pipeline del Analyzer (`inngest/functions/analyze-website.ts`), los
agentes de IA, los prompts, los providers de Gemini, el hedge, los timeouts ni lo que se guarda en la BD.
No se añade ninguna llamada de IA nueva. La latencia y la tasa de éxito actuales (~98,9%, p50 ~22 s) no pueden
empeorar. Si algún cambio exige tocar el pipeline, **parar y preguntar al dueño**.

## Contexto encontrado (main @ 6e228ab)

- **"Estimated conversion rate"**: `components/analyzer/conversion-gauges.tsx` + `lib/analyzer/conversion-scenarios.ts`.
  Son bandas **deterministas** (puntaje del audit × benchmark de CVR del nicho × factor por escenario). Sin IA.
  Factores: organic 2.1, meta_ads_good 1.55, meta_ads_regular 1.0, meta_ads_bad 0.45. Textos en `lib/i18n/dict/ui-*.json`
  (namespace `gauges`). También se usa en `app/(app)/app/community/[slug]/page.tsx`.
- **Meta Ads Optimizer**: `components/analyzer/meta-ads-optimizer.tsx`. Etiquetas en `ui-*.json` (`maxBid`, `costK`,
  `ctr`, `lpConv`, `targetReturn`, `nicheMedian`). Los valores vienen del agente + `clampOptimizerTargets`; no se tocan.

## Problemas que ve el dueño

1. El usuario no sabe qué es el porcentaje (¿ROAS? ¿qué?). No dice "de cada 100 visitantes, cuántos compran".
2. "Organic" aparece arriba con el número más alto y parece decir "no hagas anuncios". El dato es correcto
   (tráfico que ya te busca convierte más que tráfico frío), pero falta decir que orgánico trae **pocas visitas** y los
   anuncios traen **volumen**, y que lo útil es comparar los escenarios de Meta entre sí.
3. "Meta — top buyer" / "bad creative" / "regular" no se entienden.
4. En el Optimizer, las tarjetas CPC / CPM / CTR / CVR / ROAS no tienen contexto suficiente: falta qué significa cada
   una en palabras simples y si conviene alto o bajo.

## Cambios

### A. Tarjeta "Estimated conversion rate" → "¿Cuántos visitantes compran?"

- **Título** EN: "How many visitors buy" · ES: "¿Cuántos visitantes compran?"
- **Subtítulo (1 línea)** EN: "Out of every 100 visitors, how many are likely to buy — by where they come from."
  ES: "De cada 100 visitantes, cuántos probablemente compren — según de dónde vienen."
- **Orden nuevo**: primero los 3 escenarios de Meta (de peor a mejor), y orgánico **al final, separado** con una línea
  divisoria y etiqueta "Reference" / "Referencia".
- **Etiquetas nuevas** (EN / ES):
  - meta_ads_bad: "Meta ads · weak ad" / "Anuncios Meta · anuncio débil"
  - meta_ads_regular: "Meta ads · average campaign" / "Anuncios Meta · campaña promedio"
  - meta_ads_good: "Meta ads · well-optimized campaign" / "Anuncios Meta · campaña bien optimizada"
  - organic: "Organic · people who already know you" / "Orgánico · gente que ya te conoce"
- **Cada fila** muestra la banda en el formato actual (`1.3–1.9%`) y, al lado, en gris pequeño, su traducción:
  "≈ 1–2 of 100" / "≈ 1–2 de 100" (redondeo honesto de la banda).
- **Nota bajo orgánico (1 línea)** EN: "Converts higher because they already searched for you — but brings far fewer visits.
  Ads bring the volume." ES: "Convierte más porque ya te buscaron — pero trae muchas menos visitas. Los anuncios traen
  el volumen."
- **Nota final** (reemplaza `gauges.note`) EN: "Estimated from your niche and this audit — not a guarantee. This is not
  ROAS." ES: "Estimado según tu nicho y esta auditoría — no es una garantía. Esto no es ROAS."
- Etiqueta superior "AI estimate · ranges" se mantiene (o "Estimate · ranges").
- **No cambiar** `conversion-scenarios.ts` (ni factores ni fórmula). Solo el componente y los textos.
- Aplicar igual en la página de Community que reutiliza el componente.

### B. Meta Ads Optimizer: contexto en las 5 métricas

Cada tarjeta mantiene el valor grande y la mediana del nicho, y añade:
1. **Nombre claro** (en vez de solo la sigla) + la sigla pequeña.
2. **Una línea en palabras simples**.
3. **Indicador de dirección** (pequeño, gris): "lower is better" ↓ / "higher is better" ↑.

| Métrica | Nombre (EN / ES) | Línea simple (EN / ES) | Dirección |
|---|---|---|---|
| CPC | Max cost per click / Costo máx. por clic | "Pay up to this for each click" / "Paga hasta esto por cada clic" | ↓ |
| CPM | Cost per 1,000 views / Costo por 1.000 vistas | "What 1,000 people seeing your ad costs" / "Lo que cuesta que 1.000 personas vean tu anuncio" | ↓ |
| CTR | Click rate / Tasa de clics | "Of 100 who see the ad, how many click" / "De 100 que ven el anuncio, cuántos hacen clic" | ↑ |
| CVR | Visitors who buy / Visitantes que compran | "Of 100 who land on your store, how many buy" / "De 100 que entran a tu tienda, cuántos compran" | ↑ |
| ROAS | Return on ad spend / Retorno de la inversión | "Sales per $1 spent — {x}× means ${x} back" / "Ventas por cada $1 invertido — {x}× significa ${x} de vuelta" (rellenar con el valor real, p. ej. 1.6× → $1.60) | ↑ |

- Cambiar "niche median" → EN "Typical in your niche" / ES "Típico en tu nicho".
- Encabezado de la fila de métricas: EN "Your targets vs. typical in your niche" / ES "Tus objetivos vs. lo típico en tu nicho".
- Bajo la fila, **una sola línea**: EN "Whether a ROAS is profitable depends on your margin: the lower your margin, the higher the ROAS you need."
  ES "Si un ROAS es rentable depende de tu margen: cuanto menor tu margen, más ROAS necesitas."
- Opcional (si cabe sin saturar): ícono "?" con tooltip que repita la línea simple, para móvil.
- No se cambian valores, cálculo ni el agente.

### C. Calidad visual

- Nada de párrafos: máximo 1 línea por métrica o nota.
- Móvil: las 5 tarjetas del Optimizer deben seguir legibles (2 columnas o carrusel, sin texto cortado).
- Mantener el estilo oscuro actual.

## Aceptación

- grep: no queda "top buyer" ni "bad creative" en la UI.
- Tests: snapshot/render del componente de gauges (orden, etiquetas, "de 100", nota "no es ROAS") y del Optimizer (5 nombres
  claros + dirección + "Típico en tu nicho"), EN y ES.
- `conversion-scenarios.ts`, `meta-ads-optimizer-agent.ts`, `analyze-website.ts` y providers sin cambios en el diff.
- typecheck + test + build en verde.
- Verificación en producción tras el merge: un reporte de pago y uno free muestran las tarjetas nuevas; una auditoría nueva
  termina en tiempo normal.
