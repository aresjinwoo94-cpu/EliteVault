# Brief: desbloqueo de reporte con pago único ($7) + fiabilidad del Analyzer + quitar Trends + Library autogestionada + reposicionar la landing

> **ESTADO: APROBADO PARA EJECUTAR (2026-10-11).** Orden: ver "Orden general sugerido" al final.
>
> **Decisiones abiertas → usar la propuesta por defecto** escrita en cada una: D1 sí incluir Winners,
> D2 apagar los modales automáticos de `AnalyzerPaywall` con el flag activo, D3 reembolso manual en 7 días,
> D4 fuera de esta versión, L-D2 meta ~300 tiendas, LP-D1 tarjeta de competidor, LP-D2 dejar
> `/free-website-audit` y el blog como están. **Excepción: L-D1 (qué métricas muestra la tarjeta de la
> Library) → PARAR y preguntar al dueño antes de WP-L3.**
>
> **Paradas obligatorias para mostrarle algo al dueño:** después de WP-0 (resultado de la verificación RLS en
> producción), después de WP-L0 (REPORT de imágenes) y antes de prender `REPORT_UNLOCK` (pruebas de Stripe
> test mode + revisión visual).
>
> **Este brief se escribió leyendo `main` en `7ce2254`.** El dueño hizo cambios después (sobre todo en la
> landing). Antes de cada WP: `git pull` de main y **re-verificar** rutas, claves i18n y strings citados; si
> algo ya no coincide, adaptar el WP al código actual y anotarlo en el PR, sin revertir cambios del dueño.
>
> Seguir el flujo habitual: skill superpowers, **una rama por WP creada desde `main`**
> (el working tree local está en `feat/owner-monitor-v2`, que va muy por detrás de main), `npm run typecheck`
> + `npm test`, y subagente de verificación adversarial antes de cerrar cada WP.
>
> **Regla del dueño:** las mejoras se resuelven en **código**, con defaults horneados en git, no con variables
> de entorno de Vercel. Las únicas excepciones son los secretos que ya existen (claves de Stripe/Supabase).

---

## §0. Qué se construye (decisiones del dueño)

1. **Desbloqueo de pago único: $7 USD por reporte.** Desbloquea el reporte completo de **una** auditoría
   (una tienda) de un usuario con plan gratis. No es un plan ni una suscripción.
2. **No aparece en la sección de planes** (`/pricing`, el pricing de la landing, `PLANS` en
   `lib/stripe/plans.ts`) **ni en la Library.** Solo existe **dentro del reporte** del Analyzer, cuando el
   usuario tiene contenido bloqueado delante.
3. **No es un pop-up que salta solo.** Hay dos piezas:
   - una **tarjeta fija e inline** junto a los fixes bloqueados;
   - un **modal que se abre solo cuando el usuario hace clic** en algo bloqueado (un fix, la simulación de
     persona, un fix track o el simulador).
4. **Usuario sin sesión:** primero crea su cuenta (el modal de registro que ya existe) y **después** ve la
   oferta. Nunca dos modales a la vez.
5. **Pro sigue siendo la opción para quien audita varias tiendas.** El modal lleva una línea secundaria:
   "¿Vas a auditar varias tiendas? Pro desde $19/mes".
6. **Prioridad previa:** que el Analyzer funcione bien para todos (§R). Si la auditoría falla, la oferta
   nunca llega a verse.

### Qué incluye el desbloqueo (para ESA auditoría)

| Incluido | Notas |
|---|---|
| Todos los top fixes (hoy el free ve solo el #1) | |
| Simulación de buyer persona | |
| Los 3 fix tracks generados (post_purchase, theme_colors, competitor) | Free hoy tiene 1 elección. |
| **1 proyección** del Meta Campaign Scenario Modeler para esa auditoría | El feature estrella; debe estar dentro. |
| Card "Winners in your niche" desbloqueada para esa auditoría | **DECISIÓN ABIERTA (D1)**, ver §9. Default propuesto: incluida. |
| ❌ Meta Ads Optimizer | Sigue siendo exclusivo de Scale. |
| ❌ Library completa, auditorías nuevas, publicar en Community, API | Siguen siendo de Pro/Scale. |

---

## §1. Contexto encontrado en el código (leído en `main`, oct 2026)

Esto es lo que ya existe y condiciona el diseño. **No cambiar nada de esto salvo donde un WP lo diga.**

- **Planes:** `lib/stripe/plans.ts` tiene `PLANS: Record<PlanTier, Plan>` con `PlanTier = free | pro | scale`
  (de `lib/supabase/types.ts`). `PlanTier` se usa en todas partes (webhook, quota guard, páginas).
  ➜ **NO añadir un PlanTier nuevo.** El desbloqueo es un *entitlement por auditoría*, no un plan.
- **Checkout de planes:** `lib/stripe/checkout-session.ts` (embedded, `mode: "subscription"`, branding
  oscuro, auto-heal del customer), `lib/stripe/checkout-params.ts` (locale = idioma del sitio, nunca
  `"auto"`; Adaptive Pricing activado), `lib/stripe/payment-method-types.ts`
  (`CHECKOUT_PAYMENT_METHOD_TYPES`; `scripts/tests/payment-marks.test.ts` exige que **toda** Checkout
  Session lo importe).
- **Webhook** `app/api/stripe/webhook/route.ts`:
  - deduplica por `event.id` insertando en `stripe_events` **antes** de procesar;
  - `checkout.session.completed` → `syncSubscription`, que hace early-return si `!session.subscription`.
    Una sesión `mode: "payment"` **hoy se registra y no hace nada**;
  - `invoice.payment_succeeded` → `onInvoicePaid`: **hard-set** de `profiles.credits` según el plan y envío
    del email de recibo "plan X". ➜ Si una sesión one-time crea factura (`invoice_creation`), le llegaría al
    usuario un recibo raro del plan "Free". **No activar `invoice_creation`.**
- **Página de retorno** `app/(app)/app/checkout/return/page.tsx`: solo entiende suscripciones. Una sesión
  one-time pagada cae en "lo procesamos en breve" y en el polling de cambio de plan, que nunca llega.
  ➜ El desbloqueo necesita **su propio return URL**.
- **Recuperación de checkout abandonado:** `createEmbeddedCheckoutSession` emite `checkout/started` (Inngest,
  `inngest/functions/checkout-recovery.ts`). Los emails hablan de planes. ➜ **El desbloqueo NO emite ese
  evento.**
- **Reporte** `app/(app)/app/analyzer/[id]/page.tsx`: `isPaid = plan !== "free"` gobierna el "cure";
  `canRunMeta` sale de `plan.quotas.metaRunsPerMonth`; `toClientAnalysis` (`lib/analyzer/client-payload.ts`)
  quita `niche_winners`, `fix_tracks` y (para no-Scale) `meta_ads`.
- **⚠️ Contenido de pago dentro del payload:** `result.top_fixes` (todos) y
  `result.buyer_persona_response` **llegan completos al navegador del usuario free**. El bloqueo es solo
  visual (`FreeLockedCure` difumina la respuesta real; `TopFixes` con `unlockedCount=1`). Cualquiera con
  DevTools lo lee. Mientras se regalaba no importaba; **si vamos a cobrar $7 justo por eso, sí importa** (WP-1).
- **Fix Tracks:** `app/api/analyses/[id]/fix-tracks/[track]/route.ts` + `lib/analyzer/fix-tracks.ts`. El
  gating ya es de servidor (`decideAccess`, `gateFixes`), con `viewer: "anon" | "free" | "paid"` calculado
  a partir del plan. Migraciones 0036/0038, funciones atómicas `fix_tracks_*` solo para el service role.
- **Meta Simulator:** `app/actions/meta-simulator.ts` → `assertQuota(user, "metaRun")`
  (`lib/quota/guard.ts`): Free 0 / Pro 1 al mes / Scale ilimitado, contado en `meta_simulations`. El motor
  es determinista + 1 llamada de IA para la narrativa (`inngest/functions/run-meta-simulation.ts`).
- **Modales que ya existen:**
  - `components/analyzer/analyzer-paywall.tsx`: **dos modales automáticos** para free con sesión:
    "scroll recap" (al pasar el bloque de ads) y "exit intent" (desktop). Empujan Pro $19. Una vez por
    auditoría (sessionStorage);
  - `components/analyzer/anon-register-gate.tsx`: modal de registro para usuarios sin sesión;
  - `components/analyzer/free-locked-cure.tsx`: candados inline que empujan Pro.
- **Auditoría anónima:** `analyses.anon_id`; al registrarse, `lib/anon/claim.ts` mueve la fila al
  `user_id`. Página pública `app/audit/[id]/page.tsx` (siempre `isPaid: false`).
- **Patrón one-time ya resuelto en otra rama** (`feat/liquid-blocks-monetization`, sin mergear):
  `app/actions/blocks-export.ts`, `lib/blocks/settle-export.ts`, tabla `blocks_exports` con RLS solo
  SELECT, rama propia en el webhook. Incluye la lección clave: **si la liquidación falla, hay que borrar la
  fila de `stripe_events`** para que el reintento de Stripe sea un intento real. Para un pago único,
  `checkout.session.completed` es el ÚNICO evento que llega. ➜ **Reusar ese patrón.**
  ⚠️ Esa rama usa la migración `0035`, que choca con `0035_owner_monitor_v2` de main. Nuestra migración
  nueva es **`0039`**.
- **Owner monitor** (`lib/admin/metrics.ts`): el dinero sale de Stripe balance transactions (el one-time
  entra solo); `checkoutStats` cuenta **todas** las sesiones de checkout; "revenue per sub" mezclaría
  desbloqueos con suscripciones. ➜ Etiquetar las sesiones con `metadata.purchase = "report_unlock"` y
  segmentar (WP-5).
- **Flags** (`lib/flags.ts`): `enabled(name, defaultOn)`.
- **Reembolsos** (`app/legal/refunds/page.tsx`): habla solo de suscripciones ("all sales are final").

---

## §2. 🔴 WP-0: hueco de seguridad en RLS (BLOQUEANTE, antes que todo)

En `supabase/migrations/0001_init.sql`:

```sql
create policy "profiles: update own" on public.profiles for update using (auth.uid() = id);
create policy "analyses: update own" on public.analyses for update using (auth.uid() = user_id);
```

No hay restricción de columnas ni trigger que las proteja (revisé todas las migraciones de main). Con la anon
key pública, **cualquier usuario logueado puede hacer desde el navegador**:

```js
supabase.from("profiles").update({ plan: "scale", credits: 9999 }).eq("id", myId)
supabase.from("analyses").update({ fix_tracks: {...} }).eq("id", myAnalysisId)
```

Eso le da Scale gratis hoy. Y si el desbloqueo se guardara como columna en `analyses`, se podría
autodesbloquear. **Se arregla antes de cobrar nada.**

**Pasos:**
1. **Verificar en producción** (puede que se haya arreglado a mano en el dashboard de Supabase):
   `select policyname, cmd, qual, with_check from pg_policies where tablename in ('profiles','analyses');`
   y una prueba real con la anon key y un usuario de test. Documentar el resultado.
2. Si el hueco existe, migración **`0039_protect_privileged_columns.sql`** (el desbloqueo pasa a 0040):
   un trigger `BEFORE UPDATE` en `profiles` y en `analyses` que, cuando el rol del request es
   `authenticated` (no `service_role`), lance un error si cambian columnas privilegiadas:
   - `profiles`: `plan`, `credits`, `stripe_customer_id` y cualquier otra columna de facturación/cuota
     que exista;
   - `analyses`: `user_id`, `anon_id`, `status`, `result`, `fix_tracks`, `niche_winners`, `meta_ads`,
     `screenshot_url`, `timings` (lista final según el schema real).
   Se prefiere el trigger a `revoke update` + grants por columna porque **no rompe** los updates legítimos
   que hace la app con el cliente del usuario.
3. **Antes de escribir la lista**, hacer grep de todos los `.from("profiles").update(` y
   `.from("analyses").update(` que usan el **cliente del usuario** (no el service client). Ejemplos
   probables: `app/actions/profile.ts`, el publish de community. Esas columnas quedan permitidas.
4. Rollback en `supabase/rollbacks/`. Test (`scripts/tests/`) que lea la migración y verifique que las
   columnas críticas están en la lista.
5. Aplicar en producción y repetir la prueba del paso 1: debe fallar.

---

## §3. WP-1: el contenido bloqueado no sale del servidor

Prerequisito para cobrar: el usuario no puede tener ya en el HTML lo que se le vende.

- En `lib/analyzer/client-payload.ts`, extender `toClientAnalysis` con `viewer.hasFullReport: boolean`.
  Cuando es `false`:
  - `result.top_fixes`: el #1 completo; del #2 en adelante, solo `title` (+ `impact`/`effort` si existen),
    con `locked: true`. Mismo criterio que `gateFixes` de fix tracks;
  - `result.buyer_persona_response`: se reemplaza por `null` y un flag `persona_locked: true`.
- `FreeLockedCure` deja de difuminar la respuesta real: difumina un **placeholder estático**
  (texto genérico de ejemplo, i18n) con el mismo aspecto visual.
- `TopFixes`: renderiza los fixes `locked` con su título visible y el cuerpo como placeholder difuminado.
  Ver los títulos de lo que se pierde es lo que motiva el desbloqueo, y no regala la solución.
- Aplicar el mismo gating en **todos** los caminos que sirven la fila al cliente:
  `app/(app)/app/analyzer/[id]/page.tsx`, `app/api/analyses/[id]/route.ts` (polling),
  `app/audit/[id]/page.tsx` (anónimo), `app/preview/anon-audit/page.tsx`, `app/s/[slug]` (compartido,
  revisar qué muestra hoy y **no cambiar** su política pública) y la ruta de growth-map.
- **No tocar** el pipeline del Analyzer, el cálculo del score ni lo que se guarda en la BD. Solo cambia lo
  que viaja al navegador.
- Tests: free/anon → payload sin texto de fixes #2+ ni persona; paid/desbloqueado → completo.

---

## §4. WP-2: datos, entitlement y liquidación del pago

### 4.1 Migración `0040_analysis_unlocks.sql` (o `0039` si WP-0 no necesitó migración)

```sql
create table if not exists public.analysis_unlocks (
  analysis_id        uuid primary key references public.analyses(id) on delete cascade,
  user_id            uuid not null,              -- FK según el patrón del schema (profiles.id / auth.users.id)
  stripe_session_id  text not null unique,
  stripe_payment_intent text,
  amount_total       integer,                    -- en la moneda cobrada (Adaptive Pricing)
  currency           text,
  status             text not null default 'paid' check (status in ('paid','refunded')),
  created_at         timestamptz not null default now(),
  refunded_at        timestamptz
);
create index if not exists analysis_unlocks_user_idx on public.analysis_unlocks(user_id);
alter table public.analysis_unlocks enable row level security;
create policy "unlocks: read own" on public.analysis_unlocks for select using (auth.uid() = user_id);
-- SIN políticas de insert/update/delete: solo escribe el service role.
```

Va en una **tabla aparte**, no en una columna de `analyses`, justo por el hueco de §2: aunque WP-0 lo cierre,
el entitlement de pago no debe vivir en una fila que el usuario puede actualizar. Aditiva e idempotente.
Rollback en `supabase/rollbacks/`. Actualizar `lib/supabase/types.ts` (`npm run db:types`).

### 4.2 Entitlement: `lib/unlocks/report-unlock.ts`

- `REPORT_UNLOCK_USD_CENTS = 700`: **el precio vive en código.**
- `isAnalysisUnlocked(analysisId, userId): Promise<boolean>`: service client, `status = 'paid'`. Ante un
  error de BD devuelve `false` (fail closed) y deja log. La UI muestra "reintenta" si el usuario acaba de
  pagar (ver 5.3).
- `hasFullReport({ plan, unlocked })` (función pura): `plan !== "free" || unlocked`. **Es la única
  función** que deciden la página, el polling, fix tracks, growth-map y el simulador. Test unitario.

### 4.3 Liquidación: `lib/unlocks/settle.ts`, `settleReportUnlock(session)`

La llaman **tanto** el webhook **como** la página de retorno. Es idempotente:

1. Ignora si `session.mode !== "payment"` o `session.metadata.purchase !== "report_unlock"`.
2. Exige `session.payment_status === "paid"`.
3. Relee la auditoría con el service client y verifica que `analyses.user_id === metadata.supabase_user_id`.
4. `insert ... on conflict (analysis_id) do nothing`.
5. **Pago duplicado** (raro: dos pestañas pagan dos sesiones antes de que ninguna se liquide). Si ya existe
   un unlock con **otro** `stripe_session_id`, se reembolsa automáticamente el segundo
   (`stripe.refunds.create({ payment_intent })`) y se deja log `duplicate_unlock_refunded`. Nunca se cobra
   dos veces lo mismo.

### 4.4 Webhook (`app/api/stripe/webhook/route.ts`), cambios mínimos y aditivos

- En `checkout.session.completed`, **antes** de `syncSubscription`: si es `mode === "payment"` y
  `purchase === "report_unlock"` → `settleReportUnlock` y `break` (no cae a `syncSubscription`).
- Si `settleReportUnlock` lanza error: **borrar la fila de `stripe_events` de ese `event.id`** y devolver
  500, para que el reintento de Stripe sea real (lección de la rama Liquid).
- Añadir a `RELEVANT_EVENTS`: `checkout.session.async_payment_succeeded` (→ settle) y
  `checkout.session.async_payment_failed` (solo log). Hoy los métodos son síncronos, pero no cuesta nada.
- Reembolsos: `charge.refunded`. Si el payment intent corresponde a un unlock, `status = 'refunded'` y
  `refunded_at`, y el reporte se vuelve a bloquear. (Ver D3.)
- **No tocar** `syncSubscription`, `onInvoicePaid` ni `onInvoiceFailed`.
- Si la rama Liquid se mergea antes o después, ambas ramas del `switch` conviven: cada una filtra por su
  `metadata.purchase`.

---

## §5. WP-3: checkout del desbloqueo

### 5.1 Sesión: `lib/stripe/report-unlock-session.ts`

Mismo estilo que `checkout-session.ts`: **nunca lanza**, devuelve una unión discriminada.

- `ui_mode: "embedded"`, `mode: "payment"`.
- `line_items: [{ price_data: { currency: "usd", unit_amount: REPORT_UNLOCK_USD_CENTS, product_data: { name: "EliteVault: full report unlock" } }, quantity: 1 }]`.
  Precio en código, sin variable de entorno ni Price del dashboard.
  ⚠️ **Verificar en test mode que Adaptive Pricing funciona con `price_data`** (que un comprador de otro país
  vea su moneda local). Si no funciona: crear un Price en Stripe y leerlo de
  `STRIPE_PRICE_REPORT_UNLOCK`, con fallback a `price_data`.
- `adaptive_pricing: { enabled: true }`, `locale: stripeLocale(locale)` (idioma del sitio, nunca `"auto"`).
- `payment_method_types: [...CHECKOUT_PAYMENT_METHOD_TYPES]` (lo exige el test de payment-marks).
- Branding: exportar `DARK_CHECKOUT_BRANDING` y `isBrandingRejection` desde `checkout-session.ts` y
  reusarlos, con el mismo retry sin branding.
- Customer: `resolveStripeCustomerId` (`lib/stripe/customer.ts`); si no hay, `customer_email`.
- `metadata` **y** `payment_intent_data.metadata`: `{ purchase: "report_unlock", supabase_user_id, analysis_id }`.
  `payment_intent_data.description`: `EliteVault report unlock: <dominio>`.
- `custom_text.submit.message` (i18n): "Pago único. Desbloquea el reporte completo de <dominio>. Sin suscripción."
- `return_url`: `/app/unlock/return?session_id={CHECKOUT_SESSION_ID}`.
- **Sin** `invoice_creation`, **sin** `subscription_data`, **sin** emitir `checkout/started`.

**Guardas antes de crear la sesión** (todas en servidor):
- usuario logueado y dueño de la auditoría (si no, 404);
- `status === "succeeded"` y sin `capture_blocked`;
- plan `free` (un Pro/Scale ya lo tiene todo: redirigir al reporte);
- no desbloqueada ya (redirigir al reporte);
- flag `reportUnlockEnabled()` activo.

### 5.2 Página `app/(app)/app/unlock/[analysisId]/page.tsx`

- Reusar `EmbeddedCheckoutForm` / `checkout-layout` con un resumen propio: dominio auditado, lista de lo
  que incluye (§0) y "Pago único · sin suscripción".
- **No mostrar nuestro propio precio** junto al iframe. Stripe ya lo muestra localizado; el fix de
  checkout de sep 2026 quitó justamente ese precio duplicado.
- Sin sesión → `/sign-in?next=/app/unlock/<id>`.
- **No tocar** `/app/checkout` (planes).

### 5.3 Retorno `app/(app)/app/unlock/return/page.tsx`

- Recupera la sesión; si `metadata.supabase_user_id !== user.id` → no hace nada.
- Si está pagada → `settleReportUnlock(session)` (liquidación anticipada; el webhook corre en paralelo y es
  idempotente) → redirect a `/app/analyzer/<id>?unlocked=1`.
- Cancelada o expirada → vuelve al reporte con un aviso amable de que no se cobró nada.
- Si la liquidación falla → página "Pago recibido, estamos activando tu reporte" con polling corto a un
  endpoint `GET /api/unlocks/<analysisId>` hasta que exista la fila.

---

## §6. WP-4: UI en el reporte (tarjeta inline + modal al hacer clic)

Solo para viewers con `hasFullReport === false`, con el flag activo y una auditoría `succeeded`.

### 6.1 Tarjeta inline `components/analyzer/report-unlock-card.tsx`

- Ubicación: dentro o justo debajo de `TopFixes`, donde se ven los fixes bloqueados.
- Copy (EN/ES en `lib/i18n/messages.ts` / `lib/i18n/dict/ui-*.json`):
  - ES: "Desbloquea los {n} fixes restantes de este reporte" · "US$7 · pago único · sin suscripción"
  - EN: "Unlock the {n} remaining fixes in this report" · "US$7 · one-time · no subscription"
- Botón principal → `/app/unlock/<id>`. Enlace secundario pequeño: "¿Varias tiendas? Pro desde $19/mes" →
  `/app/checkout?plan=pro&interval=month`.
- Tono "no dark patterns": sin contadores ni escasez falsa.

### 6.2 Modal `components/analyzer/report-unlock-dialog.tsx`

- **Solo se abre por clic** en: un fix bloqueado, la persona bloqueada (`FreeLockedCure`), un fix track
  bloqueado (respuesta `locked` de la ruta) o el simulador bloqueado.
- Contenido: qué incluye (§0), botón de US$7, línea Pro secundaria, X para cerrar siempre visible y
  "Ahora no".
- Radix `Dialog` (como `analyzer-paywall.tsx`).

### 6.3 Convivencia con lo que ya existe

- **Candados inline** (`FreeLockedCure`, `FreeMetaPanel`, `ScaleLockedPreview` donde aplique al free): con
  el flag activo, su CTA principal abre el modal de desbloqueo y Pro pasa a ser secundario.
- **`AnalyzerPaywall`** (scroll recap + exit intent automáticos): **DECISIÓN ABIERTA (D2)**. Recomendación:
  con el flag activo, **desactivar los dos modales automáticos**, por coherencia con "nada salta solo". Si
  el dueño prefiere conservarlos, que ofrezcan US$7 como opción principal y Pro como secundaria, y nunca
  en la misma vista donde ya se abrió el modal de desbloqueo.
- **Anónimo** (`app/audit/[id]`): la tarjeta se muestra, pero su CTA lleva al registro
  (`AnonRegisterGate` / sign-up con `next=/app/unlock/<id>`). Verificar que `lib/anon/claim.ts` reclama la
  auditoría **antes** de llegar a `/app/unlock/<id>`; si no, el dueño de la auditoría no coincide y da 404.
  Nunca se abren el modal de registro y el de desbloqueo a la vez.

### 6.4 Después de pagar

- Banner discreto "Reporte desbloqueado ✓" con `?unlocked=1`.
- Fix tracks: la ruta trata como `viewer = "paid"` a quien tiene la auditoría desbloqueada (usar
  `hasFullReport`). Los 3 tracks se pueden generar, con los mismos topes de IA (`MAX_TRACK_ATTEMPTS`).
- Simulador: en `app/actions/meta-simulator.ts`, si `assertQuota` rechaza a un free, comprobar el unlock y
  permitir **1 corrida por auditoría desbloqueada** (contar `meta_simulations` de ese `analysis_id` con
  status `queued|running|succeeded` < 1). **No tocar `assertQuota`** para planes pagos. En la página:
  `canRunMeta = true`, `metaLimit = 1`, `metaUsed` = corridas de esa auditoría, y copy propio: "1
  proyección incluida en este reporte" en vez de "1 de 1 este mes". El Optimizer sigue gateado por
  `plan.unlocksScale`.

---

## §7. WP-5: medición (PostHog + owner monitor)

### 7.1 Embudo (eventos con `phCapture`, todos con `analysis_id`)

Reusar los eventos existentes si ya cubren un paso (revisar antes de crear duplicados):

1. `audit_started` / 2. `audit_completed` (y `audit_failed` con razón, ver §R)
3. `report_locked_viewed`: una vez por auditoría, cuando un viewer sin full report ve contenido bloqueado
4. `unlock_cta_click` `{ source: "card" | "fix" | "persona" | "track" | "simulator" }`
5. `unlock_modal_opened`
6. `unlock_checkout_viewed`: carga de `/app/unlock/<id>`
7. `unlock_paid`: en la página de retorno, tras liquidar
8. `unlock_pro_link_click`

Con esto se ve dónde se cae la gente: no auditan (arriba), auditan pero no hacen clic (valor percibido) o
hacen clic y no pagan (checkout).

### 7.2 Owner monitor

En `lib/admin/metrics.ts`, separar en `checkoutStats` y en "orders / revenue per sub" las sesiones con
`metadata.purchase === "report_unlock"`. Añadir una métrica "Desbloqueos ($7)" (conteo + ingresos). El
total de dinero no cambia: ya sale de balance transactions.

---

## §8. WP-6: copy legal y FAQ

- `app/legal/refunds/page.tsx`: añadir una sección "One-time report unlock" con la política que decida el
  dueño (D3).
- `app/legal/terms/page.tsx`: mencionar la compra one-time.
- `lib/support/kb.ts` y FAQ: una entrada "¿Puedo pagar solo un reporte?". **No** añadirla a la tabla de
  planes.
- `app/llms.txt` / `lib/content/faq.ts`: solo si ya listan precios, para que no queden desactualizados.

---

## §9. Decisiones abiertas para el dueño

- **D1:** ¿El desbloqueo incluye la card "Winners in your niche" de esa auditoría? (Propuesta: sí, es parte
  del reporte; la Library completa sigue siendo de Pro.)
- **D2:** ¿Se apagan los modales automáticos de `AnalyzerPaywall` cuando el desbloqueo está activo?
  (Propuesta: sí.)
- **D3:** Política de reembolso del desbloqueo. (Propuesta: reembolso manual a pedido dentro de 7 días; al
  reembolsar, el reporte se vuelve a bloquear.)
- **D4 (fase 2):** "Pasa a Pro en 7 días y te descontamos los $7" (cupón de Stripe de un solo uso). No entra
  en esta versión.

---

## §10. Flag y despliegue

- `reportUnlockEnabled()` en `lib/flags.ts`, `enabled("REPORT_UNLOCK", false)`: **default OFF en código**
  mientras se construye y se prueba.
- Último PR, tras las pruebas en test mode y la revisión visual del dueño: cambiar el default a `true` **en
  código**, sin tocar Vercel.
- Con el flag OFF, el reporte debe ser **byte-idéntico** al actual, salvo el gating de WP-1, que se queda
  siempre.

---

## §11. Lo que NO se toca (guardarraíles)

- El pipeline del Analyzer (`inngest/functions/analyze-website.ts`, agentes, providers de Gemini, hedge,
  timeouts). Este brief **no puede** subir la latencia ni el consumo de Gemini por auditoría.
- `PLANS` y `PlanTier`, `/pricing`, `components/marketing/pricing.tsx`, `plan-card.tsx`, la Library.
- El checkout de planes (`/app/checkout`, `checkout-session.ts` salvo exportar el branding,
  `checkout-params.ts`), `syncSubscription`, `onInvoicePaid`, `onInvoiceFailed` y la recuperación de checkout.
- `assertQuota` para planes pagos.
- `app/liquid` y las ramas de Liquid Blocks (las trabaja otro chat).
- La Library solo se toca como dice §L. Trends solo se quita como dice §T. La landing solo como dice §LP.

---

## §12. Pruebas de aceptación (Stripe TEST mode, antes de prender el flag)

1. Free con auditoría OK → tarjeta visible → pago con tarjeta de test → vuelve desbloqueado; fixes, persona,
   3 tracks y 1 simulación funcionan; el Optimizer sigue bloqueado.
2. Llega el webhook antes que el retorno, y al revés → una sola fila, sin errores.
3. Reenviar el mismo evento desde el dashboard de Stripe → no duplica nada.
4. Forzar un fallo de liquidación en el webhook → se borra la fila de `stripe_events` → el reintento desbloquea.
5. Dos pestañas pagan → se reembolsa la segunda automáticamente.
6. Cancelar el checkout → vuelve al reporte con "no se cobró nada".
7. Usuario Pro → no ve la tarjeta; `/app/unlock/<id>` redirige al reporte.
8. Auditoría de otro usuario → 404. Auditoría fallida o con `capture_blocked` → no se ofrece.
9. Anónimo → registro → la auditoría queda reclamada → checkout → desbloqueado.
10. Sitio en ES → checkout de Stripe en ES. Comprador con IP/tarjeta de otro país → moneda local (Adaptive
    Pricing).
11. Payload de un free (DevTools / view-source) → sin texto de fixes #2+ ni persona.
12. Con WP-0 aplicado: `update profiles set plan='scale'` desde el cliente → error.
13. Reembolso desde Stripe → `status = refunded` → el reporte vuelve a bloquearse.
14. Owner monitor muestra el desbloqueo separado de las suscripciones.
15. `npm run typecheck`, `npm test` (incluye `payment-marks.test.ts`) y `npm run build` en verde.

**Tests unitarios nuevos** (`scripts/tests/`): `hasFullReport`; la decisión de liquidación (idempotencia,
duplicado, metadata ajena, no pagado); los params de la sesión (`mode: payment`, locale, métodos de pago
importados, metadata, sin `invoice_creation` ni `subscription_data`); el gating de `toClientAnalysis`; que
el webhook no envía sesiones one-time a `syncSubscription`; y que `/pricing` y `PLANS` no mencionan el
desbloqueo.

---

## §R. Fiabilidad del Analyzer para todos (PENDIENTE, el dueño va a ampliar esta sección)

Contexto: la última métrica de producción (sep 2026) daba **éxito ~79%**, p50 42 s y p95 ~118 s: una de cada
5 auditorías no entrega reporte. Restricciones: Gemini gratis y Vercel Hobby, meta de ~35 s de promedio, y
nada de esto puede frenar el Analyzer (ahora está rápido).

Borrador del WP-R (a completar):
- Re-medir con datos post-deploy (`scripts/analyzer-latency-report.mjs`, `analyses.timings`,
  `analyses.error`) y clasificar las fallas por causa: captura bloqueada, timeout, rate-limit de Gemini,
  tienda no-Shopify, etc.
- Confirmar que una auditoría fallida **nunca** consume el crédito gratis (el reembolso del crédito ya
  existe; verificar todos los caminos, incluido el anónimo).
- Estado de error honesto y útil para el usuario ("tu tienda bloquea capturas, prueba con la URL de un
  producto", "reintentar"), en vez de un error seco.
- Evento `audit_failed { reason }` (§7.1).

_(Espacio para lo que el dueño añada.)_

---

## §T. Quitar Trends por completo (decisión del dueño)

**Por qué:** no se menciona en la landing, no está bien hecho y puede entorpecer las ventas: es una sección
a medias dentro del producto que se paga. De paso libera cuota de Gemini gratis: hoy corre un cron cada
lunes que llama a la IA (`inngest/functions/refresh-trends.ts`, `0 6 * * 1`), y esas llamadas compiten con
las del Analyzer.

**Inventario encontrado en `main`** (todo esto se quita o se limpia):

| Dónde | Qué hay |
|---|---|
| `app/(app)/app/trends/page.tsx` | La página. Se borra; `/app/trends` → redirect 308 a `/app` (por si alguien la tiene guardada). |
| `components/trends/trends-board.tsx`, `components/trends/niche-search.tsx` | Se borran. |
| `lib/trends.ts` | Se borra (verificar con grep que nadie más lo importe; hoy solo lo usan la página, el board y el cron). |
| `app/actions/trends.ts` | Se borra. |
| `inngest/functions/refresh-trends.ts` + registro en `app/api/inngest/route.ts` + evento `trends/refresh.requested` en `inngest/client.ts` | Se borran. **Al desplegar, comprobar en el dashboard de Inngest que la función desapareció** y que no queda un cron huérfano. |
| `components/dashboard/nav-items.ts` (`sidebar.navTrends`) y el comentario de `components/dashboard/mobile-nav.tsx` | Se quita el ítem del menú (desktop y móvil). |
| `lib/i18n/messages.ts` (`navTrends` EN/ES) y `lib/i18n/dict/ui-en.json` / `ui-es.json` (namespaces `trendsBoard`, `trendsPage`), `lib/i18n/client-namespaces.ts` | Se quitan las claves y los namespaces. **No** tocar `sparkTrendAria`: es de los sparklines de puntaje, no de Trends. |
| `app/llms.txt/route.ts` | Quitar la línea "Weekly niche Trends across high-signal ecommerce categories." |
| `lib/stripe/plans.ts` (`quotas.trackedNiches`), `lib/quota/guard.ts` (`QuotaKind "trackedNiche"`), `app/support/page.tsx` + `supportPage.trackedNiches` | La fila "Tracked niches / Nichos seguidos" de la tabla de soporte **se quita**. En código: eliminar `trackedNiches` del tipo y de los 3 planes, y el caso `trackedNiche` del guard (nadie lo usa para bloquear; hoy devuelve `ok` siempre). |
| `lib/usage/context.ts` | Solo menciona `'trend_refresh'` en un comentario; actualizar el comentario. |
| Base de datos: `niches`, `trend_signals` (migración 0011) y `tracked_niches` si existe | **No se borran las tablas en este WP** (borrar es irreversible y no aporta nada al usuario). Se dejan huérfanas y se anota en `docs/infra-debt.md`. Antes de cualquier borrado futuro, grep de que la Library / niche pages no usan `niches` (hoy no: usan `lib/library/niches.ts`). |

**Ojo con los falsos positivos del grep "trend":** `TrendingUp` es un ícono de lucide que usan la landing,
el simulador, `site-card.tsx`, `/winning-shopify-stores`, etc. **No** es Trends: no tocar esos íconos.
Lo mismo con "trend" dentro de copy del growth-map o del simulador.

**Aceptación:** grep de `trends`, `navTrends`, `trendsBoard`, `refresh-trends` y `trackedNiche` sin
resultados en `app/ components/ lib/ inngest/` (salvo `infra-debt.md`); `/app/trends` redirige; el menú ya
no lo muestra en desktop ni en móvil; typecheck + test + build en verde; la función ya no aparece en Inngest.

---

## §L. Library: imágenes PERMANENTEMENTE resueltas, BD propia autogestionada, interfaz nueva y mucho más grande

### L.0 Lo que pide el dueño

1. Arreglar las tiendas que salen sin imagen (letra en un cuadro), y que **no vuelva a pasar nunca**.
2. Una base de datos propia de tiendas ganadoras en EliteVault, **mucho más grande** que la actual.
3. Interfaz nueva de la Library: **sin el puntaje de 100 puntos**, y **toda la tarjeta de cada tienda es un
   botón que lleva a la web de esa tienda**.
4. **Autogestionada:** si una tienda deja de funcionar, EliteVault la quita sola, y va añadiendo tiendas
   nuevas que aparecen con el tiempo.

### L.1 Contexto encontrado (`main`)

- Tabla `winning_sites` (0001 + 0017 expansión + 0026 teardown + 0037 RLS published). Columnas relevantes:
  `thumbnail_url text not null`, `favicon_url`, `domain_key` (único), `status` (draft/review/published/
  offline), `is_live`, `active_ads_count`, `internal_score`, `ad_signals`, `metrics`, `is_featured`,
  `teardown`.
- **Ya hay media autogestión:** `inngest/functions/refresh-library.ts` (cron domingo `0 5 * * 0`) →
  `lib/library/refresh.ts`: `verifyBatch` (prueba de vida, gate de publicación `judgeStore`,
  promueve/degrada) y `momentumBatch` (anuncios de Meta, revenue estimado, momentum).
- **Lo que NO está automatizado:** el descubrimiento de tiendas nuevas. `scripts/library/discover.mts`
  (Meta Ad Library primero, semillas de IA después, todo entra como `draft`) se corre **a mano**.
- Datos públicos hoy (`/winning-shopify-stores`): **92 tiendas en 13 nichos**. En `/wellness`, **10 de 13
  salen sin imagen** (Bala, HUM, Live Tinted, Boka, OSEA, Ritual, Sakara, Seed, Purple, Calm).
- Los cuatro sitios que pintan la imagen deciden por su cuenta si hay imagen:
  `components/library/site-card.tsx` (`thumbSrc`), `lib/library/niche-pages.ts` (`toThumb`),
  `components/admin/owner-library-images.tsx` (`thumbSrc` propio) y `lib/library/admin-images.ts`.
  Todos sirven las imágenes propias a través del **endpoint de transformación de Supabase**
  (`/storage/v1/render/image/...?width=800`).

### L.2 Por qué faltan imágenes: hipótesis a VERIFICAR primero (no adivinar)

Desde aquí no pude consultar la BD (la red del entorno no llega a Supabase). Lo primero que hace Code es un
**diagnóstico de solo lectura** con un script nuevo, `scripts/library/image-audit.mts`. Para cada fila
publicada clasifica `thumbnail_url` como mshots / vacío `''` / externa / propia, y para las propias:
(a) ¿existe el objeto en Storage? (b) ¿responde 200 el endpoint `render/image` con esa URL? (c) tamaño,
dimensiones y formato del original. Guarda el resultado en `docs/library-image-audit-REPORT.md`.

Hipótesis, en orden de probabilidad:

1. **Los originales son capturas de página completa (~2880×20000 px).** Eso es **~57 megapíxeles**, y la
   transformación de imágenes de Supabase tiene un límite de resolución y peso de entrada (confirmar el
   límite actual en la doc de Supabase). Si el original lo supera, `render/image` falla →
   `onError` → letra. Encaja con que "no quitaste nada" y aun así desaparecieron.
2. **Un script re-procesó y pisó las subidas manuales:** `scripts/backfill-library-images.mts` con
   `--force` reemplaza imágenes propias y **borra el objeto anterior**, y `clearImage` pone
   `thumbnail_url = ''` cuando no encuentra imagen. Si alguien lo corrió después de que subiste fotos en
   el monitor, las borró. Nada en el código marca "esta imagen la puso el dueño, no tocar".
3. **Tiendas nuevas entraron con URL de mshots:** `discover.mts` y `expand-library.ts` insertan
   `s.wordpress.com/mshots/...` y `thumbSrc`/`toThumb` la descartan a propósito (devuelve en blanco), así
   que salen con letra hasta que alguien corra el backfill a mano.
4. Formato no soportado por la transformación (p. ej. alguna subida en AVIF), o cuota de transformaciones
   del plan de Supabase.

### L.3 Solución PERMANENTE de imágenes (independiente de cuál hipótesis gane)

Principio: **una tienda sin imagen real verificada no se publica**, y la imagen que se guarda ya viene lista
para mostrarse, sin depender de ninguna transformación en vivo.

1. **Normalizar al guardar, no al mostrar.** Un único módulo `lib/library/thumbnail.ts` que, venga de donde
   venga la imagen (subida del dueño, captura automática, og:image), la recorta **al hero** (la parte de
   arriba, proporción 4:3, p. ej. 1200×900), la convierte a **WebP** (~100–200 KB) con `sharp` y la sube a
   `screenshots/library/<id>-<ts>.webp`. Las tarjetas sirven ese archivo **directo** (URL `object/public`),
   sin `render/image`. Esto elimina las hipótesis 1 y 4 de raíz y además baja el peso de la Library.
2. **Un solo helper de lectura** `libraryThumbUrl(row)` que reemplaza a los cuatro `thumbSrc`/`toThumb`
   duplicados. Las URLs viejas que todavía apunten a originales gigantes se sirven por `render/image` solo
   como compatibilidad hasta que el backfill (paso 6) las regenere.
3. **Las imágenes del dueño son sagradas.** Columna nueva `thumbnail_source` (`owner` | `capture` |
   `og_image`) + `thumbnail_checked_at`. **Ningún** script ni job sobrescribe ni borra una imagen con
   `thumbnail_source = 'owner'`. `--force` del backfill las salta siempre. `uploadLibraryImage` pasa por
   `lib/library/thumbnail.ts` (recorte + WebP) y marca `owner`.
4. **Nunca más mshots ni `''`.** `discover.mts` / `expand-library.ts` / el job automático dejan de escribir
   mshots. Si una tienda no tiene imagen real, se queda en `draft`/`review` con motivo `no_image` y no se
   publica. `thumbnail_url` admite `null` (migración) en vez del `''` mágico.
5. **Cadena de obtención automática** (para tiendas nuevas y para reparar): (a) captura de viewport del
   hero con el proveedor de capturas del Analyzer (`lib/screenshot-core.ts`, **en una cola aparte y de baja
   prioridad, nunca compitiendo con las auditorías de usuarios** ni gastando su cuota de proveedor);
   (b) `og:image` de la tienda; (c) si ambas fallan → la tienda aparece en el monitor del dueño en una lista
   "Sin imagen" para subirla a mano, y no se publica mientras tanto.
6. **Vigilancia semanal**, dentro del `refresh-library` existente: cada imagen publicada se comprueba
   (HEAD 200 + content-type de imagen). Si falla → se intenta regenerar con la cadena del paso 5 (salvo las
   `owner`, que solo se reportan) → si no se puede, la tienda pasa a `review` (sale de la Library pública)
   y aparece en "Sin imagen" del monitor. **Resultado: es imposible que una tarjeta publicada muestre la
   letra.**
7. **Backfill único** después del merge: regenerar todas las imágenes existentes al formato nuevo,
   respetando las `owner`.
8. La letra (placeholder) se queda en el código solo como red de seguridad visual, no como estado normal.
   Test que falle si una fila `published` tiene `thumbnail_url` null/mshots.

### L.4 Interfaz nueva de la Library

- **Fuera el puntaje de 100 puntos.** Quitar el badge `{activity_score}/100` de
  `components/library/site-card.tsx` y cualquier otro render de puntaje sobre 100 en la Library (revisar el
  teardown dialog, los filtros y las niche pages públicas). El dato puede seguir existiendo **internamente**
  para ordenar (mismo criterio que con el score del Analyzer): no se borra la columna, solo no se muestra.
- **Toda la tarjeta es un enlace a la web de la tienda.** `href = site.url`, `target="_blank"`,
  `rel="noopener noreferrer"`. Cómo hacerlo sin romper accesibilidad: **no** anidar botones dentro de un
  `<a>` (HTML inválido). Usar el patrón "stretched link": un `<a>` que cubre toda la tarjeta
  (`after:absolute after:inset-0`) y los botones que quedan (★ guardar, teardown) con `relative z-10`
  encima, para que sigan funcionando sin abrir la tienda. El ícono `ExternalLink` suelto sobra.
  `aria-label` = "Visitar <tienda> (se abre en una pestaña nueva)".
- Tarjetas con métricas bloqueadas (free): también clicables a la tienda (la web es pública); el candado
  sigue cubriendo solo las métricas.
- Evento PostHog `library_store_click { domain, niche, position, locked }` para saber qué tiendas
  interesan.
- Revisar en móvil (hoy el overlay de "locked" aparece siempre en móvil, `opacity-100 md:opacity-0`):
  que no tape el clic.
- **DECISIÓN ABIERTA (L-D1):** las métricas CTR / ROI / Est. conv. / Traffic son estimaciones
  **modeladas por IA**, no datos de las marcas. Hoy se rotulan "est.", pero un "ROI 4.9x" en una tarjeta se
  lee como dato real. Propuesta: mostrar solo señales verificables (anuncios activos en Meta cuando hay
  medición real, nicho, "tienda Shopify verificada", "activa desde") y dejar las estimaciones dentro del
  detalle con su etiqueta. A decidir por el dueño antes de WP-L3.

### L.5 Base de datos propia, mucho más grande y autogestionada

**Calidad antes que volumen.** Errores reales vistos en la página pública de wellness:
**"Athletic Greens (AG1)" con dominio `athletics.com`** (su dominio real es otro), **Calm** (`calm.com`, una
app de meditación, no una tienda) y **Purple** (colchones) dentro de wellness. Una Library grande con datos
así le quita credibilidad a todo el producto. El gate de publicación (`judgeStore`) se endurece:

- **Shopify verificado** (el producto es para tiendas Shopify): detectar Shopify en la home (p. ej.
  `cdn.shopify.com`, `Shopify.theme`, `/cart.js` responde JSON, cabeceras de Shopify).
- **Dominio coherente con la marca:** el título/og:site_name de la home tiene que coincidir con el nombre
  guardado. Así se cazan dominios equivocados como el de AG1.
- **Es una tienda de producto físico** (hay `/products/` o `/collections/`), no una app ni un SaaS.
- **Nicho validado** contra el contenido real de la home, dentro de `lib/library/niches.ts`.
- **Imagen real** (L.3).
- **Viva** (ya existe) y sin duplicados (`domain_key`, ya existe).
- Auditoría única de las 92 actuales con este gate nuevo → las que no pasen van a `review` con su motivo.

**Descubrimiento automático** (lo que hoy se hace a mano):

- Nuevo job de Inngest `discover-library` (cron semanal, p. ej. sábado, en otro horario que verify) que
  reutiliza la lógica de `scripts/library/discover.mts` movida a `lib/library/discover.ts`, igual que se
  hizo con verify/momentum en `lib/library/refresh.ts`.
- Fuentes, en este orden: (1) **Meta Ad Library**, anunciantes con más anuncios activos por keyword de
  nicho (si el token está configurado; si no, decirlo en el log); (2) semillas de IA con
  `GEMINI_API_KEY_JOBS` (**nunca** la clave de producción del Analyzer). Sin fuentes de pago.
- Todo entra como `draft`. Solo publica `verifyBatch` tras pasar el gate. **Tope de altas por semana**
  (p. ej. 25–40) y tope de llamadas de IA por corrida, para no agotar el free tier ni pasar los 60 s por
  step de Vercel Hobby (chunks con `step.run`, como refresh-library).
- **Bajas automáticas:** ya existe la degradación a `offline` cuando la web no responde. Añadir:
  2 semanas seguidas caída o fallando el gate → sale de la Library pública; 8 semanas → se archiva
  (no se borra la fila, por la teardown/competitor de fix tracks y los "winners" guardados en auditorías
  viejas).
- **Panel del dueño (monitor):** contadores de la última corrida (altas, bajas, en revisión, sin imagen),
  lista "En revisión" con motivo y botones aprobar/descartar, lista "Sin imagen" con subida directa.

**Meta de tamaño — DECISIÓN ABIERTA (L-D2):** propuesta: pasar de 92 a **~300 publicadas en 3 meses**
(~20 nichos × ~15), creciendo con el cron semanal y con un primer empujón manual, y subir el tope cuando la
calidad lo aguante. El número final lo decide el dueño.

### L.6 Lo que depende de la Library y NO se puede romper

- "Winners in your niche" del reporte (`lib/library/niche-winners.ts`, `analyses.niche_winners` guardado:
  las filas archivadas siguen existiendo por esto).
- Fix track `competitor` (`resolveCompetitor`, usa `teardown`).
- Búsqueda por imagen/texto (`app/actions/search.ts`) y guardados (`saved-sites.ts`).
- Páginas SEO públicas `/winning-shopify-stores` y `/[niche]`: **mantener las URLs** (sitemap, enlaces
  internos del blog). Una niche page que se quede sin tiendas suficientes deja de listarse según la lógica
  actual de `getQualifyingNiches`, no da 404 de golpe.
- El gating free/paid de la Library (métricas que no salen del servidor, `lib/library/metrics-cap.ts`).
- Las RLS de la 0037 (solo `published` es público).

### L.7 Orden de WPs de la Library

- **WP-L0** diagnóstico de imágenes, solo lectura (L.2) → REPORT al dueño.
- **WP-L1** imágenes permanentes (L.3) + backfill.
- **WP-L2** gate de calidad endurecido + auditoría de las 92 (L.5, primera parte).
- **WP-L3** interfaz nueva: sin /100 y tarjeta = enlace (L.4), tras decidir L-D1.
- **WP-L4** descubrimiento automático + bajas automáticas + panel del dueño (L.5, segunda parte).

Aceptación global: ninguna tarjeta publicada muestra la letra; subir una imagen en el monitor nunca es
pisada por un job; una tienda caída desaparece sola en ≤2 semanas; entran tiendas nuevas cada semana sin
intervención y todas pasan el gate; ninguna tarjeta muestra "/100"; clic en cualquier parte de la tarjeta
abre la tienda en una pestaña nueva, y ★/teardown siguen funcionando; el Analyzer no se vuelve más lento ni
gasta más cuota (las capturas de la Library van en cola aparte).

## §LP. Landing: dejar de venderse como "gratis" y reposicionar la sección del Analyzer

### LP.0 Decisión del dueño y razonamiento

Repetir "free" una y otra vez hace que EliteVault parezca **una herramienta genérica más** y atrae a quien
solo busca algo gratis, no a quien va a pagar. El nuevo posicionamiento es **competitivo**: asegurar el lugar
de tu tienda en su mercado, saber quién está por encima de ti y tener al asesor que te mantiene competitivo.

Reglas:
1. **El eslogan "What $1,500 of CRO consulting looks like. Free." desaparece de todos lados** (EN y ES).
2. **"Free" casi desaparece de la home.** Solo quedan tres usos, por razones concretas:
   - **una** línea de microcopy junto al CTA principal: "No card needed for your first audit" / "Sin
     tarjeta para tu primera auditoría". Todo el embudo (auditoría → desbloqueo de $7 → Pro) depende de que
     la gente pruebe la primera auditoría. Quitar toda señal de que se puede probar sin pagar bajaría los
     registros, así que la señal se mantiene, pero una sola vez, en voz baja y sin la palabra "free";
   - el **nombre del plan "Free"** en la tabla de precios (es un nombre de plan, no un eslogan);
   - la pregunta del **FAQ "Is there a free plan?"** (respuesta factual; además alimenta el schema FAQ).
3. **"store audit" se mantiene en el `<title>` y en el H1** (regla del dueño para Google). Lo que se va es el
   "Free" que va delante.
4. Los diagramas de esta sección se actualizan para que muestren **lo que el producto entrega hoy**
   (report v2: sin puntaje visible, con competidor del nicho).

### LP.1 Inventario (en `main`)

- Sección: `components/marketing/analyzer-demo.tsx` (textos de `analyzerDemo.*` en `lib/i18n/messages.ts`,
  EN ~línea 488, ES ~línea 1447) + el diagrama `components/marketing/analyzer-collage.tsx` (textos
  `collage.*`) + `analyzer-bg.tsx`.
- Video `public/videos/analyzer-teaser.webm` (54 s) + poster: graba la UI vieja (con puntaje y "free"). **No
  lo puede rehacer Code**; queda anotado para que el dueño grabe uno nuevo (ver LP.6).
- Tests que fijan los strings actuales y que **hay que actualizar a propósito, no borrar**:
  `scripts/tests/landing-keyword.test.ts` (líneas ~31, ~33 y ~102 fijan "Free Store Audit", "Free AI
  Shopify store analyzer…" y el H1 "Free Shopify store audit — …"), y `scripts/tests/seo-cannibalization.test.ts`
  (lista de keywords de la home; actualizar `docs/seo-cannibalization-fix.md` §3 para que la home pase a
  ser dueña de "store audit · shopify store audit · shopify store analyzer").

### LP.2 Nuevo copy de la sección del Analyzer (`analyzerDemo.*`)

Mantener la estructura (pill, título, subtítulo, 4 puntos con ícono, diagrama a la derecha).

| Clave | EN (nuevo) | ES (nuevo) |
|---|---|---|
| `heading` | **Secure your store's place in its market.** | **Asegura el lugar de tu tienda en su mercado.** |
| `subheadingPre` + `subheadingPrice` + `subheadingPost` | "Paste your store URL. In **about a minute** you'll see where you're losing sales, which store in your niche is ahead of you and why, and what to change first — before you put more money into ads." | "Pega la URL de tu tienda. En **cerca de un minuto** verás dónde estás perdiendo ventas, qué tienda de tu nicho va por delante y por qué, y qué cambiar primero, antes de meterle más dinero a los anuncios." |
| `stepReadsTitle` | **Find out who's ahead of you** | **Entérate si alguien está por encima de ti** |
| `stepReadsBody` | "We put your store next to the strongest store in your niche and show what they do on the page that you don't — offer, trust signals, layout. Not theory: their store, yours, side by side." | "Ponemos tu tienda junto a la más fuerte de tu nicho y te mostramos qué hace en su página que tú no: oferta, señales de confianza, estructura. Nada de teoría: su tienda y la tuya, lado a lado." |
| `stepScoresTitle` | **The advisor your store has been missing** | **El asesor que tu tienda necesitaba** |
| `stepScoresBody` | "Color, layout, imagery, tech, niche fit and CRO principles, read the way a senior CRO consultant would — with every issue marked on your own screenshot and turned into a clear plan to stay competitive." | "Color, estructura, imágenes, técnica, encaje con tu nicho y principios de CRO, leídos como lo haría un consultor CRO senior, con cada problema marcado en tu propia captura y convertido en un plan claro para seguir siendo competitivo." |
| `stepPersonaTitle` | **Hear your buyer before they leave** | **Escucha a tu comprador antes de que se vaya** |
| `stepPersonaBody` | "Pick a persona (or define one) and watch them react to your store in their own voice. \"Looks like a low-quality dropshipping site\" tells you more than any heatmap." | "Elige un perfil de comprador (o define el tuyo) y mira cómo reacciona a tu tienda con sus propias palabras. \"Parece una tienda de dropshipping de baja calidad\" te dice más que cualquier mapa de calor." |
| `stepCampaignTitle` | **Scale ads with your eyes open** | **Escala tus anuncios sabiendo lo que viene** |
| `stepCampaignBody` | "Before you raise your budget, project a 7-day Meta campaign in three honest scenarios, calibrated to your store and your niche. Estimates, not promises." | "Antes de subir tu presupuesto, proyecta una campaña de Meta de 7 días en tres escenarios honestos, calibrados a tu tienda y a tu nicho. Estimaciones, no promesas." |
| `videoAria` | "EliteVault demo: paste a URL and see where you're losing sales, who's ahead of you in your niche, and what to change first" | equivalente en ES |

Notas de copy:
- "about a minute" en vez de "60 seconds": el p50 real ronda los 40 s, pero el p95 pasa de un minuto. No
  prometer un número que a veces no se cumple.
- Cambiar los íconos de los puntos para que encajen: punto 1 → ícono de podio/trofeo o `Swords`; punto 2 →
  `Compass` o `Brain`; punto 3 (persona) se queda; punto 4 → `Megaphone` o `LineChart`. Sin logos de
  Shopify ni Meta (decisión de marca anterior).
- Cada punto debe corresponder a una pieza del diagrama (LP.3), en el mismo orden visual.

### LP.3 Diagrama (`analyzer-collage.tsx`): reflejar el reporte v2

| Pieza | Acción |
|---|---|
| Barra superior "Audit complete", **Potential ~$1k–8k/mo + nicho**, veredicto "Not ad-ready · 3 fixes" | Se queda (es el hero del report v2). Usar siempre la rama `reportV2` del collage; eliminar la rama que pinta el puntaje "54/100" o "Overall". |
| Captura anotada con pines (izquierda) | Se queda (punto 2). |
| **"Where you're leaking sales"** (radar de 6 dimensiones) | **Se queda tal cual** (decisión del dueño). Verificar que no muestre ningún número sobre 100. |
| Cita de buyer persona | Se queda (punto 3). |
| **"Top fixes — ranked by leverage"** | **Se reemplaza** por una tarjeta premium **"Competitor insights"** (punto 1), ver abajo. |
| Franja "7-day Meta" (Cons. 0.8× · Bal. 1.6× · Aggr. 2.3×) | Se queda (punto 4). |

**Tarjeta nueva "Competitor insights"** (EN) / "Tu competidor más fuerte" (ES):
- Encabezado: "Top store in your niche" + chip pequeño **"Pro"** (es premium; mismo estilo que el chip
  "Scale plan" del Meta Ads Optimizer).
- Una fila con la tienda líder: favicon genérico + **nombre de marca inventado** (p. ej. "Northpeak") + nicho
  "Fitness". **No usar una tienda real** en el diagrama de marketing: implicaría una relación o una
  comparación que la marca no autorizó.
- 3 líneas "What they do that you don't" / "Lo que hace y tú no", con chip de impacto (reusar
  `ImpactChip`):
  1. "Reviews and star rating above the fold" — high
  2. "Bundle offer right on the product page" — med
  3. "Shipping promise inside the hero" — med
- Los textos van en `collage.*` (EN/ES), no hardcodeados.

**Por qué competidor y no el Meta Ads Optimizer** (las dos opciones que planteó el dueño):
- El título nuevo ("asegura tu lugar en el mercado") y el punto 1 ("entérate si alguien está por encima de
  ti") hablan de **competencia**; la tarjeta de competidor es la prueba visual directa de esa promesa.
- El diagrama ya tiene la franja de Meta. Meter también el Optimizer pondría **dos bloques de Meta** y le
  quitaría foco al mensaje nuevo.
- El competidor ya existe en el producto (fix track `competitor`, card "Winners in your niche"), así que la
  landing promete algo que el reporte entrega.
- **Dependencia:** esa promesa solo es honesta si la Library tiene una tienda fuerte y bien clasificada en el
  nicho del usuario (§L: gate de calidad + expansión). Hasta que §L esté hecho, en nichos sin competidor el
  botón del track ya sale como "Coming soon for your niche"; la landing no debe decir "always" ni "every
  niche".
- **Alternativa (LP-D1):** si el dueño prefiere el Meta Ads Optimizer, se reemplaza la franja "7-day Meta"
  por una versión compacta del Optimizer (CPC · CTR · ROAS objetivo con su "niche median"), y no se añade
  una tarjeta extra.

### LP.4 Quitar "free" del resto de la home (EN + ES)

| Dónde (clave) | Hoy | Nuevo (EN) |
|---|---|---|
| `nav.startFree` | "Start free" | "Audit my store" |
| `hero.line1` + `hero.line2` (H1) | "Free Shopify store audit — find what's costing you sales." | "**Shopify store audit** — see who's ahead of you and why." (ES: "**Auditoría de tu tienda Shopify** — descubre quién va por delante y por qué.") |
| `hero.ctaPrimary`, `hero.auditButton` | "Audit my store free" / "Audit my store — free" | "Audit my store" |
| `hero.anonMicro` | "No login · no card · 1 free audit" | "No card needed for your first audit" (**la única señal de prueba de la home**) |
| `hero.trust` | "No credit card · 1 free analysis · Cancel anytime." | "Payments secured by Stripe · Cancel anytime" (sin repetir lo de la tarjeta) |
| `hero.signUpFallback` | "or create a free account" | "or create an account" |
| `twoPaths.analyzeCta` | "Audit my store free" | "Audit my store" |
| `compare.cta` | "Audit my store free" | "Audit my store" |
| `compare.closingPost` | "— for the price of a lunch." | Se queda (habla de precio, no de gratis). |
| `footer.freeAudit` | "Free audit" | "Store audit" (el link sigue apuntando a `/free-website-audit`; solo cambia el texto). |
| `metaPromo.signupCta` | "Create your free account" | "Create your account" |
| `pricing.heading` | "Free diagnosis. Pay for the cure." | "Start with the diagnosis. Pay when you want the full cure." |
| `pricing.subheading` | "Audit your store free — score, …" | "Your first audit shows where you're losing sales and unlocks one set of fixes. Pro opens every fix, the persona simulation, unlimited audits and 1 Meta projection a month; Scale adds unlimited projections and volume." (sin "score": el report v2 no lo muestra) |
| `social.founderNote` | "…paying $2k for a consultant… So I made the diagnosis free…" | Reescribir en clave competitiva, sin "free": "I built EliteVault because I watched good stores lose to competitors with worse products and better pages — and paying $2k for a consultant to find out why wasn't an option for most founders. So I built the advisor I wanted: it shows where your store is losing sales, who in your niche is ahead and what they do differently. No fake numbers, no dark patterns, cancel in two clicks." |
| `social.badgeNoCard` | "No credit card for your free audit" | "No credit card to start" |
| `app/page.tsx` metadata `title.absolute` | "Shopify Store Analyzer & Free Store Audit \| EliteVault" | "Shopify Store Analyzer & Store Audit \| EliteVault" |
| `app/page.tsx` `description` | "Free AI Shopify store analyzer and store audit. …" | "AI Shopify store analyzer and store audit. See where your store is losing sales, who in your niche is ahead of you, and what to fix first before you scale paid traffic." |
| openGraph / twitter title + description | con "Free" | mismo cambio, sin "Free" |
| `metadata.keywords` | incluye "free store audit", "free shopify store audit" | **Se pueden quedar** (Google no usa la meta keywords y no se ven). |
| Plan "Free" en precios, FAQ "Is there a free plan?" | — | **Se quedan** (LP.0, regla 2). |

Lo mismo en las claves ES equivalentes ("gratis", "cuenta gratis", "Empezar gratis", etc.).

**Fuera de alcance de este WP** (a propósito):
- **Strings dentro del producto** (`anonReveal`, `anonGate`, `paywall`, `report.*`): ahí el usuario ya hizo
  su auditoría y "cuenta gratis" reduce fricción real. No se tocan.
- **Páginas SEO secundarias:** `/free-website-audit` es dueña de la keyword "free ecommerce website audit"
  por diseño (mapa de canibalización), así que conserva su "free". `/ai-buyer-persona-simulator`,
  `/meta-ads-forecast` y `/winning-shopify-stores` mantienen su copy salvo los "Start free" (pasan a
  "Audit my store" por coherencia). **DECISIÓN ABIERTA (LP-D2):** confirmar con el dueño.
- **Blog:** los posts citan "$1,500–$2,000" como **precio real de mercado** de una auditoría de consultor
  (el post `ecommerce-store-audit-vs-consultant` es dueño de la keyword "cro audit cost"). Eso es un dato, no
  el eslogan; se queda.
- La fila "CRO agency · $1.5k–2k per audit" de la tabla comparativa: es una comparación de precio factual;
  se queda.

### LP.5 Impacto en SEO (honesto)

Quitar "Free" del title y del H1 puede bajar algo de impresiones en búsquedas tipo "free shopify store audit".
Es un costo aceptado a cambio del posicionamiento: esas búsquedas traen sobre todo a gente que no piensa
pagar, y "store audit" / "shopify store analyzer" (las keywords principales) se mantienen. Medir en Search
Console las 4 semanas siguientes: clics e impresiones de "store audit" y "shopify store analyzer".

### LP.6 Pendiente manual del dueño (no es tarea de Code)

- Grabar un video nuevo para `analyzer-teaser.webm` con la UI del report v2 (sin puntaje, con competidor) y
  el nuevo mensaje. Mientras tanto, el video viejo se mantiene.

### LP.7 Aceptación

- grep `1,500 of CRO` y `consultoría CRO de $1,500` → 0 resultados.
- En la home renderizada (EN y ES), la palabra "free"/"gratis" solo aparece en: la microcopy del CTA (sin la
  palabra), el nombre del plan Free y la pregunta del FAQ. Test nuevo
  `scripts/tests/landing-free-mentions.test.ts` que recorre las claves de los namespaces de la home
  (`nav`, `hero`, `twoPaths`, `compare`, `footer`, `pricing`, `social`, `analyzerDemo`, `collage`,
  `metaPromo`) y falla si aparece "free"/"gratis" fuera de una lista blanca explícita.
- `<title>` y H1 contienen "store audit" (test existente, actualizado a los strings nuevos).
- El diagrama no muestra puntaje sobre 100; muestra potencial, captura anotada, radar, persona, la tarjeta
  de competidor con chip "Pro" y la franja Meta.
- Revisión visual en móvil (375 px) y desktop: la tarjeta nueva no desborda (hubo un bug de overflow del demo
  en móvil, commit `3884893`).
- typecheck + test + build en verde.

---

## Orden general sugerido (todos los bloques)

1. **WP-0** seguridad RLS (bloqueante).
2. **§T** quitar Trends (rápido, bajo riesgo, libera cuota de Gemini).
3. **WP-1** gating del payload.
4. **§R** fiabilidad del Analyzer.
5. **WP-L0 → WP-L1** imágenes de la Library.
6. **WP-2 … WP-6** desbloqueo de $7 y prender el flag.
7. **§LP** landing reposicionada (puede ir en paralelo desde el principio: es copy + un componente; la
   tarjeta de competidor promete algo que depende de §L, así que no prometer "en todos los nichos").
8. **WP-L2 → WP-L4** calidad, interfaz y autogestión de la Library.

_(El dueño puede reordenar. Sigue habiendo espacio para añadir más secciones.)_
