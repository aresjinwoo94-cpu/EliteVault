# Brief — 3 blogs nuevos para la primera venta

**Para:** agente "code" · **Autor:** Claude (Cowork) · **Fecha:** 2026-10-14
**Base:** `origin/main` · **Rama sugerida:** `feat/blog-first-sale-3-posts` (en un worktree nuevo)
**Flujo:** el de siempre (superpowers, typecheck + test, subagente de verificación adversarial, PR sin mergear hasta OK del dueño).
**Archivo principal:** `lib/blog/posts.ts` (+ `app/blog/[slug]/page.tsx` para el schema del video).

---

## 0. Objetivo y decisiones del dueño (no negociables)

Tres posts nuevos, cada uno con su keyword EXACTA (verificada por el dueño en Semrush):

| # | Keyword principal (tal cual) | Slug |
|---|---|---|
| A | `abandoned cart recovery` | `/blog/abandoned-cart-recovery` |
| B | `shopify product page` | `/blog/shopify-product-page` |
| C | `shopify cro audit` | `/blog/shopify-cro-audit` |

- La keyword va **tal cual** en: `keyword`, slug, inicio del `title`, `h1` y la primera frase del cuerpo.
- **Video obligatorio en los 3:** https://www.youtube.com/watch?v=43CfVNIds7Q, con el título exacto "Let's make your Shopify store unbeatable" (canal Elitevaultapp).
- **Diagramas en lugar de imágenes:** SVG inline (detalle en §3).
- Idioma: inglés. Autor: `"Ariel Jiménez"`.

## 1. Conflicto que hay que resolver PRIMERO

En main, el post `ecommerce-store-audit-vs-consultant` tiene hoy `keyword: "shopify cro audit"`. El brief de canibalización pedía `cro audit cost`; quedó distinto. Si se publica el post C sin tocarlo, falla `scripts/tests/seo-cannibalization.test.ts` y además se canibalizan entre sí.

**Arreglo (dentro de este mismo PR):**
- `ecommerce-store-audit-vs-consultant` → `keyword: "cro audit cost"`
  - title: `CRO Audit Cost: What $2,000 Buys (+ a 60-Second Option)`
  - h1: `How much does a CRO audit cost — and what do you actually get for $2,000?`
  - keywords: `["cro audit cost", "how much does a cro audit cost", "cro consultant cost", "cro agency pricing", "cro audit vs consultant"]`
  - **Quitar** de ese post: `shopify cro audit`, `shopify cro audit report`, `ecommerce cro audit` (pasan al post C).
  - Ajustar la primera frase del cuerpo para que responda "cro audit cost". El resto del contenido se queda igual.
  - Añadir un enlace contextual a `/blog/shopify-cro-audit` con el anchor "Shopify CRO audit checklist".
  - `updated` = fecha del deploy.
- `app/page.tsx` → quitar `"cro audit tool"` del array `keywords` de la home.
- `why-customers-abandon-cart-2026` se queda como está: su intención es "por qué abandonan" y la del post A es "cómo recuperarlos". Solo se enlazan entre sí, sin repetir secciones.

## 2. Reglas comunes a los 3 posts

**Longitud y legibilidad.** Entre 1.500 y 2.200 palabras de cuerpo. Que sea largo NO significa relleno: el post tiene que cubrir lo que la búsqueda espera (Shopify, Klaviyo y las agencias que rankean tienen guías completas). Para que un lector con prisa no se pierda:
1. `<p class="lede">` con la **respuesta corta en 2–3 frases** (estilo de los posts actuales).
2. El **video justo después del lede**.
3. Un **CTA inline temprano**, antes del primer tercio del texto, además del CTA del final.
4. H2 escritos como preguntas o pasos, y listas y tablas para que se pueda escanear.

`readingMinutes` = palabras / 230, redondeado.

**Que no parezcan hechos en serie.** NO copiar el esqueleto de los posts recientes ("What does X actually do? / Who does what / When to hire"). Cada post lleva la estructura de su intención (§4).

**Datos.**
- Cada número lleva un enlace a la fuente primaria, y se verifica abriendo la fuente. Fuentes base:
  - Abandono y motivos: https://baymard.com/lists/cart-abandonment-rate
  - Product page UX: https://baymard.com/blog/current-state-ecommerce-product-page-ux y https://baymard.com/research/product-page
  - Benchmarks de flujos de carrito abandonado: https://www.klaviyo.com/blog/abandoned-cart-benchmarks (usar la edición más reciente disponible y citarla con su año)
  - Funciones de Shopify (abandoned checkout emails, theme editor, sections/blocks): https://help.shopify.com
- **Prohibido inventar** cifras, precios de apps o resultados de clientes. Si un ejemplo usa números ilustrativos, se rotula explícitamente: "Example:" / "illustrative".
- El 70.22% de Baymard aparece **solo en el post A**. En B y C se usan otros datos.

**Voz y marca.**
- Honesta y directa, sin hype. Al mencionar EliteVault: "(ours — full disclosure)", como en los posts actuales.
- **Minimizar la palabra "free".** El dueño reposicionó la marca porque "free" la hace ver genérica. CTA sugerido: `Run the audit on your store →`, no "free audit".
- Ángulo de marca del video: ganarle a la competencia, "unbeatable", asegurar el lugar de tu tienda en tu nicho. Usarlo en el puente hacia el video y en el cierre, sin forzarlo.
- Ninguna mención a la app de Shopify de bloques: aún no está publicada.

**Enlaces.**
- CTA al Analyzer (patrón existente): `/sign-up?next=/app/analyzer&amp;utm_source=blog&amp;utm_medium=inline&amp;utm_campaign=<slug>`
- Un enlace contextual a `/` por post (anchor: "Shopify store audit").
- Enlaces cruzados entre los 3 posts nuevos, más los posts existentes indicados en cada uno.
- Ningún post nuevo incluye en `keywords` el `keyword` principal de otro post (lo valida el test).

**FAQ.** 5 por post, con preguntas reales de la intención ("People also ask"). Ya se emiten como FAQPage JSON-LD.

## 3. Componentes nuevos

### 3.1 Video definitivo (con schema)
- En `posts.ts`, crear `const FINAL_VIDEO_ID = "43CfVNIds7Q"` y `const FINAL_VIDEO_TITLE = "Let's make your Shopify store unbeatable"`, más un `finalVideo` con **el mismo patrón facade** que `teaserVideo` (iframe `youtube-nocookie`, `srcdoc` con thumbnail, `loading="lazy"` y el link "Watch on YouTube" rastreable). Mejor: extraer una función `videoFacade(id, title, caption)` y que `teaserVideo` la reutilice, sin cambiar su HTML de salida.
- Caption sugerido: `From our channel: how to make your store the one shoppers pick in your niche.`
- **Schema VideoObject:** añadir al tipo `BlogPost` un campo opcional `video?: { id: string; title: string; description: string; uploadDate: string }`. En `app/blog/[slug]/page.tsx`, si existe, emitir un JSON-LD `VideoObject` con `name`, `description`, `thumbnailUrl` (`https://i.ytimg.com/vi/<id>/hqdefault.jpg`), `uploadDate`, `embedUrl` y `contentUrl`.
  - `uploadDate` es obligatorio para Google. Obtenerlo de la página del video. **Si no se puede verificar, NO inventarlo:** dejar el campo `video` fuera, anotarlo en el PR y pedírselo al dueño.

### 3.2 Diagramas SVG inline
- Cada diagrama va como `<figure class="my-8 rounded-2xl border border-white/[0.08] bg-card p-5 md:p-6">` + `<svg>` + `<figcaption class="mt-3 text-xs text-white/35">`. Mismo marco visual que el video.
- `<svg viewBox="..." width="100%" role="img" aria-labelledby="...">` con `<title>` y `<desc>` (accesibilidad y contexto para buscadores).
- Paleta de marca: teal (`#2DD4BF` = primary 400 en `tailwind.config.ts`), blancos con opacidad y fondo transparente. **Cero dorado**, la marca ya no lo usa.
- Texto real dentro del SVG (`<text>`), con tamaño legible en móvil (≥12px efectivos a 360px de ancho). Si un diagrama no se lee en móvil, usar una versión vertical o apilada.
- Sin JS, sin librerías y sin `<foreignObject>`. Peso razonable (< 8 KB por diagrama).
- Mínimo 2 diagramas por post (especificados en §4).

## 4. Los 3 posts

---

### A · `abandoned-cart-recovery`

- **title:** `Abandoned Cart Recovery: The 3-Message Flow That Works`
- **h1:** `Abandoned cart recovery: how to win back shoppers who left — and stop the next ones leaving`
- **description (~155):** `Abandoned cart recovery, step by step: the 3-message flow, timing, what to write in each, Shopify vs apps — and why fixing the page beats chasing the cart.`
- **keywords:** `["abandoned cart recovery", "shopify abandoned cart recovery", "abandoned cart email", "abandoned cart email sequence", "abandoned cart flow", "cart recovery rate"]`
- **Intención:** proceso / how-to. El lector quiere montar o mejorar su flujo de recuperación.

**Estructura:**
1. **Lede:** qué es y la idea central (recuperar es necesario, pero el que no llega a abandonar vale más).
2. **Video.**
3. **H2 What counts as an abandoned cart (and why Shopify only emails some of them)?** Diferencia entre cart y checkout abandonment. El email nativo de Shopify solo puede escribir a quien dejó su email en el checkout (verificar en help.shopify.com).
4. **H2 How much revenue is sitting in abandoned carts?** Dato de Baymard (70.22% + enlace). **Diagrama A1:** embudo con ejemplo ilustrativo rotulado ("Example: 100 add-to-carts → ~70 leave → only those with an email can be contacted → a share recovered"). Mensaje del diagrama: recovery solo trabaja sobre la porción con email.
5. **CTA inline temprano.**
6. **H2 The recovery flow, step by step.** **Diagrama A2:** línea de tiempo horizontal (vertical en móvil) con Message 1 (~1h, recordatorio sin descuento), Message 2 (~24h, objeciones + prueba social), Message 3 (~48–72h, incentivo opcional) y SMS opcional. Aclarar que los tiempos son práctica común y citar benchmarks de Klaviyo para el rendimiento.
7. **H2 What to write in each message.** Tabla: mensaje | objetivo | asunto de ejemplo | qué incluir | error común.
8. **H2 Shopify's built-in emails vs a recovery app.** Tabla neutral: Shopify nativo | Klaviyo | Omnisend | otros, con qué cubre cada uno. **Sin precios** (dirigir a la página de precios de cada uno).
9. **H2 Why recovery alone has a ceiling.** Los motivos de abandono de Baymard (costes extra, confianza, checkout largo…) nacen en la página de producto y el carrito, antes del email. Puente: arregla la fuga en origen. Enlaces a `why-customers-abandon-cart-2026` y `shopify-product-page`.
10. **H2 Your abandoned cart recovery checklist.** Lista de verificación de 8–10 puntos.
11. **Cierre + CTA** (ángulo competitivo: "the stores that win your niche lose fewer carts in the first place") + enlace a `/` y a `shopify-cro-audit`.
12. **FAQ (5):** best time to send the first email; should I offer a discount; does Shopify do it automatically; what's a good recovery rate (solo con fuente); email vs SMS.

---

### B · `shopify-product-page`

- **title:** `Shopify Product Page: 12 Elements That Make It Sell (2026)`
- **h1:** `The Shopify product page that sells: 12 elements, in the order shoppers see them`
- **description (~155):** `What a Shopify product page needs to convert: 12 elements above and below the fold, mobile rules, common mistakes — and how to change yours without breaking the theme.`
- **keywords:** `["shopify product page", "shopify product page design", "shopify product page best practices", "shopify product page examples", "optimize shopify product page", "shopify product page layout"]`
- **Intención:** anatomía / best practices. El lector quiere saber qué poner y en qué orden.

**Estructura:**
1. **Lede:** el trabajo de la página de producto es responder 5 preguntas antes de que el comprador se vaya: qué es, si es para mí, cuánto cuesta en total, si me puedo fiar y cuándo llega.
2. **Video.**
3. **H2 What does a Shopify product page have to do?** Las 5 preguntas, más un dato de la investigación de product page de Baymard (con enlace).
4. **Diagrama B1 (el principal):** wireframe anotado de una product page de escritorio con los 12 elementos numerados. Above the fold: galería, título, precio, snippet de reviews, selector de variantes, botón Add to cart, línea de envío y devoluciones, iconos de confianza. Below the fold: beneficios, tabla comparativa, reviews completas, FAQ.
5. **CTA inline temprano.**
6. **H2 Above the fold: elements 1–6.** H3 por elemento: qué es, por qué importa y el error típico.
7. **H2 Below the fold: elements 7–12.** Igual.
8. **H2 What changes on mobile?** **Diagrama B2:** comparación móvil vs escritorio (sticky add-to-cart, galería deslizable, envío visible sin scroll).
9. **H2 How do you change your product page without breaking your theme?** Duplicar el tema antes de editar, usar el theme editor, sections y blocks (Online Store 2.0, verificar nombres en help.shopify.com), cuidado con el código pegado de IA. Enlace a `ai-shopify-designer`. *(Toca el miedo #1 del cliente ideal: romper la tienda.)*
10. **H2 Common Shopify product page mistakes.** Tabla: error | qué pierde | arreglo.
11. **H2 How does your product page compare to the top store in your niche?** Puente al ángulo del video y CTA al Analyzer.
12. **FAQ (5):** best layout; how many images; where to put reviews; should price show shipping; how to A/B test on Shopify.
- **Enlaces:** `/`, `abandoned-cart-recovery`, `shopify-cro-audit`, `how-to-increase-shopify-conversion-rate`.

---

### C · `shopify-cro-audit`

- **title:** `Shopify CRO Audit: The Step-by-Step Checklist (2026)`
- **h1:** `How to run a Shopify CRO audit: the step-by-step checklist (and what to fix first)`
- **description (~155):** `Run a Shopify CRO audit step by step: the data to pull, what to check on each page from home to checkout, how to prioritize fixes, and what a good audit report includes.`
- **keywords:** `["shopify cro audit", "shopify cro audit checklist", "shopify cro audit report", "ecommerce cro audit", "cro audit checklist", "conversion audit shopify"]`
- **Intención:** checklist / proceso. El lector quiere auditar su tienda o entender qué incluye una auditoría antes de pagarla.

**Estructura:**
1. **Lede:** qué es un CRO audit (encontrar dónde se pierden compradores y ordenar los arreglos por impacto) y en qué se diferencia de un audit de speed o SEO.
2. **Video.**
3. **H2 What is a Shopify CRO audit (and what it isn't)?** Comparación breve con speed y SEO. Enlace a `free-website-audit-tools`.
4. **H2 What data should you pull before you start?** Reportes de Shopify Analytics. Enlace a `store-analyzer-vs-shopify-analytics` (hoy "how to read shopify analytics").
5. **Diagrama C1:** el recorrido del comprador por etapas (Home → Collection → Product → Cart → Checkout) con 2–3 puntos a revisar bajo cada una.
6. **CTA inline temprano.**
7. **H2 The checklist, page by page.** Un H3 por etapa, con checklist (`<ul>`) de 5–7 puntos accionables cada uno.
8. **H2 How do you decide what to fix first?** **Diagrama C2:** matriz 2×2 de impacto vs esfuerzo (quick wins / big bets / fill-ins / skip), con ejemplos rotulados.
9. **H2 What should a CRO audit report include?** Tabla de entregables: hallazgo | evidencia | prioridad | arreglo propuesto.
10. **H2 DIY, consultant or AI audit?** Comparación corta. Para precios, enlazar a `ecommerce-store-audit-vs-consultant` (ahora "cro audit cost") sin repetir ese contenido.
11. **H2 Benchmark against the store that's beating you.** Ángulo del video: auditarte contra el líder de tu nicho, no contra un checklist genérico. CTA al Analyzer (ours, full disclosure).
12. **FAQ (5):** how long does a CRO audit take; how often should I audit; what tools do I need; what's a good Shopify conversion rate (enlace a `good-conversion-rate-for-shopify`, sin cifra propia si no hay fuente); can I do it myself.
- **Enlaces:** `/`, `abandoned-cart-recovery`, `shopify-product-page`.

---

## 5. Verificación (subagente adversarial)

- `npm run typecheck` (o el equivalente del repo) + `npm test` en verde, **incluido `seo-cannibalization.test.ts`**.
- Añadir al test un caso: los slugs `abandoned-cart-recovery`, `shopify-product-page` y `shopify-cro-audit` existen; su `keyword` es exactamente la de §0; su `bodyHtml` contiene `43CfVNIds7Q` y al menos 2 `<svg`.
- En el dev server, para cada post nuevo: `<title>`, meta description, `<h1>`, canonical auto-referente, JSON-LD BlogPosting + FAQPage (+ VideoObject si hay `uploadDate`). Y `/sitemap.xml` debe incluir los 3.
- Conteo de palabras del cuerpo por post (reportar), entre 1.500 y 2.200.
- Revisión visual a 360px y 1280px: los diagramas se leen, no hay scroll horizontal y el video facade carga solo la miniatura hasta el clic.
- Cada número del texto tiene un enlace a su fuente, y el subagente abre al menos 3 fuentes para confirmar las cifras.
- grep: `free` no aparece en title, h1 ni en los CTAs de los posts nuevos.

## 6. Entrega

- PR a main **sin mergear**. En la descripción: tabla con slug | keyword | palabras | nº de diagramas | fuentes usadas. Y la lista de lo manual del dueño:
  1. Confirmar `uploadDate` del video si quedó pendiente.
  2. Tras el deploy: Search Console → Inspección de URL → Solicitar indexación de los 3 posts y de `ecommerce-store-audit-vs-consultant`.
  3. Publicar cada post en las comunidades del plan (Reddit, foros de Shopify) enlazando el post, no solo el video.
