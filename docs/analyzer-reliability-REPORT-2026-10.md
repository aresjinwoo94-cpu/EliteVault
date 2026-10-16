# Analyzer — informe de fiabilidad (§R, medición del 2026-10-13)

Solo lectura: no se cambió código. Datos de `analyses` (producción), ventanas "antes" (< 2026-10-02) y "después" (≥ 2026-10-02, fecha del arreglo de concurrencia, PR #70–72).

## 1. Éxito y latencia por semana

| Semana | Auditorías | OK | Fallidas/reembolsadas | % éxito | p50 (s) | p95 (s) |
|---|---|---|---|---|---|---|
| 08-31 | 31 | 24 | 7 | 77 % | 49 | 131 |
| 09-07 | 25 | 25 | 0 | 100 % | 43 | 77 |
| 09-14 | 53 | 36 | 17 | 68 % | 50 | 169 |
| 09-21 | 59 | 38 | 21 | 64 % | 48 | 154 |
| 09-28 | 62 | 49 | 13 | 79 % | 41 | 141 |
| **10-05** | 48 | 47 | **1** | **98 %** | **20** | **47** |
| **10-12 (parcial)** | 9 | 9 | 0 | 100 % | 20 | 50 |

**Después del arreglo (89 auditorías cerradas desde 10-02): 88 OK (98,9 %) · p50 21,8 s · p90 51,6 s · p95 78,6 s.** El "79 % / p95 118 s" del brief es de septiembre y ya no describe producción. Meta del dueño (~35 s de promedio): p50 21,8 s la cumple; el p95 sigue por encima del minuto.

## 2. Fallas clasificadas por causa (últimos 60 días)

| Causa (mensaje guardado) | Antes | Después |
|---|---|---|
| "Passed our time limit" (presupuesto total de 150 s) | 46 | 0 |
| "Took longer than one run allows" (paso > ~50 s en Hobby) | 14 | 0 |
| "Worker likely crashed or restarted" (el poller lo marca a los 8 min) | 5 | 1 |
| "Timed out mid-run" | 4 | 0 |
| Captura bloqueada (anti-bot) | 1 | 0 |
| Límite de cuota / 429, Gemini 503, otros | 0 | 0 |

- **Causa raíz de septiembre** (ya documentada): `ANALYZER_CONCURRENCY=8` > plan de Inngest (5) hacía que cada sync fallara y producción siguiera en el deploy del 03-09. Corregido el 10-02; desde entonces 1 falla en 89.
- **La única falla posterior** (10-07, 638 s): una URL `*.myshopify.com` de prueba; el run se colgó, no hubo `onFailure` y lo cerró el poller a los 8 min. No hay evidencia de un patrón.
- Las fallas por "captura bloqueada" son casi inexistentes porque los audits con captura bloqueada no fallan: el resultado se entrega y se marca `capture_blocked` (0 casos en la ventana "después").

## 3. De dónde sale la cola larga (p95)

Proveedor de captura (campo `timings`), auditorías ≥ 10-02:

| Captura | n | captura p50 / p95 (ms) | visión p50 / p95 (ms) | total p95 (ms) |
|---|---|---|---|---|
| sin proveedor registrado (ScreenshotOne / subida) | 46 | 10 557 / 32 260 | 5 825 / 9 621 | 51 345 |
| caché por URL | 23 | 517 / 948 | 4 752 / 13 835 | 24 724 |
| thum.io (fallback) | 7 | 9 532 / 18 600 | 4 784 / 8 359 | 82 636 |
| og:image (último recurso) | 1 | 33 862 | 3 654 | 42 149 |

- Reintentos de visión: 0. Hedge disparado en 12 de 77 con `timings`.
- Las 6 auditorías > 75 s: 4 son del 10-02 (justo en el arreglo, sin `timings`), 1 con thum.io (1tape.com.au: captura 21 s + visión 4 s pero **total 104 s → ~78 s sin explicar**: cola entre steps de Inngest/concurrencia, no el modelo) y 1 la caída del 10-07. Es la pista a investigar si se quiere bajar el p95: el tiempo "invisible" entre pasos, no la captura ni Gemini.

## 4. Créditos: hallazgos (a corregir; ninguno aplicado)

1. **Doble reembolso posible.** `onFailure` (analyze-website.ts) reembolsa si `status != succeeded`, también si ya estaba `refunded` (lo marcó antes el poller a los 8 min) ⇒ +2 créditos por una auditoría. Y dos polls simultáneos del poller (`/api/analyses/[id]`) pueden reembolsar cada uno. Falta una transición atómica `queued|running → refunded`.
2. **Reembolso + éxito = auditoría gratis.** `save-result` escribe `succeeded` sin comprobar que no esté ya `refunded`: si el poller reembolsó un run lento que luego termina, el usuario recibe el reporte **y** el crédito. Datos: 6 filas `refunded` con `result` y 1 `succeeded` con `error` en 90 días (puede ser esto o el flip de `onFailure` tras el guardado).
3. **Lectura-modificación-escritura.** Todo reembolso/cobro hace `credits = leído ± 1` sin atomicidad (también el débito en `createAnalysis` y la API v1): dos auditorías simultáneas pueden perder o duplicar un crédito.
4. Camino anónimo: no cobra ni reembolsa (correcto). El camino v1 restaura `credits = valor anterior` (puede pisar un cambio concurrente).

## 5. Estados de error y eventos

- Los mensajes ya son honestos y accionables ("time limit", "toma más de lo que permite una ejecución", captura bloqueada con "sube una captura"); no hay errores secos en la ventana.
- **No existe `audit_failed { reason }`** (ni `audit_started`/`audit_completed` del §7.1) en PostHog: solo `anon_audit_started`. Hoy las fallas se ven únicamente en la BD.
- Falta una vista de fallas por causa en el monitor del dueño.

## 6. Propuesta (a decidir; sin tocar código hasta tu OK)

1. **P0 créditos:** función SQL atómica `refund_analysis(analysis_id)` (transición `queued|running → refunded` + `credits + n` en una sola sentencia, idempotente) usada por `onFailure` y por el poller; `save-result` no pisa un `refunded` salvo para completar un run que el usuario sigue esperando (decisión de producto: ¿conserva el crédito reembolsado o se revierte?). Débito atómico `credits = credits - 1 where credits > 0`.
2. **P1 observabilidad:** eventos `audit_started` / `audit_completed` / `audit_failed { reason }` y tabla de fallas por causa en el monitor.
3. **P2 cola larga:** medir el tiempo entre steps (Inngest) con un marcador por paso; solo si el p95 importa al dueño.
4. No tocar: modelo, presupuesto total ni hedge (el éxito ya es 98,9 %).
