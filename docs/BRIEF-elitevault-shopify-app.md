# BRIEF — Pivote de EliteVault a App nativa de Shopify

> Para el agente **code**. Este brief define QUÉ construir y POR QUÉ. Tú decides el CÓMO fino,
> pero respeta las decisiones de arquitectura marcadas como **[NO NEGOCIABLE]** — están basadas
> en requisitos reales de Shopify (verificados sep 2026) que, si se ignoran, hacen que la app
> sea rechazada en la revisión del App Store.
>
> Metodología: trabaja por **work packages (WP)**, con typecheck + tests + un **subagente
> verificador adversarial** al cierre de cada WP (mismo patrón que usamos en Liquid Blocks).
> No marques un WP como hecho si hay tests en rojo, mutación que pasa, o degradación silenciosa.

---

## 0. Contexto y decisión estratégica

EliteVault deja el modelo "genera un Liquid y pégalo tú". Validación (Reddit + segmento):
quien sabe pegar Liquid es programador y no paga; el cliente real **ya vende, quiere retener
tráfico, y teme romper su tienda tocando código**. Por eso la instalación debe ser nativa y
sin código, y el foco es **quirúrgico: solo la página de producto**.

El diferenciador defendible **no es** "generamos bloques" (hay apps líderes que ya lo hacen:
Vitals, Loox, Judge.me, etc.). Es el **PREVIEW fiel**: el merchant ve el bloque vestido con los
colores y tipografía **reales de su tienda**, en su propia página de producto, ANTES de instalar
nada. Todo el producto gira alrededor de eso.

### Arquitectura de dos piezas [NO NEGOCIABLE]

1. **Sitio web EliteVault (Next.js actual)** → se queda como **marketing + Analyzer gratuito**
   (lead magnet, corre sobre cualquier URL, sin login). Es el tope del embudo. NO se toca su
   auth ni su modelo; solo pasa a apuntar/CTA hacia la app de Shopify.

2. **App de Shopify EliteVault (NUEVA)** → el producto de pago. Se scaffoldea desde el
   **template oficial de Shopify (React Router)**, NO se injerta en el repo Next.js. Contiene:
   - la **UI embebida** en el admin de Shopify (Polaris + App Bridge),
   - la **Theme App Extension** (el app block que se renderiza en la página de producto real).

### Qué se REUSA del trabajo ya hecho (no es un rewrite total)

- **Sí se porta:** el "cerebro" — el catálogo de 8 bloques + sus diseños/variantes
  (`lib/blocks/catalog.ts`, `variants.ts`, `design-references.md`), el CSS/HTML de cada bloque,
  y el **motor de render** (medición de tokens con puppeteer → inyección → screenshot before/after).
  Ese motor pasa a ser un **servicio/API compartido** que la app de Shopify consume para el preview.
- **Se reemplaza:** el flujo de exportar-Liquid-para-pegar, el pago one-time de Stripe, la página
  `/app/liquid` standalone, y el input por URL (ahora la tienda se conecta por OAuth).

> Nota honesta para Ariel (déjala en el PR description): volverse app de Shopify implica OAuth,
> listing en el App Store, cumplir "Built for Shopify", billing vía Shopify (Shopify cobra su
> comisión), y una revisión que tarda semanas y puede rechazar. Es un lift grande. Lo asumimos
> a propósito. El motor y los diseños se reaprovechan; lo nuevo es la capa de entrega, auth y UI.

---

## 1. Stack de la app de Shopify [NO NEGOCIABLE en los puntos marcados]

- **Template:** `Shopify/shopify-app-template-react-router` (sucesor oficial del template Remix;
  React Router v7+). Scaffoldea con la Shopify CLI. **[NO NEGOCIABLE]** — no construyas el admin
  embebido a mano con Next.js; el template trae session-token auth, webhooks y el flujo de dev/deploy.
- **UI del admin:** **Polaris** + **App Bridge (última versión, vía el script `app-bridge.js`)**.
  **[NO NEGOCIABLE]** — Built for Shopify exige App Bridge y patrones Polaris. Usa el componente
  de navegación oficial (`s-app-nav` / App Bridge nav) y el **Contextual Save Bar** para formularios.
- **Auth:** ID/session token auth de Shopify (viene en el template). Signup con credenciales de
  Shopify, sin login extra.
- **Bloques en la tienda:** **Theme App Extension** con **app blocks** que targetean secciones de
  la plantilla de producto (`enabled_on: templates: ["product"]`).
- **Datos de tienda:** Admin API + Storefront API (OAuth). Los settings de cada bloque se guardan
  como settings del app block y/o metafields.

### Límites reales de la Theme App Extension (respétalos en el diseño de bloques)

- Máximo **30 blocks por extensión**, **10 MB** de archivos totales.
- **100 KB** de Liquid (comprimido). Sugeridos: **100 KB CSS** y **10 KB JS** (comprimidos).
- Los app blocks **no** se renderizan en checkout (no aplica aquí, apuntamos a producto).
- Fidelidad: como el bloque vive DENTRO del tema, hereda el CSS del tema de forma nativa → la
  fidelidad final es automática. El preview del admin (antes de instalar) sí usa el motor puppeteer.

---

## 2. Instalación "casi automática" — el patrón correcto [NO NEGOCIABLE]

El merchant NO copia ni pega código. Pero seamos exactos con lo que Shopify permite (no lo
vendas como "lo aplicamos por ti sin que toques nada", porque no es verdad y frustra):

- Los **app blocks NO se auto-insertan** en el tema. Requieren que el merchant los añada.
- PERO existe un **deep link al editor de temas** que abre el editor **con tu app block ya
  insertado** en la plantilla de producto, en la posición por defecto. El merchant solo pulsa
  **Guardar**. Ese es el flujo objetivo: **1 clic → editor con el bloque puesto → Guardar.**
- La posición por defecto del deep link debe **coincidir con la posición que se mostró en el
  preview** (p. ej. debajo del botón "Añadir al carrito" o debajo de la descripción), para que
  lo que el merchant vio sea lo que queda.

> Alternativa estilo Vitals (auto-inyección por JS vía app embed que busca el "add to cart" e
> inserta debajo): **NO en v1.** Es más frágil (depende del DOM del tema), penaliza CLS/Lighthouse
> y no garantiza que coincida con el preview. Déjala documentada como posible fallback futuro.

---

## 3. Estructura de la app (navegación corta, nombres humanos) [requisito de Ariel]

Nada debe "sentirse hecho con IA". Navegación corta, por nombres claros, con look Polaris nativo.
Cuatro entradas en el `s-app-nav`:

1. **Inicio** — dashboard/overview.
2. **Bloques** — la herramienta estrella (galería + preview + fixes + barra IA). *(Nombre a
   confirmar con Ariel: "Bloques", "Estudio" o "Editor". Que sea humano, no "AI Generator".)*
3. **Ajustes** — configuración de la app.
4. **Facturación** — plan y pago.

Modelo de referencia de UX: **Vitals** (all-in-one, dashboard limpio, activación en 1–2 clics) y
las apps líderes de conversión. Inspiración de estructura, no de features sueltas.

### 3.1 Inicio (Dashboard)

Vista de estado, no un muro de gráficas. Debe responder de un vistazo: *¿qué tengo activo y qué
me falta?* Contenido:
- Estado de conexión de la tienda y de la Theme App Extension (¿bloques activos en la página de
  producto? sí/no).
- **Hasta 3 fixes recomendados** para la página de producto (los mismos que aparecen en Bloques),
  cada uno como card con CTA que lleva directo al bloque que lo resuelve.
- Accesos: "Ver mis bloques", "Añadir un bloque".
- (Opcional v2) métrica ligera: nº de bloques activos, última edición. Nada de vanity dashboards.

### 3.2 Bloques (herramienta estrella) — layout exacto [requisito de Ariel]

Una sola pantalla, de arriba a abajo:

1. **Panel principal: Galería + Preview.**
   - **Galería** de bloques disponibles (los 8 portados): trust icons, comparison, feature grid,
     brand cards, spec table, assurance bar, bundle tiers, low stock. Cada uno con su mini-diagrama.
   - **Preview** de la **página de producto real de la tienda conectada**, con el bloque
     seleccionado ya integrado y vestido con los tokens reales (colores/tipografía). Full-page,
     navegable (scroll). Al inicio, sin bloque seleccionado, se muestra la página tal cual.
2. **Justo debajo del panel: Fixes recomendados (MÁXIMO 3).** [requisito de Ariel]
   - Cada fix es accionable y **atado a la galería**: no se recomienda nada que un bloque no pueda
     resolver. Cada card → "Aplicar" abre ese bloque ya previsualizado. **Regla dura:** si la
     galería no lo resuelve, no se recomienda.
3. **Barra de cambios con IA.** [requisito de Ariel]
   - Un input tipo chat: el merchant escribe un cambio ("hazlo más grande", "usa el verde de mi
     marca", "quita los iconos que no aplican") y la IA ajusta el bloque seleccionado, re-renderizando
     el preview. Alcance acotado al bloque activo y sus tokens/variantes — **no** edición libre de
     todo el tema (evita romper la tienda y mantiene el preview fiel).
   - La IA opera sobre el modelo de datos del bloque (settings/variantes), no escribiendo Liquid
     crudo arbitrario. Cada cambio debe poder revertirse.

Al final del flujo, el CTA es **Instalar / Aplicar a mi tienda** → deep link al editor con el
bloque insertado (sección 2). No hay "exportar Liquid".

### 3.3 Ajustes

- Selección de la plantilla/página de producto objetivo (si hay varias).
- Preferencias de marca (tokens override si el merchant quiere forzar color/tipografía).
- Estado de la Theme App Extension y enlace para reactivar/reposicionar en el editor.
- Datos de la tienda / desconexión.

### 3.4 Facturación [NO NEGOCIABLE: usar billing de Shopify]

- **El cobro va por la Billing API de Shopify (Shopify Managed Pricing / suscripción recurrente).**
  **[NO NEGOCIABLE]** — las apps del App Store deben cobrar vía Shopify para features de merchant;
  no se puede cobrar la suscripción con Stripe directo. Shopify se lleva su comisión. El modelo
  one-time de Stripe (`STRIPE_PRICE_LIQUID_EXPORT`) **se retira** en el contexto de la app.
- **Modelo:** suscripción **recurrente mensual** (no one-time). Esto ahora sí tiene sentido y NO
  reintroduce el problema de churn del Analyzer, porque el valor es continuo: los bloques quedan
  vivos en la tienda, se pueden editar, añadimos bloques nuevos y la barra IA da uso recurrente.
- Trial (Shopify permite free trial en managed pricing) para bajar fricción de instalación.
- Gating: qué bloques/cuántos y la barra IA según el plan.

---

## 4. Diseño / look & feel [requisito de Ariel: parecerse lo máximo a Shopify]

- **Todo en Polaris.** Espaciados, tipografía, botones, estados de error (en rojo, contextuales),
  cards, banners. Que un merchant sienta que es parte del admin de Shopify, no una web externa.
- Responsive, mobile-friendly, **sin scroll horizontal**.
- **Preview en tiempo real siempre visible** al personalizar (Built for Shopify lo pide explícito).
- Nada de estética "generada por IA" (gradientes genéricos, emojis, copy inflado). Sobrio, nativo.

---

## 5. Requisitos "Built for Shopify" a cumplir desde el día 1 (verificados sep 2026)

Constrúyelo cumpliendo esto de entrada, no como retrofit:

- Embebida en el admin con **App Bridge (última versión)**; workflows principales dentro del admin
  (no incrustar sitios externos).
- **ID/session token auth**; signup con credenciales Shopify sin login extra.
- Navegación con `s-app-nav`; **Contextual Save Bar** en formularios.
- **Core Web Vitals** (p75, ≥100 muestras / 28 días): **LCP ≤ 2.5 s, CLS ≤ 0.1, INP ≤ 200 ms.**
- La Theme App Extension **no** debe bajar el Lighthouse del storefront más de **10 puntos** →
  respeta los presupuestos de CSS/JS (sección 1). Esto conecta con nuestra promesa de "no frena
  la tienda".
- Prerequisitos de elegibilidad (no de build, pero tenlos presentes): ≥50 instalaciones netas de
  tiendas de pago activas y ≥5 reviews.

---

## 6. Plan por work packages (propuesta; ajústalo si ves mejor orden)

- **WP-1 · Scaffold + auth.** App desde el template React Router, OAuth, sesión, webhooks base,
  app embebida cargando en una tienda de desarrollo. Nav Polaris con las 4 secciones (vacías).
  *Aceptación:* la app instala en una dev store y navega sin errores; auth por session token OK.
- **WP-2 · Motor de preview como servicio compartido.** Portar el motor puppeteer (medición de
  tokens + inyección + screenshot before/after) a un servicio/API que la app consume. Reusar
  catálogo y diseños de los 8 bloques. *Aceptación:* dado un dominio de tienda + bloque, devuelve
  preview fiel de la página de producto con el bloque integrado.
- **WP-3 · Pantalla Bloques.** Galería + preview + (debajo) máx 3 fixes atados a galería. Sin barra
  IA todavía. *Aceptación:* seleccionar un bloque actualiza el preview; los fixes abren su bloque.
- **WP-4 · Theme App Extension + deep-link install.** App block(s) de los 8 tipos con schema de
  settings, targeteados a plantilla de producto; deep link que abre el editor con el bloque puesto
  en la posición del preview. *Aceptación:* "Aplicar a mi tienda" → editor con bloque insertado →
  Guardar → el bloque aparece en la página de producto real, heredando estilos del tema.
- **WP-5 · Barra de cambios con IA.** Edición acotada del bloque activo vía settings/variantes,
  re-render del preview, reversible. *Aceptación:* un prompt razonable modifica el bloque y el
  preview lo refleja; nunca edita fuera del bloque; siempre reversible.
- **WP-6 · Dashboard (Inicio) + Ajustes.** Estado de conexión/extensión, 3 fixes, accesos, prefs
  de marca, target de plantilla. *Aceptación:* refleja el estado real de la tienda.
- **WP-7 · Facturación (Shopify Billing).** Managed pricing / suscripción recurrente + trial +
  gating por plan. Retirar el one-time de Stripe del contexto de la app. *Aceptación:* alta de
  suscripción de prueba en dev store; gating aplicado.
- **WP-8 · Endurecimiento Built for Shopify.** Core Web Vitals, presupuestos de la extensión,
  impacto Lighthouse storefront, estados de error, i18n base, checklist de App Store.
  *Aceptación:* mediciones dentro de umbrales; checklist cubierta.

Cada WP cierra con **subagente verificador adversarial** (busca activamente: preview infiel,
bloques que rompen el tema, CLS por inyección, IA que edita fuera de alcance, deep link que
inserta en posición distinta al preview, tests que pasan por mutación).

---

## 7. Riesgos / decisiones abiertas para Ariel (no las resuelvas solo)

1. **Nombre de la herramienta estrella** (sección 3): "Bloques" / "Estudio" / "Editor".
2. **¿Repo separado o monorepo?** Recomendación: proyecto nuevo para la app de Shopify; el motor
   de preview como paquete/servicio compartido. Confirmar preferencia de organización.
3. **Precio del plan recurrente** y qué queda detrás del paywall (nº de bloques, barra IA).
4. **Alcance de la barra IA**: confirmar que es "ajustar el bloque activo", no editar el tema entero.
