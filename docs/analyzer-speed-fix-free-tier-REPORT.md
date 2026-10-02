# Reporte — Analyzer lento en Gemini free + Vercel Hobby (`fix/analyzer-speed-free-tier`)

Brief: `docs/analyzer-speed-fix-free-tier.md`. Fecha: 1-oct-2026 (noche, hora Guayaquil). **No mergeado. No se tocó
ninguna variable de Vercel ni ninguna clave.**

## 0. Resumen en 6 líneas

1. **Confirmado y medido:** Inngest ejecuta el pipeline del deploy **`a27321e` (3-sep-2026)**, no el de producción
   `624d27c`. Un mes de fixes del pipeline **nunca corrió** (#50, #60, #62, #63, #65, #69… y también el fix de correos
   de recuperación duplicados #49, que vive en otra función de Inngest).
2. **Hallazgo nuevo, más grave que el 503:** en el tier gratis, `gemini-3.6-flash`, `gemini-3.5-flash` y
   `gemini-2.5-flash-lite` tienen **20 peticiones/día por proyecto** (`GenerateRequestsPerDayPerProjectPerModel-FreeTier
   limit=20`, leído del propio 429). Con 6 claves = 120/día para todo el sitio, y cada audit gasta varias (visión +
   hedge + niche-winners + reintentos). El modelo principal actual se agota a diario.
3. **Benchmark real** (8 modelos, 159 llamadas, 3 tiendas incl. una pesada): el mejor equilibrio velocidad/calidad es
   **`gemini-3.1-flash-lite` con thinking=0** (p50 6.1 s, p90 11.7 s, calidad a la par de 3.6-flash). El más rápido y
   fiable es `gemini-3.5-flash-lite` (p50 4.4 s, p90 5.9 s, 14/15) pero su reporte es más pobre → lo dejo de 2º.
4. **Código (Paquete C):** un 503 salta al siguiente modelo **al instante** (sin backoff de 4 s ni quemar claves); si el
   modelo no responde en 25 s, el siguiente modelo **corre en paralelo** en el mismo step y gana la primera respuesta
   que valida el schema.
5. **Medición (Paquete D):** `usage_events` ahora sale con `event_type='analysis'` + `analysisId` + `latencyMs/model/
   hedged/fellBackFrom`; nueva columna `analyses.timings` (migración 0034, **aplicada**); script de reporte.
6. **Checks = baseline:** tests 449/449 (424 + 25 nuevos), typecheck 244 (= main), lint 113 (= main), build OK.
   La meta (p50 ≤ 40 s, p90 ≤ 60 s, ≤1/10 refunds) **no se puede verificar hasta que el dueño haga los pasos de §8.**

---

## 1. Paquete A — producción no ejecutaba el código de producción

### Qué deploy es `elite-vault-5k6ahjzbt`

| | Deploy | Commit | Creado (UTC) |
|---|---|---|---|
| Web (producción) | `elite-vault-ba9faj4mk` | `624d27c` (PR #69) | 2026-10-01 20:14 |
| **Inngest llama a** | `elite-vault-5k6ahjzbt` (`dpl_HoPsBWaASN5KnHf8s2LHoaQoNwsT`) | **`a27321e`** "Merge branch 'feat/blog-bofu-2026'" | **2026-09-03 01:21** |

(Obtenido con `vercel inspect` + `vercel api /v13/deployments/<url>`.)

**Pruebas independientes de que el pipeline es el viejo** (desde la base de datos de producción):
- De ~80 audits desde el 20-sep, **solo 2** traen `result.potential_why` (campo que añadió el PR #65 al pipeline).
- Las filas de `usage_events` del analyzer no tienen `meta.hedged` (lo añadió el PR #50 en cuanto hay hedge), aunque los
  logs dicen que sí hubo hedge.
- El log *"slow past **12s**"*: en `a27321e` el hedge sale de `GEMINI_HEDGE_AFTER_MS` (env de Vercel = 12000), y la
  llamada de visión todavía no forzaba su propio hedge. **El "12s" es el valor real de ese código viejo**, no un
  texto fijo. Con el código nuevo la llamada de visión imprimirá *"slow past 9s"* (`ANALYZER_HEDGE_AFTER_MS`, default
  9000) y las demás llamadas seguirán diciendo 12s (la env global).

### Cambio

- `app/api/inngest/route.ts`: `serveHost: resolveInngestServeHost(process.env)`.
- `lib/inngest-serve-host.ts`: devuelve `INNGEST_SERVE_HOST` **solo si `VERCEL_ENV === "production"`** y es una URL
  absoluta http(s); en preview/local → `undefined` (comportamiento actual). Funciones registradas, `maxDuration = 60` y
  `streaming` sin tocar.
- `.env.example` documenta `INNGEST_SERVE_HOST=https://elitevaultapp.com`.

⚠ **Importante:** el SDK de Inngest (3.54) **también lee `INNGEST_SERVE_HOST` del entorno por su cuenta**. Por eso la
variable debe crearse en Vercel **solo con scope Production**. Si se pone también en Preview, los previews se
registrarían con el dominio de producción.

### Qué significa "Needs Attention" en `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY`

Vercel marca así las variables que creó una **integración** (Vercel ↔ Inngest) cuando la integración ya no puede
gestionarlas: integración desconectada, permisos revocados, o la app de Inngest relinkeada a otro proyecto. Los valores
siguen ahí, pero la integración **ya no sincroniza la app en cada deploy** — encaja exactamente con "Inngest se quedó
pegado en el deploy del 3-sep": el último sync que funcionó fue ese, y desde entonces ningún deploy se registró.

No toqué las claves. Pasos para reconectar en §8 (paso 3b).

> Nota: `GET https://elitevaultapp.com/api/inngest` responde `401 {"message":"Unauthorized"}` con
> `X-Inngest-Sdk-Handled: true`. Eso es **normal** en este SDK (un GET sin firma siempre se rechaza en modo cloud);
> no indica por sí solo que la clave esté mal. El `PUT` del §8 sí lo dirá.

## 2. Paquete B — benchmark de la llamada de visión (gratis)

Script: `scripts/benchmark-vision-models.mts` (nuevo). Llamada REAL: mismo `ANALYZER_SYSTEM`, mismo
`buildAnalyzerUserMessage` con el texto de discovery en vivo, mismo schema (`toGeminiSchema(ANALYSIS_TOOL_SCHEMA)`),
temperatura 0.2, 8192 tokens, capturas reales de producción. **Un intento por muestra, sin rotación/hedge/fallback**
(para medir el modelo, no la escalera), abortado a 50 s como el step. Llamadas intercaladas (ronda → tienda → modelos en
orden aleatorio). Datos crudos: `docs/benchmarks/vision-models-2026-10-01-r{1,2}.jsonl`.

Tiendas: **myndr.shop** (ligera, 156 KB, refund hoy), **goldx3 PDP** (media, 357 KB, refund hoy), **artazest PDP**
(pesada/alta, 463 KB, el caso histórico). 2 rondas: R1 01:40–02:40 UTC (8 modelos × thinking {256, 0} × 3 tiendas × 2),
R2 ~02:45–03:15 UTC (finalistas × 3 tiendas × 3).

`p50/p90 (todos)` cuenta un fallo/timeout/503/429/truncado como "no respondió dentro del step" — es lo que vive el step.

| Modelo | thinking | n | OK válido | p50 OK | p90 OK | p50 (todos) | p90 (todos) | 503 | 429 | timeout | JSON válido sin repair | tokens salida (mediana) | tiendas |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| gemini-3.5-flash-lite | 256 | 15 | 14/15 | 4.4s | 5.9s | 4.5s | 6.2s | 0 | 0 | 0 | 100% (14/14) | 856 | 3 |
| **gemini-3.1-flash-lite** | **0** | 15 | 13/15 | 6.1s | 11.7s | 6.8s | >50s | 0 | 0 | 0 | 100% (13/13) | 1126 | 3 |
| gemini-2.5-flash-lite | 256 | 6 | 4/6 | 6.7s | 8.8s | 6.8s | >50s | 2 | 0 | 0 | 100% (4/4) | 1316 | 3 |
| gemini-2.5-flash | 256 | 6 | 4/6 | 17.7s | 28.3s | 25.1s | >50s | 0 | 0 | 2 | 100% (4/4) | 1352 | 3 |
| gemini-3.5-flash | 256 | 6 | 2/6 | 7.1s | 23.7s | >50s | >50s | 3 | 0 | 1 | 100% (2/2) | 1012 | 3 |
| gemini-3.5-flash-lite | 0 | 6 | 0/6 | — | — | >50s | >50s | 0 | 0 | 0 | 0% (0/0) | — | 3 |
| gemini-3.6-flash (actual) | 256 | 15 | 5/15 | 9.6s | 20.9s | >50s | >50s | 2 | 8 | 0 | 100% (5/5) | 1216 | 3 |
| gemini-2.5-flash-lite | 0 | 15 | 7/15 | 6.3s | 20.6s | >50s | >50s | 1 | 6 | 0 | 88% (7/8) | 1371 | 3 |
| gemini-3.5-flash | 0 | 15 | 3/15 | 8.0s | 8.7s | >50s | >50s | 3 | 9 | 0 | 100% (3/3) | 1100 | 3 |
| gemini-3.6-flash (actual) | 0 | 15 | 3/15 | 8.8s | 19.5s | >50s | >50s | 2 | 10 | 0 | 100% (3/3) | 1176 | 3 |
| gemini-2.5-flash | 0 | 15 | 7/15 | 12.1s | 47.4s | >50s | >50s | 3 | 1 | 3 | 88% (7/8) | 1496 | 3 |
| gemini-3.1-flash-lite | 256 | 6 | 2/6 | 10.0s | 20.9s | >50s | >50s | 1 | 0 | 3 | 100% (2/2) | 1114 | 3 |
| gemini-3.7-flash | 256 | 6 | 0/6 | — | — | >50s | >50s | 5 | 0 | 1 | 0% (0/0) | — | 3 |
| gemini-3.8-flash | 0 | 6 | 0/6 | — | — | >50s | >50s | 6 | 0 | 0 | 0% (0/0) | — | 3 |
| gemini-3.8-flash | 256 | 6 | 1/6 | 11.4s | 11.4s | >50s | >50s | 5 | 0 | 0 | 100% (1/1) | 1327 | 3 |
| gemini-3.7-flash | 0 | 6 | 1/6 | 6.1s | 6.1s | >50s | >50s | 5 | 0 | 0 | 100% (1/1) | 1259 | 3 |

Lo que dice la tabla:
- **3.6-flash (el actual) está saturado y además topado:** 503 en R1 y, en R2, **429 por cuota diaria** (límite 20/día
  por proyecto, leído del error). 3.7/3.8-flash: 503 casi siempre. 3.5-flash y 2.5-flash-lite: también 20/día.
- **3.1-flash-lite necesita thinking=0:** con 256 **ignora el budget** (reporta ~1600 tokens de thinking) y 3/6 se
  pasaron de 50 s; con 0, 13/15 en p50 6 s. Sus 2 fallos fueron **generaciones desbocadas** (~8170 tokens → truncado);
  en producción eso dispara el retry de truncado o, a los 25 s, el cambio de modelo — cuesta tiempo, no un refund.
- **3.5-flash-lite** es el más rápido y estable (0×503, 0×429, 14/15; 1 desbocada). **Rechaza thinking=0** con un 400
  genérico en el 100% de las llamadas (ver §3.4).
- Ningún 429 en 3.1-flash-lite ni 3.5-flash-lite tras ~24 llamadas cada uno en la misma clave el mismo día: su límite
  diario es **mayor que 20, pero no lo conozco** (Google solo lo dice al agotarlo). Ver §8 paso 2.

### Calidad lado a lado (3 tiendas) — para que el dueño juzgue

**myndr.shop** (perimenopausia, $97):
- *3.6-flash (actual)*: 4 anotaciones, 4 fixes. Detecta el pop-up de descuento **y que el hero muestra un pintalabios
  vendiendo un suplemento**, buy box bajo el fold, reviews abajo.
- *3.1-flash-lite t0 (recomendado)*: 3 anotaciones, 3 fixes. "Kill the full-screen pop-up", **"Align hero imagery with
  the product — the current lipstick/books image creates cognitive dissonance"**, value prop bajo el fold. Mismo
  diagnóstico, tono más directo.
- *3.5-flash-lite (2º)*: 1 anotación, 2 fixes (pop-up, social proof). **No ve el hero incongruente.** Puntúa más alto
  (80/50/75/60/70/45 vs 40/35/60/30/50/35).

**goldx3 PDP** (aretes de oro, $498):
- *3.6-flash*: foto hero pobre, 0 reviews en un item de $500, botón Shop Pay que eclipsa Add to Cart.
- *3.1-flash-lite t0*: widget de reviews, fotos lifestyle, jerarquía del buy box. Equivalente.
- *3.5-flash-lite*: foto en modelo + reviews (2 fixes). Correcto pero más corto y con scores más altos (85/80/65/70/82/60).

**artazest PDP** (muestras de color, $6) — 3.6-flash no dio ninguna respuesta válida en esta tienda (503):
- *3.1-flash-lite t0*: social proof/UGC, copy funcional en vez de poético, **conectar la muestra de $6 con el panel de
  $300+** (descuento/crédito). El más útil de los tres.
- *3.5-flash-lite*: fotos de clientes + especificaciones del swatch. Scores 90/85/88/80/85/72 (muy generosos).
- *2.5-flash (stable)*: correcto pero genérico y largo.

Conclusión de calidad: **3.1-flash-lite (t0) ≈ 3.6-flash**. 3.5-flash-lite es un buen *salvavidas* pero como modelo
principal empobrecería el reporte y **subiría los scores** (y con ellos la banda de potencial de V2).

### Recomendación (no aplicada — la env de producción manda)

| Variable (Vercel, Production) | Valor recomendado | Por qué |
|---|---|---|
| `GEMINI_MODEL` | `gemini-3.1-flash-lite` | p90 más bajo de los que dan calidad comparable; 100% JSON válido sin repair; 0×503/429 |
| `GEMINI_THINKING_BUDGET_BY_MODEL` | `gemini-3.1-flash-lite=0` | **nueva** env; sin esto 3.1-flash-lite es lento (ignora 256) |
| `GEMINI_MODEL_FAST` | `gemini-3.5-flash-lite` | 2º más rápido y el más estable. ⚠ También pasa a ser el modelo de los **audits gratis** (más rápidos, reporte más corto) |
| `GEMINI_MODEL_STABLE` | `gemini-2.5-flash` (dejar) | lento pero otro backend y sin el muro de 20/día en la prueba |
| `GEMINI_THINKING_BUDGET` | no tocar (256) | **no** ponerlo en 0 global: 3.5-flash-lite rechaza 0 |

Cadena resultante — pagos: `3.1-flash-lite → 3.5-flash-lite → 2.5-flash`; gratis: `3.5-flash-lite → 2.5-flash`.
Los defaults del código (`ai/providers/gemini.ts` L25-30) **no los cambié**: la env de producción manda y cambiar el
default movería también local/preview sin que nadie lo decida.

## 3. Paquete C — no perder 60+ s esperando a un modelo saturado

Todo en `ai/providers/gemini.ts`, dentro del mismo step y del mismo `lib/deadline.ts` (no reescrito).

1. **503 "high demand" → siguiente modelo al instante.** Si queda otro modelo en la cadena, el 503 sale de inmediato
   (sin backoff de 4 s y sin probar las otras claves del mismo modelo). Solo el **último** modelo conserva su único
   reintento same-model (no tiene a dónde ir). 429 sigue rotando claves igual que hoy.
2. **Cambio de modelo a los 25 s.** Nueva opción `modelSwitchAfterMs` (el analyzer la pone desde
   `ANALYZER_MODEL_SWITCH_AFTER_MS`, default 25000, 0 = off, valores 1-4999 suben a 5000). Si `modelChain[0]` (primaria +
   hedge) no respondió, arranca **en paralelo** el resto de la cadena; gana la primera respuesta que pase
   `AnalysisResultSchema` (`accept`); la perdedora se aborta. Si ninguna valida, se devuelve la de la primaria para que
   el repair pass del analyzer haga su trabajo. No arranca si no queda presupuesto para una llamada completa (8 s). Un
   fallo de la primaria **antes** de los 25 s hace el fallback secuencial de siempre (el timer no lanza una segunda
   copia). Un cancel del caller aborta ambas.
3. **Hedge de 9 s:** el código ya lo aplica en la llamada de visión (PR #62/#69) y el log imprime el valor real. Hoy no
   se ve porque el pipeline es `a27321e`. Tras §8 debe aparecer *"slow past 9s"* en las llamadas de visión.
4. **Thinking 0 vs 256** (medido en §2): 0 es claramente mejor **solo** para 3.1-flash-lite; 3.6-flash da igual
   (8.8 vs 9.6 s); 3.5-flash-lite **rechaza** 0. Por eso añadí `GEMINI_THINKING_BUDGET_BY_MODEL` (solo env) en lugar de
   recomendar 0 global. Y un self-heal: el 400 genérico de "no puedo apagar el thinking" (sin la palabra *thinking*)
   ahora se reconoce **solo cuando el budget enviado era 0**, y se reintenta sin `thinkingConfig` en vez de tirar el
   modelo.
5. **Intacto:** `capture_blocked`, `potential_why` tolerante, repair pass solo si cabe, refund al pasar el presupuesto
   total, `maxDuration = 60`, step budget 50 s, total 150 s.

## 4. Paquete D — medición

1. **Meter:** `enterMeter` (AsyncLocalStorage `enterWith`) se perdía porque Inngest ejecuta cada `step.run` desde su
   propio scheduler, fuera del contexto del handler. Ahora los 4 steps que llaman a la IA (`quick-score`,
   `run-analyzer-agent`, `run-meta-ads-agent`, `match-niche-winners`) re-entran con `runWithMeter`. Cada fila lleva
   `event_type='analysis'`, `meta.analysisId` y además `latencyMs`, `model` (el que **respondió**; antes siempre
   registraba el primero de la cadena), `hedged`, `fellBackFrom`, `modelSwitched`.
2. **Migración `0034_analysis_timings.sql` (+ `supabase/rollbacks/0034_analysis_timings_rollback.sql`) — APLICADA a
   producción** con `npm run db:migrate` y verificada (columna legible). `analyses.timings` =
   `{ v, captureMs, captureCached, visionMs, saveMs, totalMs, model, attempts: { vision }, hedged, fellBackFrom,
   modelSwitched }`. Se escribe en `save-result` en un **update separado, después** de marcar `succeeded`, con un
   helper que nunca lanza: si algo falla solo se pierde la fila de diagnóstico. El `result` del audit **no cambia**
   (timing viaja al lado, no dentro). Compatibilidad: un run en vuelo durante el deploy reproduce la salida memoizada
   vieja (el audit sin envoltorio) y `unwrapAnalyzerStep` acepta ambas formas.
   - Aviso: el ledger de migraciones tiene un `0034_blocks_catalog.sql` huérfano (aplicado desde la rama de bloques, sin
     mergear). No choca con esta migración, pero esa rama deberá renumerar su archivo si algún día se mergea.
3. **`scripts/analyzer-latency-report.mjs`**: p50/p90/refunds por día (Guayaquil) y por modelo, p50 de visión y captura
   cuando hay `timings`, y el veredicto de aceptación sobre los últimos N audits. Hoy (pipeline viejo, desde el 25-sep):
   n=56, p50 51 s, p90 145 s, 18/56 refunds → no cumple.

## 5. §6 — ¿los steps posteriores a `save-result` encolan el siguiente audit?

Medido en `analyses` (17-sep → hoy, n=121): espera en cola (`started_at − created_at`) **p50 1.5 s, p90 2.3 s**. De las
7 esperas > 10 s, 5 ocurrieron **sin ningún otro audit corriendo** (no es concurrencia: retraso de entrega de
Inngest) y 1 fue el límite por-usuario (1 a la vez, diseñado así). **Hoy no encolan.** `ENABLE_NICHE_WINNERS` sigue
fuera del critical path (después de `save-result`), pero sí retiene el slot global mientras corre y gasta cuota del
modelo FAST (que con 20/día importa): si la cuota se vuelve el cuello, es la primera candidata a apagar.

## 6. Checks vs baseline de `main` (624d27c)

| | main | rama |
|---|---|---|
| `npm test` | 424/424 | **449/449** (+25 nuevos) |
| `npm run typecheck` | 244 errores | 244 (mismos; ninguno en archivos tocados) |
| `npm run lint` | 113 (2 errores, 111 warnings) | 113 (iguales; ninguno en archivos tocados) |
| `npm run build` | OK | OK |

Tests nuevos (`scripts/tests/analyzer-speed-free-tier.test.mts` y `…-pure.test.ts`): 503 "high demand" salta de modelo
sin reintentar el mismo ni otras claves; el último modelo conserva su reintento; tope de 25 s lanza el siguiente modelo
y aborta el perdedor; solo gana una respuesta aceptada; switch apagado por defecto / con 0 / sin presupuesto; fallo
antes del switch = un único fallback; cancel aborta ambos; `serveHost` solo en producción; el meter conserva
`analysisId` dentro de un step (regresión con contexto perdido); los 4 steps de IA usan `metered`; `timings` nunca
rompe el save (columna ausente, cliente que lanza, solo escribe `timings` y después de `succeeded`); override de
thinking por modelo; 400 genérico con budget 0. Ajusté 3 tests existentes de `gemini-provider-wiring` (forma nueva de
`meta`; los que probaban el reintento 503 same-model ahora usan una cadena de un solo modelo, que es donde ese
reintento sigue existiendo).

## 7. Lo que NO puedo prometer (sin maquillaje)

- El benchmark es **una clave, una franja horaria (~01:40–03:15 UTC)** y consumió cuota de esa clave. Si la clave local
  es una de las 6 de producción, hoy le resté ~35 llamadas de 3.6-flash/3.5-flash/2.5-flash-lite (que ya estaban al
  límite).
- **Límite diario de 3.1-flash-lite y 3.5-flash-lite: desconocido** (> 20). Si fuera 20 también, con hedge + switch
  cada audit puede gastar hasta 3 llamadas de visión → ~40 audits/día con 6 proyectos antes de caer a 2.5-flash.
- Estimación (no medición) con el pipeline nuevo + modelos recomendados: cola ~1.5 s + captura 1–19 s (caché/frío) +
  visión p50 ~6 s / p90 ~12 s + 4-5 round-trips de Inngest → **p50 ~20–30 s, p90 ~45–60 s**. La única prueba válida
  es §8 paso 4.

---

## 8. Pasos manuales del dueño (en orden exacto)

**1. Mergear el PR** de `fix/analyzer-speed-free-tier` a `main` y esperar a que Vercel termine el deploy de producción
(Deployments → el commit del merge en "Ready").

**2. Vercel → Project elite-vault → Settings → Environment Variables** (scope **Production solamente**):
   - Añadir `INNGEST_SERVE_HOST` = `https://elitevaultapp.com` — **solo Production**, NO Preview/Development.
   - Cambiar `GEMINI_MODEL` = `gemini-3.1-flash-lite`
   - Añadir `GEMINI_THINKING_BUDGET_BY_MODEL` = `gemini-3.1-flash-lite=0`
   - Cambiar `GEMINI_MODEL_FAST` = `gemini-3.5-flash-lite` *(opcional; hace los audits gratis más rápidos con reporte
     más corto — si prefieres no tocar el gratis, déjalo y la cadena pagada será 3.1-flash-lite → tu FAST actual → stable)*
   - No tocar `GEMINI_THINKING_BUDGET` ni las claves.
   - Recomendado: en **AI Studio → Usage & limits** de uno de los proyectos, mira el límite diario (RPD) de
     `gemini-3.1-flash-lite` y `gemini-3.5-flash-lite`.
   - Luego **Deployments → último de producción → ⋯ → Redeploy** (para que tome las env nuevas).

**3. Resync de Inngest** (después del redeploy):
   - a) Desde cualquier terminal:
     ```bash
     curl -X PUT https://elitevaultapp.com/api/inngest
     ```
     Respuesta esperada: `{"message":"Successfully registered","modified":true}` (o similar con `200`). Si responde
     error de firma/clave → las claves de Inngest están mal → paso 3b.
     Alternativa en el dashboard: **app.inngest.com → Apps → elite-vault → Resync** → URL
     `https://elitevaultapp.com/api/inngest` → Resync.
   - b) **Si "Needs Attention" persiste o el PUT falla:** Vercel → Settings → **Integrations → Inngest → Manage** →
     reconectar/autorizar el proyecto `elite-vault`. (Alternativa sin integración: en app.inngest.com → **Manage →
     Signing Key / Event Keys** copia las de *Production* y pégalas tú en Vercel en `INNGEST_SIGNING_KEY` /
     `INNGEST_EVENT_KEY`, scope Production, y redeploy.) Repetir 3a.
   - c) Verificar: en app.inngest.com → Apps → elite-vault, la URL debe ser `https://elitevaultapp.com/api/inngest`
     (no `elite-vault-xxxx.vercel.app`) y el SDK/función `analyze-website` debe mostrar el deploy nuevo.
   - d) En Vercel → Logs, al correr un audit debe aparecer `[gemini] gemini-3.1-flash-lite key #N slow past 9s — hedging…`
     (si hay hedge) — el "9s" confirma que corre el código nuevo.

**4. Correr ≥ 10 audits reales** (tiendas variadas: ligeras, PDPs, una alta como artazest) y luego:
   ```bash
   node scripts/analyzer-latency-report.mjs --last 10
   ```
   Criterio: p50 ≤ 40 s, p90 ≤ 60 s, refunds ≤ 1/10. La columna "p50 visión" y la tabla "Por modelo" dicen dónde se va
   el tiempo y si se está cayendo a la cadena de fallback (cuota).

**Rollbacks sin deploy:** `ANALYZER_MODEL_SWITCH_AFTER_MS=0` (apaga el cambio de modelo), volver `GEMINI_MODEL` a su
valor anterior, borrar `GEMINI_THINKING_BUDGET_BY_MODEL`. `INNGEST_SERVE_HOST` borrada = comportamiento anterior.
La migración 0034 tiene rollback en `supabase/rollbacks/`.
