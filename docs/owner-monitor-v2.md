# Monitor del dueño v2 — auditoría, reset a 0 y canal de origen

> Brief para el agente "code". Fecha: 2026-10-07. Rama sugerida: `feat/owner-monitor-v2` (desde `main`).
> Alcance: SOLO el panel privado `/app/owner` y su pipeline de analítica. **No tocar** `ai/`, `inngest/`, el pipeline del Analyzer, `app/liquid`, ni el checkout.
> Regla del dueño: todo se resuelve **en código** (defaults horneados en git). Nada de "configura esta env var en Vercel" como solución.

---

## 0. Ojo con los nombres (hay dos "Monitor")

| Qué | Dónde | Estado |
|---|---|---|
| **Monitor del dueño** (este brief) | `app/(app)/app/owner/page.tsx` → `components/admin/owner-monitor.tsx` | Activo |
| "Monitor" de usuarios (re-auditoría semanal) | `app/(app)/app/monitor/page.tsx` (redirect), `supabase/migrations/0012_monitoring.sql` (`monitored_stores`, `score_snapshots`) | **Retirado**. No tocar, no confundir. |

---

## 1. Arquitectura actual

```
Navegador (todas las páginas)
  app/layout.tsx → <PageTracker isInternal/>   components/analytics/page-tracker.tsx
     · beat() al montar, en cada cambio de ruta y CADA 15 s (heartbeat)
     · payload: { path: pathname, referrer: document.referrer, session_id (sessionStorage ev_sid), internal }
        │ sendBeacon
        ▼
  POST /api/track   app/api/track/route.ts   (service role)
     · descarta hosts dev/preview y UA de bots (BOT_RE)
     · cookie httpOnly ev_anon (1 año) = visitante
     · referrer → hostname crudo ("Directo" si vacío/propio/vercel)
     · device desde UA (Móvil/Tablet/Escritorio), geo desde x-vercel-ip-*
     · upsert sessions (onConflict session_id)          ← migración 0020
     · insert page_views si !internal                    ← migración 0015

Panel /app/owner  (gate: getOwner() — ADMIN_EMAILS || INTERNAL_EMAILS, fail-closed)
  OwnerMonitor (isla vanilla: DOM directo + Chart.js self-hosted /vendor/chart.umd.min.js)
     · fetch GET /api/admin/metrics/[metric]?range=today|7d|30d|90d
     · refresco total al cambiar rango; cada 10 s solo live + recent-subscriptions
        ▼
  lib/admin/metrics.ts
     · Dinero → Stripe (invoices, checkout.sessions, charges, customers)
     · Usuarios/subs/auditorías → Supabase (profiles, subscriptions, analyses)
     · Tráfico → PostHog si POSTHOG_API_KEY+POSTHOG_PROJECT_ID; si no, lib/admin/firstparty.ts
     · "Reset": RESET_AT = env OWNER_METRICS_RESET_AT || "2026-06-20T00:00:00Z" (solo filtra, no borra)
  app/api/admin/diag/route.ts → diagnóstico de conexiones
```

Secciones del panel hoy: Estado del negocio (MRR, subs activos, usuarios, planes) · En vivo (contador + sesiones) · KPIs del periodo (ingresos, nuevas subs, "ARPU", conversión) · Ingresos en el tiempo · Embudo · "Casi pagan" · Suscripciones recientes · Demografía (países por ingresos, dispositivos, fuentes, nuevos vs recurrentes). Debajo: `OwnerLibraryImages` y `OwnerReviews` (fuera de alcance, no tocar).

Contexto de Stripe relevante: checkout `mode: "subscription"`, `adaptive_pricing: { enabled: true }` (cobra en moneda local), `metadata: { supabase_user_id, plan }` en la sesión y en la suscripción.

---

## 2. Fallas encontradas (con causa)

### Críticas — dan números falsos
1. **El heartbeat cuenta como pageview.** `page-tracker` dispara `beat()` cada 15 s y `/api/track` inserta un `page_views` en CADA beat. Una visita de 3 min = ~12 "páginas vistas". Infla la tabla y rompe todo lo que la lee.
2. **Truncado silencioso por `limit(10000)`.** `firstparty.fetchRange` trae como máximo 10 000 filas ordenadas desc. Con la inflación de (1), en 30d/90d se cortan las visitas viejas → visitantes, fuentes, dispositivos y el tope del embudo salen **por debajo** de la realidad.
3. **Ingresos mezclan monedas.** Con Adaptive Pricing, `invoice.amount_paid` y `charge.amount` vienen en la moneda del comprador (MXN, COP, BRL…) y se suman como si fueran USD. Afecta Ingresos, serie, ARPU y "Top países".
4. **El origen de la sesión se sobrescribe.** El upsert de `sessions` reescribe `referrer_domain` en cada beat; tras una recarga dura en una página interna el referrer pasa a ser el propio sitio → "Directo". Se pierde el canal real.
5. **Usuarios de Pinterest filtrados como bots.** `BOT_RE` contiene `pinterest` a secas → el navegador in-app de Pinterest (UA con "Pinterest") se descarta. El dueño ha invertido en Pinterest: ese tráfico es invisible.
6. **El reset no es "a 0".** `RESET_AT` filtra Stripe/Supabase pero **no** el tráfico (`firstparty.ts` y `posthog.ts` lo ignoran) ni el embudo de visitas. Además solo se mueve con una env var.

### Medias
7. **"Hoy" en UTC.** `bounds("today")` usa `setHours(0)` del servidor (Vercel = UTC) → "Hoy" empieza a las 19:00 de ayer en Guayaquil. Lo mismo para los labels "-Nd".
8. **"Casi pagan" casi siempre "Anónimo" y con plan raro.** Usa `customer_details.email` (vacío si no terminó) y deduce el plan comparando `amount_total` con el precio en centavos USD (falla con moneda local y con anual). La sesión ya trae `metadata.plan` y `metadata.supabase_user_id` → el email está en `profiles`. Tampoco distingue sesión `open` (puede seguir pagando) de `expired`.
9. **"ARPU" mal nombrado y spark de conversión falso.** `aov = revenue / nuevas subs` (no es ARPU). El sparkline de "Conversión" dibuja `orders`, no la conversión.
10. **"Nuevas suscripciones" cuenta cualquier fila** de `subscriptions` (incluye `incomplete`/`canceled`).
11. **Activación cuenta `null`.** `distinctAuditUsers` mete `user_id = null` (auditorías anónimas, 0023) como un usuario más.
12. **Nuevos vs recurrentes se cae en silencio.** `.in("anon_id", ids)` con hasta 1000 UUID en la query-string de PostgREST → URL gigante (414) → `returning = 0` sin error.
13. **El contador "EN VIVO" te incluye a ti.** `fpLiveVisitors` cuenta filas `is_internal` en `count`.
14. **Dos fuentes de verdad.** Si existen las env de PostHog, live/fuentes/dispositivos salen de PostHog (ventana live 5 min, sin "tú", `$referring_domain` crudo) y nada de lo nuevo se vería. Inconsistente con el aviso del panel que dice `page_views`.
15. **Países incompletos.** El mapa `COUNTRY` tiene 15 países (no está Ecuador) y está duplicado en 3 archivos con emojis distintos (🏳 vs 🌐).
16. **Fuentes = dominio crudo.** `google.com`, `google.com.ec`, `l.instagram.com`, `m.facebook.com`, `t.co`… salen como fuentes separadas. Sin UTM ni click-ids (gclid/fbclid/ttclid) porque el tracker solo manda `pathname`.
17. Menores: `internal` lo decide el cliente (cualquiera puede ocultarse — aceptable); `sessions.user_id` existe pero nunca se llena; "Marcar seguimiento" en Casi pagan es solo memoria (se pierde al recargar).

---

## 3. Lo que se pide

### 3.1 Reset a 0 (real)
- Nueva tabla `owner_settings` (key/value, service-role only) con `metrics_reset_at`.
- Botón **"Reiniciar a 0"** en la topbar del panel → server action gateada por `getOwner()`, con confirmación en UI (modal propio, **no** `window.confirm`). Escribe `now()`.
- Precedencia: valor en BD → si no existe, constante en código = fecha de deploy de este WP. (La env `OWNER_METRICS_RESET_AT` deja de ser necesaria; mantener solo como último fallback.)
- El reset aplica a **todo**: Stripe, Supabase, `page_views`, `sessions`, `visitors`, embudo, en vivo excluido (en vivo es "ahora").
- No destructivo: no se borra nada de Stripe ni usuarios. Opcional en el mismo modal: checkbox "Borrar también el tráfico anterior (page_views/sessions)" — útil porque ese histórico está inflado por la falla 1 y por bots.
- Mostrar "Contando desde: <fecha hora Guayaquil>".

### 3.2 Canal de origen (red social / buscador)
Un clasificador puro `lib/analytics/channel.ts` → `classifyChannel({ utmSource, utmMedium, clickIds, referrer, ua }) → Channel`. Orden de prioridad:

1. `utm_source` (normalizado con el mismo mapa de abajo; ej. `ig`, `instagram` → Instagram).
2. Click IDs en la URL de aterrizaje: `gclid|gbraid|wbraid` → Google · `fbclid` → Instagram si el UA es in-app de Instagram, si no Facebook · `ttclid` → TikTok · `epik` → Pinterest · `rdt_cid` → Reddit · `twclid` → X · `li_fat_id` → LinkedIn · `msclkid` → Bing.
3. Dominio del referrer.
4. UA de navegador in-app (cuando el referrer viene vacío, típico en apps): `Instagram` → Instagram · `FBAN|FBAV|FB_IAB` → Facebook · `musical_ly|BytedanceWebview|TikTok` → TikTok · `Pinterest` (app, no bot) → Pinterest · `Snapchat` · `LinkedInApp` → LinkedIn.
5. Nada → **Directo**.

Mapa de referrers (regex sobre hostname, sin `www.`):

| Canal | Reglas |
|---|---|
| **Google** | `(^|\.)google\.[a-z.]+$` (google.com, google.com.ec, google.es…), `android-app://com.google.android.googlequicksearchbox`, `googleadservices.com`, `g.co`. **Siempre solo "Google"**: sin móvil/PC, sin país, sin orgánico/pago. |
| Instagram | `instagram.com`, `l.instagram.com` |
| Facebook | `facebook.com`, `m.`/`l.`/`lm.facebook.com`, `fb.me`, `fb.com` |
| TikTok | `tiktok.com`, `vm.tiktok.com` |
| Pinterest | `pinterest.[tld]`, `pin.it` |
| Reddit | `reddit.com`, `old.`/`out.reddit.com`, `redd.it` |
| X | `t.co`, `x.com`, `twitter.com` |
| YouTube | `youtube.com`, `m.youtube.com`, `youtu.be` |
| LinkedIn | `linkedin.com`, `lnkd.in` |
| WhatsApp | `wa.me`, `whatsapp.com`, `web.whatsapp.com` |
| Telegram / Discord | `t.me`, `telegram.org` / `discord.com`, `discord.gg` |
| ChatGPT / IA | `chatgpt.com`, `chat.openai.com` → ChatGPT · `perplexity.ai` → Perplexity · `gemini.google.com` → Gemini (excepción a la regla Google: es un asistente, no el buscador) · `claude.ai` → Claude · `copilot.microsoft.com` → Copilot |
| Bing / otros buscadores | `bing.com` → Bing · `duckduckgo.com` → DuckDuckGo · `search.yahoo.com` → Yahoo |
| Email | `mail.google.com`, `outlook.live.com`, `utm_medium=email` |
| Shopify Community | `community.shopify.com` |
| Otros | cualquier otro → mostrar el dominio limpio |

Cada canal con su ícono/color en el panel. El mapa vive en un solo archivo y es fácil de ampliar.

**Atribución first-touch:** el canal se fija en el PRIMER hit de la sesión y del visitante y no se vuelve a escribir.

### 3.3 Atribución a dinero (lo más valioso)
"¿De qué red viene el que se registra y el que paga?"
- Nueva tabla `visitors` (anon_id PK, first_seen_at, first_channel, first_referrer_domain, first_landing_path, utm_source/medium/campaign, country, device, user_id null).
- En el alta de cuenta (`app/(auth)/auth/callback/route.ts`, solo cuando el perfil es nuevo) leer la cookie `ev_anon` y vincular `visitors.user_id` + copiar a `profiles` (`acq_channel`, `acq_referrer_domain`, `acq_utm_campaign`, `acq_landing_path`). Best-effort, nunca rompe el login. Ojo: la cookie de auditoría anónima de `analyses.anon_id` (0023) es OTRA distinta de `ev_anon`; no mezclarlas.
- Tabla en el panel **"Canales → dinero"**: por canal: visitantes · registros · conversión visita→registro · pagos · ingresos USD.

### 3.4 Otras funciones nuevas
1. **Fuentes de tráfico** (reemplaza la dona de dominios) por canal normalizado, con % y conteo de visitantes únicos.
2. **En vivo con canal**: columna "Viene de" en sesiones activas; contador sin incluirte (tu sesión sigue visible con la etiqueta "tú").
3. **Campañas (UTM)**: tabla utm_campaign × canal × visitantes × registros.
4. **Páginas de entrada**: top landing paths por visitantes y su canal dominante.
5. **Países de visitantes** (no solo por ingresos), con `Intl.DisplayNames('es')` + bandera desde el código ISO (todos los países, incl. Ecuador). Un helper único compartido.
6. **Salud del Analyzer** (lee `analyses`, sin tocar el pipeline): auditorías por día (con sesión vs anónimas), tasa de éxito, p50/p95 de duración desde `analyses.timings` (0034).
7. **"Casi pagan" útil**: email real vía `metadata.supabase_user_id → profiles.email`, plan e intervalo vía `metadata.plan` / price id, estado `Abierto` vs `Expirado`, monto en USD, canal de adquisición del usuario. El "Marcar seguimiento" se persiste (columna o tabla pequeña).
8. **Cancelaciones**: subs canceladas en el periodo y churn simple.

---

## 4. Cambios técnicos (por archivo)

| Archivo | Cambio |
|---|---|
| `components/analytics/page-tracker.tsx` | Mandar `type: "pageview" | "heartbeat"`. En el primer beat de la sesión, mandar también `landing` = `location.search` (para UTM y click IDs) y el referrer original. |
| `app/api/track/route.ts` | Insertar `page_views` **solo** si `type === "pageview"`. Sesión: canal/referrer/utm solo en el INSERT (first-touch), nunca en updates (usar insert-on-conflict con solo `last_seen_at`/`path` en el update). Upsert `visitors` first-touch. `BOT_RE`: cambiar `pinterest` por `pinterestbot|pinterest/0\.`; revisar `preview`/`whatsapp` para no tirar navegadores in-app reales. Guardar `channel` en page_views y sessions. |
| `lib/analytics/channel.ts` (nuevo) | Clasificador puro + tests. |
| `lib/admin/geo.ts` (nuevo) | `countryLabel(cc)` único (bandera + nombre en español). Borrar los 3 mapas `COUNTRY`. |
| `lib/admin/reset.ts` (nuevo) | `getResetAt()` (BD → constante) + server action `resetOwnerMetrics({ purgeTraffic })`. |
| `lib/admin/firstparty.ts` | Respetar reset. Agregar por SQL (RPC o vista) en vez de traer 10 000 filas a JS. Nuevos vs recurrentes con una sola consulta en BD (sin `.in()` gigante). Live: `count` sin internos. |
| `lib/admin/metrics.ts` | Zona horaria fija `America/Guayaquil` para "Hoy" y buckets. Dinero en USD vía `balance_transactions` (moneda de la cuenta) — o `charge.balance_transaction.amount` expandido. Incluir pagos one-time si existen. Subs nuevas filtradas por estado válido. `distinctAuditUsers` sin null. Renombrar ARPU → "Ingreso por nueva suscripción" (o calcular ARPU real = MRR / subs activos). Spark de conversión con la serie correcta. Nuevos getters: `getChannels`, `getChannelRevenue`, `getCampaigns`, `getLandingPages`, `getVisitorCountries`, `getAnalyzerHealth`, `getCancellations`. |
| `lib/admin/posthog.ts` | El panel usa **solo first-party**. Quitar la rama PostHog de `metrics.ts` (dejar `posthog.ts` y `diag` para diagnóstico, si se quiere). |
| `app/api/admin/metrics/[metric]/route.ts` | Registrar los nuevos metrics. |
| `components/admin/owner-monitor.tsx` | Botón Reiniciar a 0 + modal, "Contando desde", nuevas secciones, columna "Viene de" en live, dona de canales con colores fijos por canal, textos corregidos. Mantener la isla vanilla y el CSS `.evm`. |
| `app/(auth)/auth/callback/route.ts` | Vinculación ev_anon → usuario (best-effort). |
| `supabase/migrations/0035_owner_monitor_v2.sql` (+ rollback) | `owner_settings`; `visitors`; columnas `channel`, `utm_*`, `landing_path` en `page_views` y `sessions`; columnas `acq_*` en `profiles`; índices por `created_at`/`channel`; funciones SQL de agregación (security definer o solo service role). RLS on, sin políticas públicas. Idempotente. |

---

## 5. Aceptación

- [ ] Una visita de 3 min navegando 2 páginas genera **2** `page_views`, no ~12.
- [ ] Entrar desde `google.com.ec`, desde `google.com` en móvil y desde la app de Google en Android aparece las tres veces como **"Google"**.
- [ ] Entrar con `?fbclid=…` desde el navegador de Instagram → Instagram; desde Facebook → Facebook. `?utm_source=pinterest` → Pinterest. UA de la app de Pinterest **no** se descarta.
- [ ] Recargar una página interna no cambia el canal de la sesión.
- [ ] "Reiniciar a 0" deja todo el panel en cero (excepto En vivo), sobrevive a recargas y redeploys, y no borra nada de Stripe ni usuarios.
- [ ] Un pago en MXN suma su equivalente en USD, no el número en pesos.
- [ ] "Hoy" empieza a las 00:00 de Guayaquil.
- [ ] "Casi pagan" muestra el email del usuario logueado y su plan correcto.
- [ ] Ecuador (y cualquier país) sale con bandera y nombre.
- [ ] Un usuario nuevo registrado tras llegar por TikTok aparece en "Canales → dinero" en TikTok.
- [ ] `npm run typecheck`, `npm run lint` y `npm test` en verde. Tests nuevos: `channel.test.ts` (tabla de casos de 3.2), reset, conversión de moneda, bucket en zona horaria.

## 6. Qué el dueño debe hacer a mano después
1. Aplicar la migración 0035 en Supabase (SQL editor o `supabase db push`).
2. Mergear y deployar; abrir `/app/owner` y pulsar "Reiniciar a 0".
3. Usar UTM en todos sus links propios (bio de IG, Pinterest, Reddit, emails): `?utm_source=instagram&utm_medium=social&utm_campaign=<nombre>` — sin UTM, varias apps no mandan referrer y caen en "Directo".
