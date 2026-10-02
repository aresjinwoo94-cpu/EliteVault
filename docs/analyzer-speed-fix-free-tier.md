# EliteVault — Analyzer lento: volver a ~35 s de mediana en Gemini free + Vercel Hobby

Brief para Claude Code. Rama: `fix/analyzer-speed-free-tier` desde `main` actualizado. Un PR. **Reporta y DETENTE; no mergees.**

> **Restricciones fijas del dueño:** API de Gemini **gratis** y Vercel **Hobby** (máx 60 s por invocación). Nada que
> requiera pagar. No proponer "subir a Pro" como solución.
>
> **LÍNEA ROJA:** no romper NADA: créditos/refunds, gating (anónimo/Free/Pro/Scale), Stripe, soporte, links
> compartidos, reporte V2 (`potential_why`, radar, hero), API `/api/v1/analyses`. El reporte sigue saliendo igual de
> completo. Migraciones solo aditivas + rollback. Nunca `git add -A` (ruido CRLF). No imprimir ni commitear secretos.

---

## 1. Diagnóstico ya medido (1-oct-2026, producción). Úsalo; no lo vuelvas a adivinar

**Tiempos reales (`analyses`, desde `created_at` hasta `finished_at`, hora Guayaquil):**

| Día | Audits | OK | Fallidos/refund | p50 OK | p90 OK |
|---|---|---|---|---|---|
| 25-sep | 6 | 3 | 3 | **31 s** | 60 s |
| 26-sep | 10 | 8 | 2 | 44 s | 67 s |
| 27-sep | 7 | 7 | 0 | 51 s | 149 s |
| 28-sep | 6 | 2 | 4 | 95 s | 143 s |
| 29-sep | 4 | 2 | 2 | 96 s | 130 s |
| 30-sep | 12 | 9 | 3 | 69 s | 139 s |
| 01-oct | 7 | 3 | 4 | 79 s | 132 s |

Hoy los refunds son todos *"We stopped this audit because it passed our time limit"* (~178-188 s).
Log: `Total analysis budget exhausted at run-analyzer-agent — 176s`. **El tiempo se va en la llamada de visión.**

**Logs de Vercel (15:14-15:34 de hoy):**
- `model "gemini-3.6-flash" unavailable ({"error":{"code":503,"message":"This model is currently experiencing high demand…"}) — falling back to "gemini-3.5-flash"`
- `gemini-3.6-flash key #1/#3/#4 slow past 12s — hedging onto key #N` (en casi todos los audits)
- `gemini-3.5-flash key #2 got 503 (Google overload) — retry 1/1 after 4s`
→ **El modelo principal `GEMINI_MODEL=gemini-3.6-flash` está saturado del lado de Google.** Las claves gratis son las
primeras en sufrir la cola. Más claves no lo arreglan: las 6 tardan igual.

**Hallazgo crítico — el pipeline corre código VIEJO:**
- Producción actual: deploy `624d27c` (PR #69), URL `elite-vault-ba9faj4mk-…vercel.app`. La web sale de ahí.
- Pero **todas las llamadas de Inngest (`POST /api/inngest`) van a `elite-vault-5k6ahjzbt-…vercel.app`**, un deploy anterior.
- Prueba: los logs de hoy dicen *"slow past **12s**"*, pero el PR #69 bajó ese hedge a 9 s. **El PR #69 nunca llegó al
  pipeline.** Probablemente tampoco los cambios recientes que afectan al pipeline.
- En Vercel → Environment Variables, `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` aparecen como **"Needs Attention"**
  (Production y Preview).
- `app/api/inngest/route.ts` no fija `serveHost`, así que Inngest guarda la URL única del deploy que se sincronizó por
  última vez. Si un sync falla, se queda pegado en ese deploy viejo.

**Hallazgo secundario — la medición está rota:** en `usage_events`, las llamadas del analyzer se guardan con
`event_type = 'other'` y **sin `meta.analysisId`** (el contexto de `enterMeter` se pierde entre steps). Por eso hoy no se
puede medir costo ni latencia por audit.

**Producción (Vercel, nombres verificados):** `GEMINI_MODEL` (=gemini-3.6-flash), `GEMINI_MODEL_FAST`,
`GEMINI_MODEL_STABLE`, `GEMINI_API_KEY` + `_2…_6` (6 claves), `GEMINI_HEDGE_AFTER_MS`, `AI_PROVIDER`,
`ANALYZER_CONCURRENCY`, `ENABLE_NICHE_WINNERS`, `ANALYZER_QUICK_SCORE`, `ANALYZER_REPORT_V2`. Plan Hobby.

---

## 2. Paquete A — Que producción ejecute el código de producción (Inngest sync)

1. Averigua qué commit es `elite-vault-5k6ahjzbt` (`vercel ls` / `vercel inspect <url>` si el CLI está logueado; si no,
   compara con la lista de deploys) y repórtalo.
2. En `app/api/inngest/route.ts` añade `serveHost` **solo en producción**:
   `serveHost: process.env.VERCEL_ENV === "production" ? process.env.INNGEST_SERVE_HOST : undefined`
   (y `INNGEST_SERVE_HOST=https://elitevaultapp.com` documentado en `.env.example`). Así Inngest siempre llama al
   dominio estable, que siempre apunta al último deploy de producción. Preview y local no cambian.
   No toques las funciones registradas, `maxDuration` (60) ni `streaming`.
3. Después del merge y deploy, el sync se fuerza con `curl -X PUT https://elitevaultapp.com/api/inngest`
   (el SDK se re-registra). Dale al dueño el comando exacto y los pasos del dashboard de Inngest como alternativa:
   Apps → elite-vault → **Resync** → URL `https://elitevaultapp.com/api/inngest`.
4. Explica qué significa el "Needs Attention" de las claves de Inngest en Vercel. Si la integración Vercel↔Inngest
   está desconectada, da los pasos para reconectarla. **No cambies tú las claves.**

## 3. Paquete B — El modelo de visión: medir y elegir el más rápido que esté sano (gratis)

1. Con `scripts/measure-analyzer-latency.mts` (o extendiéndolo, sin romperlo), corre la llamada de visión REAL
   (mismo prompt, mismo schema, mismas capturas) contra cada candidato gratis disponible en las claves:
   `gemini-3.6-flash` (actual), `gemini-3.5-flash`, `gemini-2.5-flash`, `gemini-3.1-flash-lite` y cualquier otro
   `*-flash` que liste `scripts/gemini-pool-check.mts`.
   **n ≥ 5 por modelo, ≥ 3 tiendas distintas** (una larga/pesada). Registra p50, p90, tasa de 503/429, tokens de
   salida y si el JSON valida sin repair pass.
2. Elige como **primario** el de **p90 más bajo** que valide ≥ 95 % sin repair y dé un reporte de calidad comparable.
   Pon 3 ejemplos lado a lado en el reporte para que el dueño juzgue la calidad. Define la cadena de fallback
   (primario → segundo más rápido → `GEMINI_MODEL_STABLE`).
3. **No cambies tú `GEMINI_MODEL` en Vercel.** Deja el valor recomendado en el reporte. Si el código tiene defaults
   (`ai/providers/gemini.ts` L25-30), puedes alinearlos, pero la env de producción manda.

## 4. Paquete C — No perder 60+ s esperando a un modelo saturado (código, mismo step)

Objetivo: que la llamada de visión **termine dentro de UN step de 50-60 s** casi siempre, sin reintentar el step entero.
1. **503 "high demand" / UNAVAILABLE → saltar de inmediato al siguiente modelo** de la cadena. Sin backoff de 4 s sobre
   el mismo modelo saturado y sin quemar las 6 claves del mismo modelo (si una clave da 503 por "high demand", el resto
   del mismo modelo casi seguro también). 429 sigue rotando claves como hoy.
2. **Tope por intento:** si la mejor draw (primaria + hedge) no terminó a los ~25 s, lanza en paralelo el siguiente modelo
   de la cadena y quédate con el primero que valide. Todo dentro del mismo step y respetando `lib/deadline.ts`
   (no lo reescribas; úsalo). Ajusta con env (`ANALYZER_MODEL_SWITCH_AFTER_MS`, default 25000, 0 = off).
3. Confirma que el hedge forzado del PR #69 (9 s) **de verdad** se aplica en producción una vez resuelto el Paquete A,
   y que el mensaje de log muestra el valor real (hoy dice "12s" fijo o viene del deploy viejo; aclara cuál).
4. Thinking: mide la llamada de visión con `GEMINI_THINKING_BUDGET=0` vs 256 en el benchmark del Paquete B. Si 0 no
   empeora la calidad, recomiéndalo (solo env, no lo fuerces en código).
5. Mantén lo que ya existe: `capture_blocked`, `potential_why` tolerante, repair pass solo si cabe en el presupuesto,
   refund si se pasa del presupuesto total.

## 5. Paquete D — Medición que sirva (para no volver a volar a ciegas)

1. Arregla el meter para que cada llamada del analyzer quede con `event_type='analysis'` y `meta.analysisId` (el
   contexto se pierde entre `step.run`: pásalo explícito o re-entra `enterMeter` dentro de cada step que llama a la IA).
   Agrega a `meta`: `latencyMs`, `model`, `hedged`, `fellBackFrom`.
2. Migración aditiva `supabase/migrations/0034_analysis_timings.sql` (+ rollback): columna `analyses.timings jsonb`
   con ms por step (`capture`, `vision`, `save`), `model`, `attempts`. Escríbela en `save-result` (best-effort, nunca
   rompe el save). Aplica con `npm run db:migrate`.
3. Script `scripts/analyzer-latency-report.mjs`: p50/p90/refunds por día y por modelo desde `analyses` + `usage_events`.

## 6. No tocar / mantener

- `ENABLE_NICHE_WINNERS` y los steps posteriores a `save-result` siguen FUERA del critical path. Verifica que no
  retengan el slot de concurrencia de forma que encolen el siguiente audit; si lo hacen, repórtalo con datos.
- No subir `maxDuration` (Hobby = 60). No bajar el reporte (annotations, fixes, persona, `potential_why`) más de lo que ya
  dejó el PR #69.

## 7. Aceptación

1. `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`: 0 errores nuevos vs baseline de `main`.
2. Benchmark del Paquete B adjunto (tabla por modelo) + recomendación de `GEMINI_MODEL` y cadena de fallback.
3. Tests nuevos: 503 "high demand" salta de modelo sin reintentar el mismo; tope de 25 s lanza el siguiente modelo;
   `serveHost` solo en producción; meter guarda `analysisId`; `timings` nunca rompe el save.
4. **Meta del dueño: mediana ~35 s.** Criterio realista en free + Hobby: después del deploy + resync + cambio de modelo,
   **≥ 10 audits reales en producción** (tiendas variadas) con **p50 ≤ 40 s, p90 ≤ 60 s, refunds ≤ 1 de 10**.
   Medido con el script del Paquete D. Si no se alcanza, dilo claro con los números y la causa medida; no lo maquilles.

## 8. Entrega

PR con: qué cambió, benchmark, checks vs baseline, migración aplicada, y la **lista exacta de pasos del dueño**, en orden:
1. Mergear el PR.
2. Poner `INNGEST_SERVE_HOST=https://elitevaultapp.com` (Production) y el `GEMINI_MODEL` recomendado en Vercel → Redeploy.
3. Resync de Inngest (curl o dashboard).
4. Correr 10 audits y luego el script de latencia.
No mergees. No cambies variables de Vercel ni claves.
