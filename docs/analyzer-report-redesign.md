# EliteVault — Rediseño del reporte del Analyzer + fix de checkout

Brief para el agente "code". Ejecutar por work packages, UNA rama/PR por mejora, con
verificación adversarial. Reglas globales al final.

> **Línea roja:** el Analyzer hoy funciona bien y RÁPIDO (p50 ~42s). Eso NO se degrada
> por nada. **No tocar `ai/`, `inngest/`, `lib/deadline.ts` ni `.env.local`.** Este
> trabajo es de UI/copy/dashboard, no del pipeline.

---

## 0. Estado actual (verificado en código)

- **Reporte** (`components/analyzer/analysis-view.tsx`): hero = **Growth Map**
  (`components/analyzer/growth-map/growth-map.tsx`) que carga score + rango
  (Copper→Elite) + potencial $/mo; luego `ReportNav` sticky + tira teaser; secciones:
  fixes (+ Winners), audit anotado + CategoryRadar, buyer persona, Library bridge, y
  `section-meta` (ad-readiness + ConversionGauges/FreeMetaPanel + Meta Optimizer +
  Simulator). La promo del Simulador (WP-4, flag `ANALYZER_META_PROMO`) ya está activa.
- **Score** (`lib/analyzer/derive-score.ts`): es una media ponderada de las 6
  `category_scores`, calculada en código.
- **CRÍTICO:** el **$ potencial, los scenarios y los paneles ROAS se DERIVAN del
  score** (`scenarioMidpoints(score, niche)`, `placement.compositeOf`,
  `ConversionGauges`/`FreeMetaPanel` reciben `score` como prop). El score es el MOTOR
  del dólar. → No se puede "borrar el score" sin romper el $ potencial.
- **El score se muestra visiblemente en:** el Growth Map (número + rango), el hook del
  banner anónimo ("your store scored N"), el **dashboard** que compara tiendas por
  corrida, y **diagramas de la landing**. `code`: haz un grep de repo por todos los
  renders del score y enuméralos antes de tocar.

---

## 1. MEJORA A — Rediseño del reporte del Analyzer

### A.1 Principio
El Growth Map gamificado (rangos Copper→Elite) es el hero equivocado para la audiencia
(operadores que ya venden y quieren fixes concretos, no un juego), es muy alto y genera
vacíos. Se reemplaza por un hero concreto + un stepper de íconos que también es la
navegación.

### A.2 QUITAR (render visible)
- El componente **Growth Map** completo (rango, mapa, medallones) y sus espacios vacíos.
- **Todo render VISIBLE del score:** el "N/100", el rango, el "your store scored N" del
  banner anónimo, el score en el **dashboard**, y el score en los **diagramas de la
  landing**.
- `ReportNav` sticky y la tira teaser → se fusionan en el nuevo stepper (A.5).

### A.3 CONSERVAR (no romper) — regla dura
- **NO borres el cálculo del score** (`derive-score.ts` y su uso en el pipeline). El
  score sigue existiendo como **métrica INTERNA**: es la entrada de `scenarioMidpoints`
  (→ $ potencial), de los scenarios, del panel ROAS y del contexto de ad-readiness.
  Solo dejamos de **mostrarlo**.
- El **$ potencial** ("potential $/mo") pasa a ser la **única métrica visible**, en
  todos los lugares donde antes estaba el score.

### A.4 Nuevo hero del reporte
Liderar con lo que convence a un operador escéptico, en este orden:
1. **Veredicto de ad-readiness EN PALABRAS** (usar el `ad_readiness` que ya se calcula):
   ej. *"Not ready for cold paid traffic — 3 things are costing you sales."* Nada de
   número 0-100, nada de rango.
2. **$ potencial** como estimado, con su caveat existente ("potential — not your
   revenue"). Motiva, pero es secundario al veredicto.
3. **Top fixes ranqueados** como la estrella real del hero (lo que el usuario vino a ver).

### A.5 Stepper de íconos (reemplaza GrowthMap + ReportNav + teaser)
- **6 íconos, uno por sección, que a la vez son sticky-nav** (clic → smooth-scroll a la
  sección). Fila/barra **compacta y delgada**, NO un diagrama alto de cajas/flechas (una
  barra grande fija se come la pantalla).
- **Set de íconos custom, un solo estilo coherente (mismo grosor/lenguaje visual). SIN
  logos de terceros** — la consistencia es lo que se ve premium; mezclar logos ajenos con
  íconos-concepto se ve amateur y además es riesgo de marca:
  - **Top fixes** → herramienta (llave inglesa)
  - **Winners in niche** → trofeo / corona / podio *(NO el logo de Shopify)*
  - **Annotated audit** → lupa / scan *(NO una estrella; representa "mirar/marcar la
    página", no "IA")*
  - **Buyer persona** → personita (idealmente con burbuja de diálogo)
  - **Ready for Meta traffic** → megáfono / diana *(NO el logo de Meta)*
  - **Simulator** → **diamante** (feature estrella; dale un acento de color para que
    destaque y jale el ojo hacia la sección de pago)
- Cada ícono con **label corto** (un ícono solo es ambiguo) + `aria-label` para
  accesibilidad.
- **Estados por plan:** para un usuario free, las secciones gateadas (Winners,
  Simulator) muestran su ícono en estado **locked (candado)** como teaser de upgrade, no
  un ícono muerto. (Owner aprobó el candado.)
- El stepper es el ÚNICO índice; no debe quedar además el `ReportNav` viejo (evitar dos
  índices).

### A.6 Dashboard + landing
- **Dashboard** (compara tiendas por corrida): reemplazar el score por el **$ potencial**.
  **OJO con la dirección:** el score era "más alto = mejor"; el $ potencial es *dinero
  dejado en la mesa*, o sea **más alto = peor tienda**. Framear claro (ej. "potential to
  recover" y/o indicar que menos es mejor) para no confundir al comparar tiendas.
- **Landing:** quitar el score de los diagramas y usar el concepto de $ potencial,
  alineado con el rediseño.

### A.7 Guardarraíles de A
- Idealmente todo detrás de un flag nuevo (ej. `ANALYZER_REPORT_V2`, default off para
  poder revertir sin deploy, y encenderlo al validar). Si el flag complica demasiado el
  dashboard/landing, al menos el reporte va tras flag.
- Gating intacto (Winners/Simulator siguen pro/scale; free = 1 audit → gate).
- Verificar en los 4 estados (free / Pro / Scale / anónimo) y en móvil.

---

## 2. MEJORA B — Checkout: quitar el precio duplicado

- **Problema:** Stripe tiene moneda automática por región (muestra el precio localizado),
  pero el checkout de EliteVault renderiza además su **propio** precio SOLO en USD. →
  el precio aparece **2 veces y en monedas distintas**, lo que confunde y baja conversión.
- **Fix:** en el checkout, **una vez seleccionado el plan**, **quitar el precio propio de
  EliteVault** y dejar únicamente el de Stripe (localizado). (En la tarjeta del plan,
  antes de seleccionar, puede seguir el precio de referencia; el duplicado a eliminar es
  el que se muestra junto/encima del widget de Stripe tras elegir plan.)
- **Verificar:** tras elegir plan no queda precio USD duplicado; Stripe muestra el
  localizado; desktop + móvil.
- **Guardarraíl:** NO tocar la lógica de Stripe/billing (precios, sesiones, webhooks);
  esto es solo display.

---

## 3. Orden de ejecución

1. **Ejecutar MEJORA A y MEJORA B** (una rama/PR cada una), verificar, y **mergear a
   main.**
2. **FASE 2 — Rename de EliteVault: NO EMPEZAR.** Decisión de marca/dominio aún abierta.
   Se coordina entre owner + Claude antes de tocar código. Notas para no olvidar:
   - No usar "Shopify" en el nombre/dominio (trademark de Shopify + futura app en el
     Shopify App Store).
   - El keyword ("shopify store analyzer") va en título/SEO, no en la identidad de marca.
   - Elegir un nombre *ownable* y claro en el espacio ecommerce/CRO (ni cripto ni
     genérico-keyword). Documentado aquí solo como contexto; **no es tarea de build.**

---

## Guardarraíles globales

- **El Analyzer funciona bien y rápido — no degradar latencia ni pipeline por nada.**
  No tocar `ai/`, `inngest/`, `lib/deadline.ts`, `.env.local`, ni budgets/modelos.
- Una rama/PR por mejora; **reporta y DETENTE, no mergees.**
- Verificación adversarial al cierre de cada mejora.
- `npm test` + `npm run build` + ESLint pasan; `typecheck` con los mismos errores
  preexistentes de main (0 nuevos).
- No cambiar defaults de otros flags (salvo introducir `ANALYZER_REPORT_V2` si se usa).
