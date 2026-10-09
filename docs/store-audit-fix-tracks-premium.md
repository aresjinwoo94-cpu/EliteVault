# Brief — "store audit" en la landing + Fix Tracks + auditoría de features premium

> **ESTADO: APROBADO PARA EJECUTAR.** Ejecutarlo con el flujo habitual: skill superpowers, una rama
> por WP, `npm run typecheck` + tests, y subagente de verificación adversarial antes de cerrar cada WP.
>
> **Orden de WPs (una rama/PR por WP):**
> - **WP-0** medir latencia base del Analyzer (§5) — antes de todo.
> - **WP-1** §1 H1 "store audit" (puede mergear solo).
> - **WP-2** §3 backend Fix Tracks (migración, agente, ruta, gating).
> - **WP-3** §3 UI Fix Tracks **+** §2 tarjetas de la landing (salen juntas: la landing promete lo que entregan los tracks).
> - **WP-4** §4.1 auditoría de features premium → `docs/premium-audit-REPORT.md` (sin cambios de producto).
> - **WP-5** §4.2 simulador + optimizer.
> - **WP-6** §4.3 winners → link a la tienda + cobertura de la Library por nicho.
> Después de WP-4, **parar y mostrarle el REPORT al dueño** antes de WP-5/WP-6.

---

## §0 — Contexto encontrado (no hay que cambiar nada de esto)

- El `<title>` de la landing (`app/page.tsx`, `metadata.title.absolute`) **ya contiene "Store Audit"**:
  `Shopify Store Analyzer & Free Store Audit | EliteVault`. Igual og:title y twitter:title.
- Lo que **no** contiene "store audit" es el **H1 visible** del hero
  (`components/marketing/hero.tsx`, claves `hero.line1` + `hero.line2`):
  EN "Find what's costing your Shopify store sales." / ES "Descubre qué le está costando ventas a tu tienda Shopify."
- Google pesa sobre todo `<title>` + `<h1>`. Tener la frase en ambos es el objetivo de la §1.
- La sección de la captura es `components/marketing/social-strip.tsx` (namespace i18n `socialStrip`,
  en `lib/i18n/messages.ts`, bloque `en` ~línea 143 y bloque `es` ~línea 1103).

---

## §1 — "store audit" obligatorio en el título de la landing

### 1.1 `<title>` (metadata) — mantener, y blindarlo con test
No cambiar el string actual (ya contiene "Store Audit"). Añadir en
`scripts/tests/landing-keyword.test.ts` una aserción que falle si algún día se pierde:

```ts
test('"store audit" está en el <title>, og:title y twitter:title', () => {
  for (const m of metadataBlock.matchAll(/(?:absolute|title):\s*\n?\s*"([^"]+)"/g)) {
    assert.match(m[1], /store audit/i, `"${m[1]}" perdió "store audit"`);
  }
});
```

### 1.2 H1 del hero — que contenga la frase exacta "store audit"
En `lib/i18n/messages.ts`, bloque `hero`:

| Clave | Antes (EN) | Después (EN) |
|---|---|---|
| `hero.line1` | `Find what's costing your` | `Free Shopify store audit —` |
| `hero.line2` (degradado) | `Shopify store sales.` | `find what's costing you sales.` |

H1 resultante (EN): **"Free Shopify store audit — find what's costing you sales."**
→ contiene "store audit" y también "shopify store audit" (keyword ya presente en `metadata.keywords`).

| Clave | Antes (ES) | Después (ES) |
|---|---|---|
| `hero.line1` | `Descubre qué le está costando ventas` | `Auditoría gratis de tu tienda Shopify —` |
| `hero.line2` | `a tu tienda Shopify.` | `descubre qué te está costando ventas.` |

> En ES se usa la traducción natural ("auditoría de tienda"): Google indexa la versión EN,
> y meter la frase inglesa en el H1 español se leería raro para el visitante hispano.
> Si el dueño quiere la frase literal también en ES, usar: `Store audit gratis de tu tienda Shopify —`.

No tocar `hero.badge1` ("AI SHOPIFY STORE ANALYZER" / "ANALIZADOR SHOPIFY CON IA") — mantiene
la keyword principal "shopify store analyzer" en la página.

### 1.3 Actualizar el test existente que fija el H1 viejo
En `scripts/tests/landing-keyword.test.ts`, test `"the repositioned copy exists in both locales"`:

```ts
// antes
assert.equal(`${en.hero.line1} ${en.hero.line2}`, "Find what's costing your Shopify store sales.");
assert.match(`${es.hero.line1} ${es.hero.line2}`, /tienda Shopify\.$/);
// después
assert.equal(`${en.hero.line1} ${en.hero.line2}`, "Free Shopify store audit — find what's costing you sales.");
assert.match(`${en.hero.line1} ${en.hero.line2}`, /store audit/i);
assert.match(`${es.hero.line1} ${es.hero.line2}`, /tienda Shopify/);
```

### 1.4 Verificación visual
El H1 es el elemento LCP (`initial={false}`). Revisar en 375 px, 768 px y 1280 px, en ambos idiomas
(`?lang=en` / `?lang=es`): que no quede una línea huérfana fea por el `text-balance`, que el
degradado caiga solo en `line2`, y que el H1 en ES (más largo) no empuje el CTA fuera del primer viewport en móvil.
Si en ES se pasa, acortar `line1` a `Auditoría gratis de tu Shopify —`.

---

## §2 — Tarjetas "Lo que te llevas" (`SocialStrip`)

### Reglas
- **La tarjeta 3 ("Mira cada fuga de la página" / "See every leak on the page") NO se toca**:
  ni título, ni descripción, ni ícono (`Search`), ni posición (sigue en 3er lugar).
- Se reemplazan las tarjetas 1, 2 y 4 (título, descripción e ícono).
- Mismo layout, mismo estilo de ícono (Lucide, un solo peso, acento teal). No cambiar CSS.

### 2.1 Eyebrow de la sección
| Clave | Antes | Después |
|---|---|---|
| `socialStrip.eyebrow` EN | `What you walk away with` | `What you'll discover` |
| `socialStrip.eyebrow` ES | `Lo que te llevas` | `Aquí descubrirás` |

(Los títulos nuevos empiezan con "Cómo…", así que "Aquí descubrirás" encadena natural con ellos.)

### 2.2 Copy nuevo — `lib/i18n/messages.ts`, namespace `socialStrip`

**Tarjeta 1 — ventas después de la compra**
| Clave | EN | ES |
|---|---|---|
| `b1Title` | `How to make more sales after the purchase` | `Cómo generar más ventas después de la compra` |
| `b1Sub` | `Turn every first order into the next one.` | `Convierte cada primer pedido en el siguiente.` |

**Tarjeta 2 — rediseño de la tienda**
| Clave | EN | ES |
|---|---|---|
| `b2Title` | `How to redesign your Shopify store the right way` | `Cómo rediseñar bien tu tienda Shopify` |
| `b2Sub` | `What to change first — without breaking what already sells.` | `Qué cambiar primero, sin romper lo que ya vende.` |

**Tarjeta 3 — SIN CAMBIOS** (`b3Title` / `b3Sub` se quedan exactamente como están).

**Tarjeta 4 — triunfar en tu nicho**
| Clave | EN | ES |
|---|---|---|
| `b4Title` | `How to win in your niche` | `Cómo triunfar en tu nicho` |
| `b4Sub` | `Benchmarked against the stores already winning in it.` | `Comparado con las tiendas que ya ganan en él.` |

### 2.3 Íconos — `components/marketing/social-strip.tsx`
Todos existen en `lucide-react@^0.469.0` (confirmar con el import; si alguno no compila, usar el alternativo).

| Tarjeta | Antes | Después | Alternativo |
|---|---|---|---|
| 1 | `TrendingUp` | `Repeat` (recompra / volver a comprar) | `ShoppingBag` |
| 2 | `Gauge` | `LayoutTemplate` (estructura/rediseño de la página) | `PenTool` |
| 3 | `Search` | `Search` (sin cambio) | — |
| 4 | `Wallet` | `Target` (dominar el nicho) | `Trophy` |

```ts
import { LayoutTemplate, Repeat, Search, Target } from "lucide-react";

const BENEFITS = [
  { icon: Repeat,         titleKey: "socialStrip.b1Title", subKey: "socialStrip.b1Sub" },
  { icon: LayoutTemplate, titleKey: "socialStrip.b2Title", subKey: "socialStrip.b2Sub" },
  { icon: Search,         titleKey: "socialStrip.b3Title", subKey: "socialStrip.b3Sub" },
  { icon: Target,         titleKey: "socialStrip.b4Title", subKey: "socialStrip.b4Sub" },
];
```

Actualizar también el comentario de cabecera del componente (ya no son "beneficios del audit", son
"lo que el usuario descubrirá"), y el tipo `icon: typeof TrendingUp` → `icon: typeof Repeat`.

### 2.4 Tests a actualizar
En `scripts/tests/landing-keyword.test.ts`:
```ts
// antes
assert.equal(en.socialStrip.b1Title, "Find your highest-impact fixes");
assert.equal(es.socialStrip.b1Title, "Encuentra tus arreglos de mayor impacto");
// después
assert.equal(en.socialStrip.b1Title, "How to make more sales after the purchase");
assert.equal(es.socialStrip.b1Title, "Cómo generar más ventas después de la compra");
// la tarjeta 3 no debe cambiar
assert.equal(en.socialStrip.b3Title, "See every leak on the page");
assert.equal(es.socialStrip.b3Title, "Mira cada fuga de la página");
```
Hacer `grep` en todo el repo de los strings viejos (`highest-impact fixes`, `real potential`,
`$0 to run your first audit`, `Lo que te llevas`, etc.) por si algún otro test, landing SEO
(`app/free-website-audit`, etc.) o snapshot los reutiliza.

### 2.5 ⚠️ Dependencia de honestidad (leer antes de mergear)
El comentario del propio componente dice que **cada línea de esta franja debe ser verdad**.
Hoy el Analyzer lee UNA página de producto; no analiza post-compra (upsells, recompra, retención).
- Tarjeta 2 (rediseño) → la cubre lo actual (fixes priorizados + screenshot anotado).
- Tarjeta 4 (nicho) → la cubre lo actual (juicio por nicho + Library de tiendas ganadoras).
- **Tarjeta 1 (ventas post-compra) → NO la cubre el Analyzer actual.**
  La resuelve la §3 (track "Vender más después de la compra"). Por eso §2 se mergea en el
  mismo WP que la UI de la §3 (WP-3), nunca antes.

Mapa landing ↔ Analyzer (deben decir lo mismo):
| Tarjeta landing | Track del Analyzer (§3) |
|---|---|
| 1 · Cómo generar más ventas después de la compra | `post_purchase` |
| 2 · Cómo rediseñar bien tu tienda Shopify | `theme_colors` |
| 3 · Mira cada fuga de la página | screenshot anotado (ya existe) |
| 4 · Cómo triunfar en tu nicho | `competitor` |

---

## §3 — Analyzer: "Fix Tracks" (el usuario elige qué fixes ver)

### 3.0 Qué se pide
En el reporte, en lugar de una sola lista de "Top fixes", el usuario ve **botones** y elige qué
tipo de fixes quiere:

| # | Track (id) | Botón EN | Botón ES |
|---|---|---|---|
| 1 | `urgent` | `Most urgent` | `Lo más urgente` |
| 2 | `post_purchase` | `Sell more after the purchase` | `Vender más después de la compra` |
| 3 | `theme_colors` | `Shopify theme & colors` | `Tema y colores para Shopify` |
| 4 | `competitor` | `Match your niche's top store` | `Parecerte al ganador de tu nicho` |

**Por qué se conserva `urgent` como 4º botón (seleccionado por defecto solo para Pro/Scale; ver 3.4):** los `top_fixes`
actuales no son solo una lista suelta — `ad_readiness.blockers` y `potential_why` los referencian
por el mismo wording (ver "Top fixes" y "Ad-readiness" en `ai/prompts.ts`), el hero v2 tiene
`onSeeFixes`, y el stepper apunta a `section-fixes`. Quitarlos rompe esas uniones. Además ya se
generan en la llamada principal a costo cero. Los 3 tracks nuevos se suman como botones al lado.
*(Si el dueño prefiere solo 3 botones: esconder el botón `urgent` pero seguir generando
`top_fixes` igual, porque el resto del reporte depende de ellos.)*

### 3.1 Restricciones que NO se negocian
- **No sumar latencia al análisis principal.** Hoy p50 ≈ 42 s con Gemini gratis + Vercel Hobby;
  meta ~35 s. Los 3 tracks nuevos se generan **bajo demanda** (cuando el usuario hace clic), en una
  llamada aparte, **solo texto** (sin volver a mandar el screenshot), y se **cachean** por análisis.
  Un análisis nunca llama a la IA dos veces para el mismo track.
- **No inventar.** Cada fix debe citar algo verificable de ESA tienda (mismo principio que
  `growth-map-feedback-agent.ts`: anti-genérico + fallback honesto, nunca una frase inventada).
- **No tocar `app/liquid`** ni nada de la app de Shopify.
- Mejoras resueltas **en código** (defaults en git), no con env vars de Vercel.
- Sin logos de Shopify ni de Meta en la UI (decisión de marca previa). El texto "Shopify" sí puede aparecer.

### 3.2 Arquitectura (seguir el patrón ya existente de Growth Map)
Modelo a copiar: `app/api/analyses/[id]/growth-map/route.ts` + `ai/agents/growth-map-feedback-agent.ts`
(ruta on-demand, auth + ownership, caché en columna jsonb de `analyses`, gating en el servidor,
fallback honesto si la IA falla).

1. **Migración** `supabase/migrations/0036_fix_tracks.sql` (aditiva, con rollback en `rollbacks/`):
   ```sql
   alter table public.analyses add column if not exists fix_tracks jsonb;
   -- { "<track>": { "fixes": [...], "meta": {...}, "generated_at": "..." },
   --   "free_choice": "<track>" | null }
   ```
   Actualizar `lib/supabase/types.ts`.
2. **Agente** `ai/agents/fix-track-agent.ts` (server-only):
   - Entrada: el `AnalysisResult` YA guardado (summary, annotations, category_scores, top_fixes,
     ad_readiness, buyer_persona_response, nicho detectado) + el contexto propio del track (3.3).
   - Salida (schema nuevo en `ai/schemas.ts`, `FixTrackSchema`): 3 fixes máx. con el mismo shape
     que `TopFixSchema` (`title`, `impact`, `effort`, `why`) **+ `evidence`** (string corto: qué
     elemento de ESTA página lo justifica). Fix sin `evidence` específico → se descarta.
   - Llamada barata: `maxTokens` bajo, thinking mínimo, mismo provider/hedge que ya usa el pipeline.
     Timeout ~20 s. Si falla o sale genérico → la ruta devuelve error y la UI muestra reintentar.
     **Nunca** se cachea un resultado vacío o genérico.
   - Idioma: el del reporte (reusar la instrucción `LANGUAGE:` de `ai/prompts.ts`).
   - Si `capture_blocked.detected` es true → no generar ningún track (mismo criterio que hoy).
3. **Ruta** `app/api/analyses/[id]/fix-tracks/[track]/route.ts` (`GET`):
   valida `track ∈ {post_purchase, theme_colors, competitor}`, auth, que el análisis sea del usuario
   y esté `succeeded`, aplica el gating (3.4), devuelve caché si existe, si no genera + guarda.
   Doble clic / dos pestañas: no generar dos veces (guardar con condición o lock simple).
4. **UI** `components/analyzer/fix-tracks.tsx` envolviendo `TopFixes` (reusar su render de filas,
   lock y blur; no duplicar). Se monta en `analysis-view.tsx` dentro de `#section-fixes`,
   en el mismo lugar donde hoy va `<TopFixes …/>`; la columna de Winners queda igual.

### 3.3 Qué hace cada track

**`post_purchase` — Vender más después de la compra**
- Realidad: el Analyzer ve UNA página de producto. No ve checkout, página de gracias ni emails.
- Por eso los fixes son **recomendaciones de qué montar después de la compra**, deducidas de lo que
  sí se ve: precio/ticket, si el producto es consumible (recompra) o de una vez, si ya hay bundles,
  cross-sell, suscripción o reseñas visibles. Ej.: oferta post-compra de 1 clic con un complemento
  concreto, bundle/“compra 2”, suscribe-y-ahorra si es reponible, pedido de reseña tras la entrega.
- **Obligatorio en la UI**, una línea fija sobre la lista:
  EN `Based on your product page — we don't see your checkout or emails.`
  ES `Basado en tu página de producto — no vemos tu checkout ni tus emails.`
- Sin cifras de % o $ (misma regla de "estimates, not guarantees").

**`theme_colors` — Tema y colores para Shopify**
- Para recomendar colores hacen falta los colores reales, y hoy el pipeline **no extrae paleta**.
  Solución: añadir al schema principal un campo opcional y pequeño `observed_palette`
  (máx. 6 hex que el modelo ya está viendo en el screenshot). Es ~30 tokens de salida; medir que el
  p50 del análisis no suba (tabla de timings de `0034_analysis_timings.sql`). Análisis viejos sin
  ese campo → el track igual funciona, pero sin proponer hex (solo dirección de color).
- Temas: crear `lib/analyzer/shopify-themes.ts` con una **lista cerrada** de temas (nombre,
  gratis/pago, nichos para los que encaja, URL oficial del theme store). **Verificar cada nombre y
  URL contra themes.shopify.com al implementar — no confiar en la memoria del modelo.** El agente
  solo puede elegir un `theme_slug` de esa lista; cualquier otro valor se descarta en código.
- Fixes esperados: ajuste de paleta (hex actual → hex sugerido y por qué para ESE nicho), dirección
  tipográfica, y 1 tema recomendado de la lista con el motivo. Usar `color_integration`,
  `layout_proportion` y las annotations de color/layout como evidencia.
- Copy alineado con la tarjeta 2 de la landing: el foco es "qué cambiar primero sin romper lo que ya vende".

**`competitor` — Parecerte al ganador de tu nicho**
- Fuente real: `analyses.niche_winners` (lo que ya calcula el pipeline) + `winning_sites.teardown`
  (desglose curado por las MISMAS 6 dimensiones del Analyzer; tipos `Teardown` /
  `TeardownElement` en `lib/supabase/types.ts`).
- Elegir el ganador: `exactMatch = true` **y** con `teardown` no nulo; desempatar por revenue
  estimado / anuncios activos. Mostrar arriba una mini-tarjeta del competidor (nombre, favicon, link).
- Fixes = brechas por dimensión: "ellos hacen X (observation del teardown) → tú haces Y (tu annotation
  o score en esa dimensión) → cambia esto". El `evidence` debe citar ambos lados.
- **Si no hay ganador del mismo nicho con teardown → estado vacío honesto** (EN `We don't have a
  breakdown of a top store in your niche yet.` / ES `Aún no tenemos el desglose de una tienda
  ganadora en tu nicho.`) + link a la Library. **No** usar un ganador de otro nicho ni del modo
  "global" diciendo que es tu competidor. No se gasta llamada de IA en este caso.

### 3.4 Gating (todo en el servidor, nunca solo en el cliente) — DECISIÓN DEL DUEÑO
**Anónimo y Free eligen UNO de los 4 botones** (incluido `urgent`). Hasta que eligen, ningún
track muestra fixes: se ve la fila de 4 botones + el texto
EN `Pick the fixes you want to see — free plan unlocks one.` /
ES `Elige qué fixes quieres ver — el plan gratis desbloquea uno.`

| Usuario | Antes de elegir | Después de elegir |
|---|---|---|
| Anónimo (cookie `ev_anon`) | 4 botones, ningún fix visible | El track elegido se habilita (si es nuevo, se genera). Fix #1 desbloqueado, resto con título visible + blur (patrón actual de `TopFixes`). Los otros 3 botones → candado + CTA crear cuenta / Pro. |
| Free con cuenta | igual | igual; CTA → Pro. |
| Pro / Scale | `urgent` abierto por defecto | Los 4 abiertos y completos; los nuevos se generan al primer clic y se cachean. |

Reglas:
- La elección es **una por análisis y definitiva**: se guarda en `fix_tracks.free_choice`
  (tanto para análisis de usuario como anónimos). Un 2º clic en otro track → candado, **sin llamar a la IA**.
- Confirmación ligera antes de fijar (no modal bloqueante; un segundo clic “Ver estos fixes / See these fixes”),
  para que nadie gaste su elección por error.
- Si el anónimo luego crea cuenta y el análisis se le asigna (flujo existente del anon-register-gate),
  la elección viaja con el análisis; no se resetea.
- Si el usuario se pasa a Pro, los 4 se abren sin perder lo ya generado.
- Anónimos: la ruta de tracks valida propiedad con la misma cookie firmada `ev_anon` que usa
  `app/api/anon-analyses/[id]/route.ts`. Añadir rate-limit por IP/cookie (reusar el que exista).
- Si eligen `urgent`, no hay llamada extra de IA (ya viene en el análisis). Elegir uno de los otros 3
  = exactamente 1 llamada extra. Máximo absoluto para free/anon: 1 llamada extra por análisis.

**Importante — no romper lo que depende de `top_fixes`:** el hero v2 (`onSeeFixes`), los
`ad_readiness.blockers` y `potential_why` citan el fix #1 por wording. Para free/anon que NO eligen
`urgent`, esos bloques siguen mostrándose como hoy (no se ocultan ni se re-gatean); solo la lista de
fixes de `#section-fixes` depende de la elección. Que `onSeeFixes` haga scroll a la fila de botones.

### 3.5 Detalles de UI
- Botones como segmented control accesible (`role="tablist"`, flechas de teclado, `aria-selected`);
  en móvil, fila con scroll horizontal, sin romper el ancho. Mismo estilo de la card actual.
- Estados: cargando (skeleton + `Generating your fixes… ~15 s` / `Generando tus fixes… ~15 s`),
  error (reintentar), vacío honesto (competitor), bloqueado (candado + CTA Pro).
- El track elegido se recuerda solo en la URL (`?fixes=post_purchase`) para poder compartir/recargar;
  no en localStorage.
- Reportes compartidos / Community (`app/actions/share.ts`, `app/(app)/app/community/...`):
  muestran solo `urgent`. Los tracks generados son privados del dueño del análisis.
- La REST API v1 no cambia en este brief.
- Evento PostHog `fix_track_selected` `{ track, plan, cached }` — sirve para validar cuál de las
  3 promesas de la landing es la que la gente realmente quiere.
- Flag en código `ANALYZER_FIX_TRACKS` (constante con default en git, patrón de
  `ANALYZER_META_PROMO`). Apagado ⇒ el reporte queda byte-idéntico a hoy.
- Todo string nuevo en `lib/i18n/messages.ts` en **en** y **es**.

### 3.6 Tests (mínimos)
- Schema: fix sin `evidence` o con `theme_slug` fuera de la lista → descartado.
- Ruta: dueño vs otro usuario (403), análisis no `succeeded`, track inválido (400).
- Caché: segundo GET no llama al provider (mock).
- Gating: free y anónimo fijan 1 track; pedir un 2º distinto → bloqueado sin llamar a la IA;
  elegir `urgent` → 0 llamadas; anónimo con cookie ajena → 403.
- `competitor` sin ganador con teardown → estado vacío, 0 llamadas a la IA.
- `post_purchase` siempre renderiza la línea de "no vemos tu checkout ni tus emails".
- `capture_blocked` → ningún track se genera.
- Flag off → `TopFixes` renderiza como hoy.

---

## §4 — Auditoría de los features premium + "Top tiendas de tu nicho"

### 4.0 Objetivo
Que cada feature de pago **funcione, sea útil para el merchant y no mienta**. Primero se audita
(WP-4, solo lectura + reporte), después se arregla (WP-5, WP-6). Nada de esta sección puede tocar
el camino crítico del análisis principal (ver §5).

### 4.1 WP-4 — Auditoría (sin cambiar código de producto)
Entregable: `docs/premium-audit-REPORT.md` con, por feature: estado (funciona / roto / engañoso),
evidencia (archivo:línea, query o captura), impacto para el usuario y fix propuesto.

Features a auditar, con cuentas reales de cada plan (`scripts/force-plan.mjs`, `create-test-user.mjs`)
y al menos 3 tiendas de nichos distintos:

| Feature | Plan | Qué verificar |
|---|---|---|
| Meta Campaign Scenario Modeler (simulador) | Pro (1/mes) + Scale (ilimitado) | Ver 4.2 en detalle. |
| Meta Ads Optimizer | Solo Scale (Pro ve `LockedMetaAdsPreview`) | Que los targets CPC/CPM/CTR/ROAS caigan dentro de `lib/meta/niche-benchmarks.ts` para el nicho; que los caveats salgan; que no contradiga al simulador del mismo análisis. |
| Fixes completos + buyer persona | Pro/Scale | Que se desbloquee todo; que free vea exactamente lo que dice la página de pricing. |
| Library completa + búsqueda por imagen | Pro/Scale | Que la búsqueda devuelva resultados del nicho, que no haya tiendas muertas (`is_live=false`) ni bloqueadas. |
| Winners en tu nicho (card del reporte) | Free ve teaser bloqueado, pago ve todo | Ver 4.3. |
| Cuotas | 40/mes Pro, 200/mes Scale, 1 proyección/mes Pro | Que se cuenten bien y que el mensaje al llegar al límite sea claro. |
| Compare Mode / publicar en Community | Pro/Scale | Que funcione end-to-end. |
| Coherencia pricing ↔ producto | Todos | Cada bullet de la tabla de pricing de la landing debe existir y estar en el plan que dice. Lo que no exista → listar para quitarlo del pricing o construirlo. |

Gating que el dueño ya fijó y que debe seguir cumpliéndose: Simulator Pro+Scale (`canRunMeta`),
Optimizer solo Scale, Library completa solo pago, anónimo 1 análisis + alerta de cuenta a los 40 s.

### 4.2 Simulador de Meta — "de calidad"
El simulador es el feature estrella; tiene que resistir que un media buyer lo mire.
Hoy `ai/agents/run-meta-simulation.ts` corre 3 llamadas de IA secuenciales (una por escenario)
en Flash-Lite gratis (15 RPM). Verificar y, si falla, arreglar:

1. **Matemática coherente, calculada en código.** Para cada escenario debe cumplirse
   `spend → impresiones (CPM) → clics (CTR) → compras (CVR) → revenue (AOV) → ROAS`, sin
   contradicciones. Si hoy la IA inventa esos números, pasar el cálculo a código
   determinista (`lib/meta/` ya tiene `niche-benchmarks.ts` y `roas-range.ts`) con inputs:
   benchmarks del nicho + AOV/presupuesto/margen/país del usuario + el score interno del análisis.
   La IA queda solo para la narrativa (por qué ese escenario, riesgos, qué testear).
2. **Orden lógico:** conservador ≤ balanceado ≤ agresivo en ROAS y compras, siempre.
3. **Sensibilidad real:** subir AOV o presupuesto mueve los números en la dirección correcta;
   una tienda con peor ad-readiness proyecta peor que una mejor del mismo nicho.
4. **Break-even visible:** con el margen del usuario, mostrar el ROAS de equilibrio y si cada
   escenario gana o pierde dinero. Es la métrica que de verdad "reduce el riesgo de perder capital".
5. **Honestidad:** rangos, no falsas precisiones; "estimaciones, no garantías" visible.
6. **Velocidad y cuota:** si la matemática pasa a código, reemplazar las 3 llamadas por **1**
   (narrativa de los 3 escenarios juntos). Menos tiempo y menos riesgo de 429.
7. Test de propiedades: para N combinaciones de inputs, invariantes 1–3 siempre se cumplen.

### 4.3 "Top tiendas de tu nicho" → que lleven a la TIENDA, no a los anuncios
Captura del dueño: card "Winners in your niche" (ej. Pet: Tuft & Paw, Fable Pets, Wild One) con
botón **"See their active ads"** que abre la Meta Ad Library.

Cambios:
1. **CTA principal = visitar la tienda.** En `components/analyzer/niche-winners.tsx`, el botón pasa a
   abrir `w.url` (la tienda) con `target="_blank" rel="noopener nofollow"`.
   - EN `Visit their store` / ES `Visitar su tienda`; ícono `ExternalLink` (no `Megaphone`).
   - El nombre de la tienda también enlaza a `w.url`.
   - Quitar el link a la Ad Library de la card (puede quedar dentro de la Library completa si se quiere,
     pero no en el reporte).
   - Link limpio, sin UTMs ni parámetros (es la tienda de un tercero).
2. **El badge "N active ads" se queda como señal** de que la tienda está escalando (es la prueba de
   que es "ganadora"), pero ya no es el destino del clic. Si `activeAds` es null, no se muestra.
3. **Base de datos de top tiendas por nicho.** Ya existe: `winning_sites` (status `published`,
   `is_live`, `momentum_score`, `teardown`), alimentada por `scripts/library/discover → verify → momentum`.
   No crear otra tabla. Lo que hay que hacer:
   - **Medir cobertura:** query por nicho de `NICHE_LABELS` (`lib/library/niche-pages.ts`) contando
     tiendas `published AND is_live`, y cuántas tienen `teardown`. Incluir la tabla en el REPORT de WP-4.
   - **Objetivo:** ≥ 5 tiendas vivas por nicho y ≥ 1 con `teardown` (este último lo necesita el track
     `competitor` de la §3). Para nichos por debajo: correr el pipeline de `scripts/library/`
     (discover/verify/momentum/audit) — es offline, no corre en el request del usuario.
   - **Frescura:** las tiendas muertas o que redirigen deben salir solas (`verify.mts` ya marca
     `is_live`). Confirmar que `last_verified_at` se refresca y documentar cada cuánto correrlo a mano
     (no hay cron pago; Vercel Hobby).
   - **Nunca mostrar como competidor una tienda de otro nicho** diciendo que es "tu nicho": el modo
     `scope: "global"` ya existe y debe seguir con su propio título ("Top converting stores").
4. **Gating sin cambios:** Free ve el teaser bloqueado como hoy; pago ve las 3 con link a la tienda.
5. El texto del pie ("Estimated from public signals…") se mantiene.

### 4.4 WP-5 / WP-6 — Arreglos
- **WP-5:** simulador (4.2) + optimizer, según lo que salga en el REPORT.
- **WP-6:** card de winners (4.3 puntos 1, 2, 4, 5) + cobertura de la Library (4.3 punto 3) +
  cualquier incoherencia pricing ↔ producto encontrada (preferir corregir el texto del pricing antes
  que construir features nuevas; listar lo que se quite para que el dueño apruebe).
- Si el REPORT encuentra algo grave fuera de esta lista, **parar y reportar** al dueño antes de
  arreglarlo.

---

## §5 — Guardarraíl de velocidad (aplica a TODOS los WPs)

El Analyzer está rápido ahora y no puede empeorar.
- **Prohibido** añadir llamadas de IA, fetches externos o queries pesadas al pipeline del análisis
  principal (Inngest → captura → visión → persistencia). Lo único permitido es el campo
  `observed_palette` de la §3 (unos ~30 tokens de salida), y solo si la medición lo aprueba.
- No tocar `ai/providers/gemini.ts` (hedge, thinking, modelos) ni la concurrencia de Inngest.
- **Medición antes/después:** antes de empezar, medir p50/p95/éxito con `scripts/measure-analyzer-latency.mts`
  (o la query de timings de `0034_analysis_timings.sql`) sobre las mismas 5 tiendas; repetir al
  final de cada WP que toque el reporte o el schema. Si el p50 sube más de ~2 s o baja la tasa de
  éxito → revertir ese cambio. Anotar los números en el REPORT de cada WP.
- Todo lo nuevo (tracks, winners, simulador) va **fuera** del camino crítico: bajo demanda, en
  caché, o precomputado offline.
- Cuota Gemini gratis: ninguna acción de un usuario free/anónimo puede disparar más de 1 llamada
  extra por análisis.
- No tocar `app/liquid` ni el repo de la app de Shopify.

---

## Criterios de aceptación

**§4:**
12. `docs/premium-audit-REPORT.md` existe, con estado de cada feature, cobertura de la Library por
    nicho y latencia antes/después.
13. Simulador: invariantes de 4.2 cubiertos por test; break-even visible; ≤ 1 llamada de IA por simulación
    (si la matemática pasó a código).
14. Card de winners: el botón abre la tienda (no la Ad Library), en en y es; free sigue bloqueado.
15. Ningún nicho de `NICHE_LABELS` con < 5 tiendas vivas sin estar listado en el REPORT.



**§3:**
8. El p50 del análisis principal no sube más de ~2 s respecto a antes del merge (medir con timings).
9. Cada track nuevo responde en ≤ ~20 s la primera vez y es instantáneo después (caché).
10. Ningún fix mostrado es genérico: cada uno tiene `evidence` de esa tienda (revisión manual en
    3 tiendas reales de nichos distintos, en en y es).
11. Gating verificado con 4 cuentas: anónimo, free, pro, scale.

**§1 + §2:**

1. `view-source` de `/` (sin cookie, país US): `<title>` y `<h1>` contienen "store audit".
2. Con `?lang=es`: H1 en español, tarjetas en español, eyebrow "Aquí descubrirás".
3. Tarjeta 3 idéntica a la de producción hoy (texto, ícono, posición) en ambos idiomas.
4. Tarjetas 1, 2 y 4 con copy e íconos nuevos en ambos idiomas; ninguna clave cae al fallback inglés en ES.
5. `npm run typecheck` y la suite de tests en verde (incluido `landing-keyword.test.ts` actualizado).
6. Revisión visual móvil/tablet/desktop: grid 1/2/4 columnas intacto, títulos largos sin romper alturas.
7. Subagente de verificación confirma 1–6 y que la §2.5 está resuelta antes del merge a main.

---

## Decisiones del dueño (2026-10-09, tras `docs/premium-audit-REPORT.md`)

Estas decisiones **prevalecen** sobre lo escrito arriba donde difieran.

1. **Library (H1):** filtrar `status='published' AND is_live=true` en TODO el código (listado/búsqueda, contadores, páginas SEO por nicho, dashboard) **y** cerrar la política RLS de `winning_sites` para que `anon`/`authenticated` solo lean filas publicadas y vivas. Verificar después Library, búsqueda por imagen, card de winners y páginas SEO. → WP-6.
2. **Optimizer (H4):** Scale-only, bloqueado **en el servidor** (payload, polling y la corrida de Inngest), no solo en la UI. Pro ve `LockedMetaAdsPreview` como upsell. El pricing ("solo Scale") no cambia. → WP-5 (hecho).
3. **Pricing (H6):** quitar "Priority queue + priority support" del pricing en en y es. Compare Mode: gatear en el servidor (Pro/Scale). Texto del plan Free: "1 auditoría gratis + eliges un tipo de fixes". → WP-6.
4. **Cobertura (H2):** revisar las 17 tiendas en `review` y subir a `published` solo las que pasen `scripts/library/verify.mts`; luego correr discover/verify/momentum para los 6 nichos con < 5 tiendas vivas, priorizando generar **teardowns** para los 9 nichos que no tienen. → WP-6.
   - Elegir un track vacío (`competitor` sin teardown) **no** consume `free_choice` (hecho en WP-2).
   - Mientras el nicho del análisis no tenga un ganador con teardown, el botón `competitor` se ve **deshabilitado** con "Pronto en tu nicho / Coming soon for your niche" y no se puede elegir (hecho en WP-3).
5. **Pruebas end-to-end con cuentas reales:** al final de WP-6, **una sola tienda, una corrida por plan** (anónimo, free, pro, scale). No repetir sin necesidad (cuota de Gemini).

### Estado de los WPs
| WP | Estado |
|---|---|
| WP-0 línea base de latencia | mergeado (#87) |
| WP-1 H1 "store audit" | mergeado (#88) |
| WP-2 Fix Tracks backend + migración 0036 (aplicada en prod 2026-10-09) | mergeado (#90) |
| WP-3 Fix Tracks UI + tarjetas landing | mergeado (#92), flag `ANALYZER_FIX_TRACKS` ON |
| WP-4 auditoría premium | informe en #93 |
| WP-5 simulador determinista + Optimizer Scale-only | PR abierto |
| WP-6 winners → tienda, Library, pricing, cobertura, E2E por plan | pendiente |

### Notas de implementación WP-5
- Motor determinista en `lib/meta/simulation-engine.ts`; la IA solo escribe la narrativa en **1** llamada (`ai/agents/meta-scenario-narrative-agent.ts`) con respaldo determinista. Invariantes cubiertos por tests de propiedades (`scripts/tests/meta-simulation-engine.test.ts`).
- El agente por escenario (`meta-campaign-scenario-agent.ts`) se eliminó.
- Los targets del Optimizer se recortan en código a las bandas del nicho y al rango de ROAS modelado de la auditoría (`lib/meta/optimizer-targets.ts`).
- Limitación conocida: la narrativa del simulador sigue siendo solo en inglés (como antes).
