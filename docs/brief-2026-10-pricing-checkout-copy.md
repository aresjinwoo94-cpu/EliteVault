# Brief — Planes + Checkout: quitar fricción y desconfianza (oct 2026)

Origen: revisión de /pricing y /app/checkout en producción (19-oct-2026) + código en la rama actual.
Objetivo: que nada en planes ni checkout frene la compra. Copy orientado a resultados, menos ruido, cero afirmaciones que no podamos respaldar.
Flujo: una rama nueva desde main, typecheck + tests, verificación por subagente, mirar /pricing y /app/checkout (desktop y móvil, EN y ES) antes del merge.

---

## P0 — Lo más grave: rompe la confianza (arreglar primero)

Pendientes de código: P0-2 y P0-3. Van primero, antes que cualquier P1.

### P0-1. Nombre del comercio en Stripe — ✅ HECHO (verificado 19-oct-2026)
El dueño cambió el nombre público en Stripe. Verificado en vivo en /app/checkout: el panel ya dice "By subscribing, you authorize **ELITEVAULT** to charge you…" (antes "VITAL LIVING LLC").
No requiere código. NO tocar.

### P0-2. Barras de "encuesta" en el checkout → ELIMINAR
`components/billing/results-bars.tsx` pinta "87.2% increased their Meta Ads ROAS" y "79.5% lowered their cost per purchase" con `SURVEY_N = 0`.
Sin encuesta real ni clientes de pago, son cifras que no podemos respaldar: riesgo legal (FTC: testimonios/afirmaciones de resultados) y de credibilidad (un 87.2% sin fuente parece inventado).
- Quitar `<ResultsBars />` de `components/billing/checkout-layout.tsx`.
- Solo se reintroduce cuando exista una encuesta real con n ≥ 30, mostrando n.

### P0-3. FAQ muestra la clave cruda "faqContent.q5"
`components/marketing/faq.tsx:31/36` usa `t(...) || item.q`, pero `t()` devuelve la propia clave cuando falta → el fallback nunca entra.
- Usar el mismo patrón que `pick()` de `lib/i18n/plan-text.ts` (si value === key → fallback).
- Añadir `faqContent.q5/a5` en EN y ES en `lib/i18n/messages.ts`.

---

## P1 — Checkout: menos distracción, menos razones para irse

### P1-1. Quitar el campo de cupón
`lib/stripe/checkout-params.ts` → `allow_promotion_codes: false`.
Hoy aparece "Add code" arriba del precio: quien ve un campo de cupón sale a buscar uno en Google y muchos no vuelven. Reactivarlo solo cuando haya una promo real.

### P1-2. Modo foco también en desktop
`components/dashboard/focus-chrome.tsx` oculta la sidebar/topbar solo en móvil (`hidden md:contents`). En desktop el checkout muestra Overview, Analyzer, Library, Community, API keys, Quick search… = salidas.
- En `/app/checkout` ocultar sidebar y topbar en TODOS los tamaños (dejar solo el header propio del checkout).
- Link de volver: `checkout.backToBilling` → "← Back" que vaya a `/pricing` (un usuario nuevo nunca vio "billing").

### P1-3. Columna izquierda del checkout (`checkout-layout.tsx`)
- BORRAR la línea `checkout.totalInPanel` / `totalInPanelYear` ("Your total is shown in the payment panel"): es texto sobre la interfaz, no sobre el producto.
- Sustituir `plan.description` en la tarjeta por una línea de resultado nueva (`checkout.outcomePro` / `checkout.outcomeScale`, ver copy abajo).
- "What you get": máximo 4–5 bullets = los mismos bullets nuevos del plan (ver §Copy).
- Fila de confianza: reemplazar "Cancel anytime · Credits load instantly" por:
  - `Cancel anytime from your account` (Shield)
  - `Instant access` (Zap)
  - (el sello "Guaranteed safe & encrypted checkout" + logos de pago se queda)
  "Credits" es jerga interna: nunca se explica en la página de planes.

### P1-4. Texto dentro del panel de Stripe (`checkout.stripeSubmit` + includes)
Hoy repite lo que ya dice la izquierda. Cambiar a reaseguro:
- EN: `Instant access to EliteVault {plan}. Cancel anytime from your account — no emails, no calls.`
- ES: `Acceso inmediato a EliteVault {plan}. Cancela cuando quieras desde tu cuenta, sin correos ni llamadas.`
(`stripeIncludesPro/Scale` dejan de usarse.)

---

## P1 — Página de planes: copy orientado a resultados

Reglas: 1 línea "para quién", precio, 1 CTA, 4–5 bullets de resultado. Nada de features técnicas en la cara (bearer tokens, image-similarity, Compare Mode). Ninguna promesa que el producto ya no haga (el **score** ya no se muestra → no prometerlo). Nada de "unlimited audits" si el plan da 40.

### Cambios estructurales (`components/marketing/pricing.tsx`)
- Quitar la fila de chips "Free → Diagnose › Pro → Cure › Scale → Volume": repite lo que ya dicen las tarjetas.
- No listar los ✗ (features no incluidas) en Free ni la línea ✗ en Pro: llenan la tarjeta de gris y hacen ver Free como "castigado". El contraste ya lo dan los planes de al lado.
- Descripción de cada tarjeta: 1 frase (hoy Free tiene un párrafo de 6 líneas).
- CTA: Free "Audit my store" / Pro "Get Pro" / Scale "Get Scale".
- Debajo de la tarjeta de Pro, texto muted `localCurrencyNote` ("Charged in your local currency at checkout") — hoy solo sale en /app/billing.

### Copy nuevo — EN (`lib/stripe/plans.ts` + `messages.ts` en)
Encabezado
- heading: `Know where your store stands. Fix what's costing you sales.`
- subheading: `Your first audit is on us. Upgrade when you want every fix, your buyer's reaction to each one, and a Meta Ads forecast before you spend.`

Free — tagline `See where you stand` · desc `One full audit of your store and one set of fixes you choose. No card needed.`
- f0 `1 full store audit + your estimated revenue potential` (highlight)
- f1 `Annotated screenshot of your page`
- f2 `1 set of fixes of your choice — unlocked` (highlight)
- f3 `3 winning stores to learn from`

Pro $19 — badge `Most popular` · tagline `For stores already selling` · desc `Every fix for your store, how your buyer reacts to it, and the winning stores to model.`
- f0 `Every fix unlocked, ranked by priority` (highlight)
- f1 `Buyer-persona reaction to each fix` (highlight)
- f2 `40 audits / month — re-check after every change or audit competitors`
- f3 `Full Library of winning stores + image search`
- f4 `1 Meta Ads forecast / month` (highlight)
- f5 `Community publishing + Compare Mode`

Scale $29 — badge `For Meta Ads spenders` (sustituye "For teams": el buyer persona es un dueño en solitario) · tagline `For stores running paid traffic` · desc `Forecast a 7-day Meta campaign across 3 scenarios before you spend a dollar.`
- f0 `Everything in Pro`
- f1 `Unlimited Meta Ads forecasts — 7 days, 3 scenarios` (highlight)
- f2 `Ads optimizer: CPC, CPM, CTR & ROAS targets` (highlight)
- f3 `200 audits / month`
- f4 `API access`

Checkout outcomes
- checkout.outcomePro: `Every fix for your store, ranked — plus how your buyer will react to each one.`
- checkout.outcomeScale: `Know what a Meta campaign will return before you spend a dollar.`
- checkout.cancelAnytime: `Cancel anytime from your account` · checkout.instantAccess: `Instant access`

### Copy nuevo — ES (`messages.ts` es)
- heading: `Descubre dónde está tu tienda. Corrige lo que te está costando ventas.`
- subheading: `Tu primera auditoría corre por nuestra cuenta. Mejora tu plan cuando quieras todos los arreglos, la reacción de tu comprador a cada uno y un pronóstico de Meta Ads antes de invertir.`

Gratis — tagline `Mira dónde estás` · desc `Una auditoría completa de tu tienda y un grupo de arreglos que tú eliges. Sin tarjeta.`
- f0 `1 auditoría completa + tu potencial de ingresos estimado`
- f1 `Captura anotada de tu página`
- f2 `1 grupo de arreglos a tu elección — desbloqueado`
- f3 `3 tiendas ganadoras de las que aprender`

Pro — badge `Más popular` · tagline `Para tiendas que ya venden` · desc `Todos los arreglos de tu tienda, cómo reacciona tu comprador a cada uno y las tiendas ganadoras a seguir.`
- f0 `Todos los arreglos desbloqueados, por prioridad`
- f1 `Reacción del buyer persona a cada arreglo`
- f2 `40 auditorías / mes — revisa tras cada cambio o audita a tu competencia`
- f3 `Biblioteca completa de tiendas ganadoras + búsqueda por imagen`
- f4 `1 pronóstico de Meta Ads / mes`
- f5 `Publicar en la Comunidad + Modo Comparar`

Scale — badge `Para quien invierte en Meta Ads` · tagline `Para tiendas con tráfico pagado` · desc `Pronostica una campaña de Meta de 7 días en 3 escenarios antes de gastar un dólar.`
- f0 `Todo lo de Pro`
- f1 `Pronósticos de Meta Ads ilimitados — 7 días, 3 escenarios`
- f2 `Optimizador de Ads: objetivos de CPC, CPM, CTR y ROAS`
- f3 `200 auditorías / mes`
- f4 `Acceso a la API`

- checkout.outcomePro: `Todos los arreglos de tu tienda, por prioridad, y cómo reaccionará tu comprador a cada uno.`
- checkout.outcomeScale: `Sabe lo que te devolverá una campaña de Meta antes de gastar un dólar.`
- checkout.cancelAnytime: `Cancela cuando quieras desde tu cuenta` · checkout.instantAccess: `Acceso inmediato`

### Notas técnicas
- Las features se traducen por índice (`plans.<id>.f<i>`). Al reducir la lista, BORRAR las claves sobrantes (f6–f8) en EN y ES o saldrán desfasadas.
- checkout y plan-card muestran `.slice(0, 6)` de las incluidas: con 4–6 bullets ya no se corta nada.
- Actualizar `metadata.description` de `app/pricing/page.tsx` (todavía dice "your #1 fix" y "full analyzer").
- Gating sin cambios: solo cambia copy/presentación. No tocar precios, Price IDs, cuotas ni webhooks.

---

## P2 — Opcionales (decisión del dueño)
- **Garantía de reembolso de 7 días** en Pro/Scale (línea bajo el precio y en el checkout). Es la palanca más fuerte contra "¿y si no me sirve?" y el costo marginal es casi cero. Solo si estás dispuesto a cumplirla.
- FAQ de precios en /pricing: "¿Qué cuenta como una auditoría?", "¿Me cobran en mi moneda?", "¿Hay reembolso?".
- Reseñas en checkout: mostrarlas solo si son de usuarios reales del producto (ya está gateado por el interruptor del dueño).

## Verificación
- Capturas de /pricing y /app/checkout?plan=pro&interval=month en desktop (1440) y móvil (390), EN y ES.
- En el checkout no debe verse: sidebar, "Add code", barras de encuesta, "Your total is shown…", "Credits".
- FAQ sin claves crudas.
