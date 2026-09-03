# Brief para `code` — 4 blogs bottom-of-funnel (EliteVault) · v2 (alineado al repo real)

> **ESTADO: EJECUTADO Y PUBLICADO (2026-09-02).** Los 4 posts están en `lib/blog/posts.ts` y en
> producción (merge `a27321e`): `ecommerce-design-trends-2026`,
> `best-shopify-tools-increase-roas-2026`, `why-customers-abandon-cart-2026`,
> `new-free-shopify-tools-2026`. **No lo vuelvas a ejecutar.**
>
> Se conserva porque el **§7 tiene los datos de Shopify Editions verificados contra las fuentes
> oficiales** — corrige 3 errores de fecha de la v1 que siguen circulando en resúmenes de terceros —
> y porque §0 + §3 son el estándar reutilizable para el próximo post.

> **Para el agente `code`** — repo `C:\Dev\MK3v2\elitevault` (Next.js App Router + React 19 + Supabase + Stripe).
> **v2:** revisado tras auditar el código real del blog. Los posts se AÑADEN a la infraestructura existente; **no se crea nada nuevo de arquitectura**.
> **Idioma:** inglés. **Datos:** 2026, solo los del Apéndice §7 (con fuente). **Autor:** Ariel Jiménez.
> **Objetivo:** 4 artículos de **fondo de embudo**, cortos y directos (estilo respuesta de Reddit con muchos upvotes), impecables para indexar y generar clics.

---

## 0. LO MÁS IMPORTANTE — cómo está montado el blog HOY (respetarlo)

Auditado el 2026-09-02. **No reinventes nada de esto:**

- **Los posts son datos, no archivos.** Viven en `lib/blog/posts.ts` como objetos del tipo `BlogPost`. Para crear un post, **agregás un objeto al array `BLOG_POSTS`**. No hay MDX, no hay CMS.
- **Forma exacta de `BlogPost`** (respetá los nombres de campo):
  ```ts
  type BlogPost = {
    slug: string;            // URL: /blog/<slug>
    title: string;           // <title>, ~55-60 chars, keyword al inicio
    h1: string;              // H1 visible (puede ser más largo/humano que title)
    description: string;     // meta description, ~150-160 chars
    keyword: string;         // query principal (UNA, sin canibalizar)
    keywords?: string[];     // secundarias → <meta keywords>
    date: string;            // ISO "YYYY-MM-DD"
    updated?: string;        // ISO última edición
    readingMinutes: number;
    excerpt: string;         // resumen en el índice /blog
    bodyHtml: string;        // HTML confiable (lo controlamos nosotros)
    author?: string;         // "Ariel Jiménez"
    faqs?: { q: string; a: string }[];
  };
  ```
- **Se genera SOLO (no lo hagas a mano, sería duplicado):**
  - `BlogPosting` + `Person`(author) + `Organization` JSON-LD → los emite `app/blog/[slug]/page.tsx`.
  - `FAQPage` JSON-LD **y** el render visual de las FAQ → salen del campo `faqs`. Solo llená `faqs`.
  - Metadata (`title`, `description`, `keywords`, `canonical`, OpenGraph, Twitter) → `generateMetadata` ya la arma desde los campos.
  - **Sitemap** → `app/sitemap.ts` mapea `allPosts()`. Agregar al array = aparece en `/sitemap.xml`. **No toques `sitemap.ts`.**
  - **Related posts** (2) y el link "All guides" → automáticos.
  - **CTA final** → hay un **bloque CTA global** al final de CADA post ("See exactly what's costing your store sales" → `/sign-up?next=/app/analyzer`). Ya existe. **No agregues un segundo bloque CTA gigante.**
- **Estilo de contenido:** `bodyHtml` se inyecta en `.article-prose` (definido en `app/globals.css`). El primer párrafo va con `class="lede"` (es el "answer capsule"). Tema **oscuro only** (texto blanco/opacidad).
- **Gráficos = SVG inline dentro de `bodyHtml`.** Ya hay ejemplos en el post `ai-ecommerce-statistics-revenue-impact` (barras teal `#2DD4BF`, gridlines `rgba(255,255,255,0.08)`, labels `rgba(255,255,255,0.40)`, `role="img"` + `aria-label` con TODOS los valores). **Copiá ese patrón.** No se montan componentes React dentro del body.

**Qué NO hacer (evita choques):** no crear rutas nuevas, no `generateMetadata` por post, no JSON-LD a mano, no editar `sitemap.ts`, no meter `<img>` con `next/image` dentro del HTML string (no aplica), no duplicar el bloque CTA global.

---

## 1. Flujo de trabajo

1. Rama nueva `feat/blog-bofu-2026`. No tocar `app/liquid` ni el Analyzer.
2. Releé `lib/blog/posts.ts` (un post completo, p. ej. `ai-ecommerce-statistics-revenue-impact` por sus SVG, y `why-your-shopify-store-isnt-converting`) para clonar convenciones exactas.
3. Agregá los 4 objetos a `BLOG_POSTS` siguiendo §3 (estándar) + §5 (spec por post) + §7 (datos).
4. Usá **solo** los datos del §7, citados. Si falta uno, dejá `{/* TODO: verificar */}` — **nunca inventes cifras**.
5. `npm run typecheck` + `npm run test` + `npm run build`. Subagente de verificación adversarial revisa §6 (DoD).

---

## 2. Choques detectados vs. el brief v1 (ya resueltos aquí)

- **Canibalización:** el post existente `why-your-shopify-store-isnt-converting` YA posee `why is my shopify store not converting`. → **Post 3 se reenfoca** a abandono de carrito/checkout (keyword distinta) y **enlaza** a ese post en vez de competir.
- **CTA:** el brief v1 pedía bloque CTA propio por post. El repo ya tiene un bloque CTA global. → El "CTA creativo" va como **link inline en prosa** (media altura + párrafo de cierre), como ya hacen los posts. (Opcional, solo si Ariel lo pide: añadir un campo `cta?` al tipo y al template para un bloque final personalizado por post — no lo hagas por defecto.)
- **Schema/metadata/sitemap:** el brief v1 pedía añadirlos por post. Son automáticos. → Solo llenar campos.
- **"Imágenes/artefactos" del Post 1:** en este blog los "artefactos" visuales son **SVG inline** (no fotos ni componentes React). → Post 1 usa SVG charts + stat tiles HTML, no `<img>`.
- **Destino del CTA de auditoría:** el repo usa `/free-website-audit` (7×) y `/sign-up?next=/app/analyzer` (4×). → Auditoría enlaza a **`/free-website-audit`**; forecast a **`/meta-ads-forecast`**. Ambas rutas existen.

> Existe `lib/blog/EDITORIAL_TODO.md` con un backlog de temas de Ariel. Estos 4 posts son distintos de esa cola (verificado). Solo respetá la regla de no pisar `why is my shopify store not converting`.

---

## 3. Estándar de redacción (reusable — vale para estos 4 y futuros)

### 3.1 Voz
- Segunda persona, directa ("your store", "you're paying for…"). Nada de "in this article we'll…".
- **Reddit de alto upvote:** abre con la respuesta, frases cortas, un dato > un adjetivo. Con opinión ("most stores get this wrong"). Honesto, sin hype.

### 3.2 Anatomía de cada `bodyHtml` (en este orden)
1. `<p class="lede">` = **answer capsule 40-60 palabras**: keyword → respuesta directa → un dato con fuente. (Es lo que la IA extrae para citarte.)
2. `<h2>` en forma de **pregunta** tal como la busca el comprador; cada uno abre con su respuesta directa en 1-2 frases.
3. Al menos **1 SVG chart o 1 tabla** en HTML semántico (ver §3.4). Post 1 y 3 llevan chart; Post 2 y 4 llevan tabla comparativa.
4. **CTA inline creativo** a media altura + en el cierre (ver §3.3). El bloque CTA global del template queda ADEMÁS, al final.
5. `faqs`: 3-5 pares (campo aparte, no en el HTML).

### 3.3 CTA creativo (inline, no bloque nuevo)
- Nace del tema, despierta curiosidad, va como link en prosa. Ejemplos por post en §5. Patrón:
  `<p>Curious which of these your store fails? <a href="/free-website-audit">Run the free audit →</a></p>`
- Uno a media altura, otro en el párrafo final. Añadí `?utm_source=blog&utm_medium=inline&utm_campaign=<slug>` a la URL.

### 3.4 Gráficos y tablas (clonar el patrón existente)
- **SVG chart:** `viewBox`, `class="w-full h-auto"`, `role="img"`, `aria-label` que liste **todos** los valores y sus fuentes. Barras `#2DD4BF`; para contraste "malo vs bueno" usá `rgba(255,255,255,0.14)` en la barra "mala" y teal en la "buena" (así lo hace el post de AI stats). Gridlines `rgba(255,255,255,0.08)`, labels `rgba(255,255,255,0.40)`, cifras `#ffffff`. Precede el chart con `<figure>` y seguilo de `<figcaption>` con la fuente enlazada.
- **Tabla:** `<table>` real dentro de `.article-prose`. Verificá que `globals.css` la estilice; si no, agregá reglas mínimas de tabla a `.article-prose` (borde `rgba(255,255,255,0.06)`, header en mono, sin romper el resto).
- **Sin fotos** salvo que aporten (no hay pipeline de `next/image` en el body). Si hace falta una imagen real, va a `/public` y se referencia con `<img width height loading="lazy" alt>`; **no inventar screenshots del Analyzer** — pedírselos a Ariel.

### 3.5 SEO / GEO
- Keyword en: H1, primeras 100 palabras (la lede), ≥1 H2, `title`, `description`, y `aria-label` del chart si aplica. Sin stuffing.
- **Enlaces internos a slugs REALES** (ver §5) + a la money page. Un enlace externo a la fuente del dato.
- Frescura: `date` y `updated` reales; refrescar cada 60-90 días.

### 3.6 Longitud
- **700-1.100 palabras.** Párrafos de 2-4 líneas. Negrita solo en lo escaneable.

---

## 4. Convenciones de enlace (usar exactamente estas)
- Auditoría gratis → `/free-website-audit`
- Meta Ads forecast/simulador → `/meta-ads-forecast`
- Librería → `/winning-shopify-stores`
- Pricing → `/pricing`
- Slugs de blog existentes para cross-link: `is-your-store-ready-for-meta-ads`, `free-website-audit-tools`, `reverse-engineer-winning-shopify-stores`, `ecommerce-store-audit-vs-consultant`, `why-meta-ads-arent-converting`, `how-to-increase-shopify-conversion-rate`, `good-conversion-rate-for-shopify`, `why-your-shopify-store-isnt-converting`, `ai-ecommerce-statistics-revenue-impact`.

---

## 5. Los 4 posts (spec — cada uno es un objeto de `BLOG_POSTS`)

### POST 1 — Ecommerce design trends 2026 (con SVG charts)
- **title (elige; recom. 1):** 1) `Ecommerce Design Trends 2026 That Actually Convert` · 2) `Ecommerce Design Trends 2026: 9 That Convert, 3 That Don't`
- **h1:** "Ecommerce design trends 2026: the 9 that lift conversions (and 3 that just look nice)"
- **slug:** `ecommerce-design-trends-2026`
- **keyword:** `ecommerce design trends 2026` · **keywords:** `shopify design trends 2026`, `ecommerce web design trends`, `best ecommerce design 2026`
- **description:** `The 2026 ecommerce design trends that actually move conversions — backed by data — and how to see which ones your store is missing.`
- **lede (borrador):** *"The ecommerce design trends worth chasing in 2026 aren't cosmetic — they're the ones tied to money: mobile-first layouts (70%+ of US ecommerce traffic is mobile), sub-2-second load times, visible trust signals, and a friction-free checkout. Everything else is decoration. Here are the 9 that lift conversion and the 3 you can skip."*
- **H2 (cada uno con su dato del §7):**
  - "What ecommerce design trends actually matter in 2026?" (encuadre: trend = conversión).
  - "How fast does your store really need to load?" → **SVG bar chart** velocidad→conversión (1s 3.05% · 2s 1.68% · 3s 1.12% · 4s 0.67%, Portent).
  - "Is designing mobile-first still worth it?" → móvil 2.86% vs desktop 2.46%; 70%+ tráfico móvil.
  - "Do reviews and trust signals change conversion?" → +270% con 5 reseñas vs 0.
  - "Which 2026 trends are hype you can skip?" → opinión fundada (marcar como opinión).
- **Visual:** 1 SVG bar chart (velocidad), 1 fila de stat tiles HTML (móvil vs desktop). NO repetir los charts del post de AI stats.
- **CTA inline:** media → *"Your store nails a few of these and quietly fails others. <a href='/free-website-audit'>See it scored in 60 seconds →</a>"*; cierre → link a `/free-website-audit`.
- **Cross-link:** `how-to-increase-shopify-conversion-rate`, `why-your-shopify-store-isnt-converting`.
- **faqs:** trend #1 en 2026 · ¿móvil convierte más que desktop? · ¿cuánto pesa la velocidad? · ¿sirven las reseñas?

### POST 2 — Best Shopify tools to increase ROAS 2026 (tabla)
- **title (recom. 1):** 1) `Best Shopify Tools to Increase ROAS in 2026 (No Fluff)` · 2) `7 Shopify Tools That Actually Increase ROAS in 2026`
- **h1:** "The best Shopify tools to increase ROAS in 2026 (ranked by what actually moves it)"
- **slug:** `best-shopify-tools-increase-roas-2026`
- **keyword:** `best shopify tools to increase roas` · **keywords:** `shopify roas tools 2026`, `increase meta ads roas shopify`, `shopify apps for roas`
- **description:** `The Shopify tools that actually raise ROAS in 2026 — tracking, attribution, CRO — ranked by what works. Plus a free way to forecast your ROAS.`
- **lede (borrador):** *"The Shopify tools that raise ROAS in 2026 fall into four buckets: server-side tracking / first-party data, attribution, ad optimization, and on-site CRO. With ecommerce Meta ROAS averaging ~2.87x, the leverage isn't more spend — it's fixing tracking and the store that receives the click. Here's what's worth it."*
- **H2:**
  - "What's a good ROAS for a Shopify store in 2026?" → ~2.87x avg; >3x sólido, >4x top. **Tabla ROAS por nicho** (§7). Encuadrar como "one 2026 analysis".
  - "Why is your ROAS stuck even with a solid product?" → casi siempre tracking roto + fugas de conversión, no el ad.
  - "The best Shopify tools to increase ROAS in 2026" → **tabla comparativa** (herramienta · categoría · qué resuelve): tracking/first-party (ej. Aimerce) · attribution (ej. Triple Whale) · AI ad optimization (ej. Madgicx) · social proof/CRO (ej. Loox) · CDP/audiencias (ej. Klaviyo) · **EliteVault — pre-spend ROAS forecast + CRO audit** *(full disclosure: our tool)*.
  - "Where most of these fall short" → honesto: casi todas miden/optimizan DESPUÉS del gasto; pocas arreglan la web que convierte el clic.
- **Honestidad:** herramientas de terceros en neutral (categoría + función). No afirmar cifras de rendimiento por app (no están en §7).
- **CTA inline:** *"Before you spend another dollar on Meta, <a href='/meta-ads-forecast'>see the ROAS your store could realistically hit →</a>"* (media y cierre).
- **Cross-link:** `why-meta-ads-arent-converting`, `is-your-store-ready-for-meta-ads`.
- **faqs:** ¿qué ROAS es bueno en 2026? · ¿qué herramienta sube más el ROAS? · ¿por qué no sube aunque escale presupuesto? · ¿necesito tracking server-side?

### POST 3 — Why customers add to cart but don't buy (REENFOCADO a abandono)
> Reenfocado para NO canibalizar `why-your-shopify-store-isnt-converting`. Ángulo: **abandono de carrito/checkout** (Baymard), distinto de "por qué no convierte" en general.
- **title (recom. 1):** 1) `Why Customers Add to Cart but Don't Buy (2026 Data)` · 2) `Why Shoppers Abandon Checkout in 2026 — 7 Reasons, Ranked`
- **h1:** "Why customers add to cart but don't buy in 2026 (the 7 real reasons, ranked)"
- **slug:** `why-customers-abandon-cart-2026`
- **keyword:** `why customers abandon cart` · **keywords:** `cart abandonment reasons 2026`, `add to cart but not buying`, `checkout abandonment shopify`
- **description:** `About 70% of ready-to-buy shoppers still leave at checkout. The 7 real reasons — ranked by data — and how to spot them on your store.`
- **lede (borrador):** *"Roughly 70% of shoppers who reach checkout still don't buy (Baymard, 2025). It's rarely price — it's friction: surprise extra costs (40%), slow delivery (20%), card-security doubts (19%), forced account creation (18%), and a long checkout (17%). Fix these before you touch ad spend."*
- **H2:**
  - "How many customers abandon checkout in 2026?" → **stat tile** 70.22% (Baymard, 50 estudios).
  - "The 7 reasons shoppers abandon (ranked)" → **SVG bar chart** con el ranking §7 (extra costs 40 · slow delivery 20 · card security 19 · account 18 · long checkout 17 · site errors 17 · returns 13 · can't see total 12).
  - "Which one is killing YOUR checkout?" → puente al audit.
  - "How to fix the top 3 fast" → costos arriba, guest checkout, trust badges.
- **CTA inline:** media → *"You can guess which of these 7 is costing you — or <a href='/free-website-audit'>see it in ~60 seconds →</a>"*; cierre → `/free-website-audit`.
- **Cross-link:** `why-your-shopify-store-isnt-converting`, `how-to-increase-shopify-conversion-rate`.
- **faqs:** ¿% de abandono en 2026? · ¿razón #1? · ¿los costos extra pesan tanto? · ¿cómo reduzco el abandono?

### POST 4 — New free Shopify tools 2026 (tabla; ✅ VERIFICADO contra fuente oficial 2026-09-02)
- **title (recom. 1):** 1) `New Free Shopify Tools in 2026 (and Which Are Worth It)` · 2) `Every New Free Shopify Tool in 2026, Ranked by Usefulness`
- **h1:** "New free Shopify tools in 2026: what just launched, and what's actually worth using"
- **slug:** `new-free-shopify-tools-2026`
- **keyword:** `new free shopify tools 2026` · **keywords:** `shopify editions 2026`, `shopify winter 2026 features`, `free shopify features 2026`
- **description:** `Every new free Shopify tool and feature in 2026 — Sidekick, checkout extensions, and more — ranked by which ones are actually worth using.`
- **✅ Verificación hecha (2026-09-02).** El §7 original estaba mal en 3 puntos; ya está corregido ahí con las fuentes oficiales. **Usá el §7 corregido, no este borrador de lede.** Regla permanente: precisar "gratis para todos" vs "incluido en planes de pago" vs "Plus" vs "free-to-install con cobro por uso". No decir "free" si es "included on paid plans".
- ~~**lede (borrador v1, OBSOLETO — contiene los 3 errores):** *"Shopify's 2026 Editions shipped 150+ updates... checkout UI extensions (once Plus-only), and the expanded Simgym component library..."*~~
- **lede publicado (correcto):** *"Shopify shipped two Editions in 2026 — Winter '26 and Spring '26, 150+ updates each. Genuinely free: Sidekick, included in every plan at no extra cost, and SimGym, free to install but charged per simulation. Checkout UI extensions? Still Plus-only for the checkout steps themselves. Here's the shortlist of new free Shopify tools in 2026 that's actually worth your time."*
- **H2:**
  - "What new free Shopify tools launched in 2026?" → **tabla** (herramienta · qué hace · free / paid-plan / Plus · ¿vale la pena?).
  - "Which ones are actually worth using?" → opinión ordenada por impacto para un dueño solo.
  - "What can't Shopify's free tools tell you?" → puente honesto: Shopify no te dice **por qué** no convertís → contrastar con **SimGym** (que simula un cambio de theme, no diagnostica la tienda que tenés hoy, y cobra por corrida) + audit gratis, *(full disclosure: our tool)*.
    - ⚠️ **NO mencionar el "preview Liquid gratis de EliteVault"** (lo pedía la v1 de este brief). `app/liquid` **no existe en `main` ni en producción** — vive solo en la rama sin mergear `perf/blocks-preview-latency`. Prometerlo sería inventar una feature. Decisión confirmada por Ariel el 2026-09-02. Reevaluar solo si esa rama se mergea.
- **CTA inline:** *"Shopify's new tools help you build faster — but not fix what isn't converting. <a href='/free-website-audit'>See your store's conversion leaks free →</a>"*
- **Cross-link:** `free-website-audit-tools`, `reverse-engineer-winning-shopify-stores`.
- **faqs:** ¿qué herramientas nuevas gratis lanzó Shopify en 2026? · ¿Sidekick es gratis? (sí, incluido en todos los planes) · ¿checkout extensions siguen siendo solo Plus? (**sí para los pasos de checkout**; thank-you/order-status desde Basic — la pregunta v1 asumía la respuesta equivocada) · ¿SimGym es gratis? (free-to-install, cobra por corrida) · ¿vale actualizar mi tema?

---

## 6. Definition of Done (checklist QA)

Por cada post (objeto en `BLOG_POSTS`):
- [ ] Campos completos y con los nombres exactos del tipo `BlogPost`.
- [ ] `bodyHtml` abre con `<p class="lede">` (answer capsule 40-60 palabras, keyword dentro).
- [ ] H2 en forma de pregunta, respuesta directa arriba de cada uno.
- [ ] ≥1 SVG chart (Post 1, 3) o tabla (Post 2, 4) con `<figcaption>` + fuente enlazada; SVG con `role="img"` + `aria-label` con todos los valores.
- [ ] **Toda cifra** coincide con §7 y cita su fuente inline (cero inventos).
- [ ] CTA inline creativo a media altura + cierre, con la money page correcta y UTM. (No se añade un 2º bloque CTA.)
- [ ] `faqs` con 3-5 pares (el schema y el render salen solos).
- [ ] `keyword` NO colisiona con posts existentes (revisar §4; Post 3 usa el ángulo abandono).
- [ ] Cross-links a ≥2 slugs reales + money page + 1 enlace externo a la fuente.
- [ ] `date` = hoy, `updated` = hoy; `author: "Ariel Jiménez"`; `readingMinutes` realista; `excerpt` para el índice.
- [ ] 700-1.100 palabras, párrafos cortos.

Global:
- [ ] Los 4 objetos agregados a `BLOG_POSTS`; `/blog` y `/sitemap.xml` los muestran **sin tocar** `page.tsx` ni `sitemap.ts`.
- [ ] `typecheck` + `test` + `build` en verde.
- [ ] Subagente adversarial confirma: cero cifras huérfanas, anatomía §3.2 presente, SVG con aria-label completo, tablas estilizadas, sin JSON-LD/metadata/sitemap duplicados a mano, cross-links existen, sin canibalización de keyword.
- [ ] Post 4: datos contrastados contra `shopify.com/editions`.

---

## 7. Apéndice de datos — USAR SOLO ESTO (cada cifra con fuente)

**Abandono de carrito (Post 3; trust en Post 1)**
- Abandono medio de carrito: **70.22%**, sobre **50 estudios**. Baymard (act. sep 2025). https://baymard.com/lists/cart-abandonment-rate
- Razones (de quienes iban a comprar): extra costs **40%** · entrega lenta **20%** · seguridad tarjeta **19%** · crear cuenta obligatoria **18%** · checkout largo **17%** · errores del sitio **17%** · devoluciones **13%** · no ver total **12%** · tarjeta rechazada **10%** · pocos métodos de pago **9%**. Baymard (misma URL).
- Contexto: **42%** abandona por "solo mirando / no listo" (inevitable, distinto de diseño). Baymard.

**Conversión, móvil, velocidad, reseñas (Post 1)**
- Conversión media ecommerce global: **2.74%** (Dynamic Yield, 2026, vía CartFlows). https://cartflows.com/statistics/ecommerce-conversion/
- Por dispositivo: tablet **2.89%** · móvil **2.86%** · desktop **2.46%** (gap casi cerrado). Dynamic Yield, 2026.
- Velocidad→conversión: 1s **3.05%** · 2s **1.68%** · 3s **1.12%** · 4s **0.67%** (~4.6×). Portent, 2022 (vía CartFlows).
- **+8.4%** conversión retail por 0.1s de mejora móvil. Google/Deloitte, 2019 (vía CartFlows).
- Reseñas: **+270%** de compra con 5 reseñas vs 0 (**+380%** en caros; **+15%** con badge verificado). Spiegel, 2017 (vía CartFlows).
- Móvil: **70%+** del tráfico ecommerce US es móvil. BreakingAC, "Ecommerce Website Design Trends for 2026". https://breakingac.com/news/2026/mar/26/ecommerce-website-design-trends-for-2026/
- 14 trends 2026 para nombrar: mobile-first, minimalismo con jerarquía, personalización IA, velocidad, filtros/búsqueda inteligente, contenido visual de alta calidad, checkout simplificado, trust signals, dark mode, microinteracciones, voice commerce, sostenibilidad, accesibilidad, social commerce. BreakingAC (misma URL).
- ⚠️ El post existente `ai-ecommerce-statistics-revenue-impact` ya usa charts de conversión por nicho — **no dupliques esas cifras**; Post 1 usa velocidad + dispositivo.

**ROAS y herramientas (Post 2)**
- ROAS medio Meta ecommerce: **2.87x** (todas industrias 2.19x); "good" **>3x**, top-cuartil **>4x**. Zentric Digital (abr 2026). https://www.zentric.digital/insights/meta-ads-roas-benchmarks-2026 — **encuadrar como "one 2026 analysis"**.
- ROAS por nicho (avg · top-25%): Fashion 2.4–3.2x · 4.0x+ | Beauty 3.0–4.0x · 5.0x+ | Health/Supp 2.8–3.6x · 4.5x+ | Home 1.8–2.5x · 3.0x+ | Food/Bev 2.5–3.5x · 4.0x+ | Electronics 2.2–3.0x · 4.0x+ | Pet 3.0–4.0x · 5.0x+. Zentric (misma URL).
- Herramientas (categoría + ejemplo, presentar neutral): Aimerce (server-side tracking/first-party) · Triple Whale (attribution) · Madgicx (AI ad optimization) · Loox (social proof/CRO) · Klaviyo (CDP/audiencias). Aimerce, "Top 5 Shopify Apps for Increasing Meta Ads Revenue in 2026". https://www.aimerce.ai/blogs/seo/top-5-shopify-apps-for-increasing-meta-ads-revenue-in-2026

**Nuevas herramientas Shopify 2026 (Post 4) — VERIFICADO contra fuentes oficiales el 2026-09-02**

> ⚠️ **Corregido.** La versión anterior de este bloque venía de un resumen de terceros (DigitalApplied) y tenía **tres errores de hecho**. No la uses. Los datos de abajo salen de las páginas oficiales de Shopify y están confirmados uno por uno. El Post 4 (`new-free-shopify-tools-2026`) ya publica esta versión corregida.

**Lo que estaba MAL en la v1 (no repetir):**
- ❌ "Checkout UI extensions ahora en todos los planes de pago (antes solo Plus)" → **falso**. Sigue partido (ver abajo).
- ❌ "Simgym: 40+ componentes React" → **falso**. SimGym no es una librería de componentes.
- ❌ "Analytics: multi-touch attribution, LTV cohorts" → **no existen** en ninguna Edition 2026.
- ❌ "Sidekick ~3× más rápido" → no aparece en la fuente oficial; no lo cites.

**Datos reales (usar SOLO esto):**
- **Hubo DOS Editions en 2026**, no una: **Winter '26** y **Spring '26**, **150+ updates cada una** (~300+ en total). Summer '26 aún sin publicar. https://www.shopify.com/editions/winter2026 · https://www.shopify.com/editions/spring2026
- **Sidekick** (asistente IA del admin): **incluido en todos los planes, sin costo extra**. Frase textual de Shopify: *"Sidekick is included with your Shopify plan. Features and usage limits vary by plan."* → **es el único "gratis para todos" real de la lista**. https://www.shopify.com/sidekick
  - Winter '26 sumó: tareas multi-step, generación de bloques para cualquier theme, edición de theme, reportes ShopifyQL a medida, chat por voz en mobile, Skills reutilizables.
  - Spring '26 sumó: integraciones con apps (Judge.me, Klaviyo, Loop, Smile), Apple Watch, disponibilidad en todas las pantallas de la app.
- **Shopify SimGym**: app propia de Shopify que **simula el comportamiento de compradores IA sobre tu theme** (comparar dos themes, o analizar uno solo, live o draft). **"Free to install"** pero **"Charges per simulation run"**; está en **AI Research Preview** y solo para tiendas elegibles. https://apps.shopify.com/simgym
  - ⚠️ Es competencia conceptual directa de EliteVault — tratarlo con honestidad, no minimizarlo.
- **Checkout UI extensions**: **partido, NO es "todos los planes de pago"**.
  - Thank-you page y order-status page → **Basic plan o superior**.
  - Pasos de information / shipping / payment → **solo Shopify Plus**. Cita textual: *"Checkout UI extensions for the information, shipping, and payment steps are available only to stores on a Shopify Plus plan."* https://shopify.dev/docs/api/checkout-ui-extensions
- **Rollouts**: A/B testing y publicación programada de themes; Spring '26 lo extendió a checkout configurations y customer accounts. Shopify **no le marca exclusividad de plan**, a diferencia de features vecinas que sí etiqueta "Exclusive to Shopify Plus" / "Exclusive to POS Pro" — encuadrarlo así, no como "gratis confirmado".
- **Analytics (Winter '26)**: heatmaps, **bot filtering**, se eliminó el tope de 180 días del historial de inventario, controles precisos de fecha/hora. **Single-view multi-store analytics = solo Plus.**
- **B2B en el admin (Spring '26)**: company profiles, volume pricing, hasta 3 catálogos B2B — llevado a **Basic, Grow y Advanced**, con la frase *"at no extra cost"*.

**Regla que se aplicó y hay que mantener:** cuando un resumen de terceros contradice a Shopify, **gana Shopify**. Y nunca decir "free" a secas: distinguir siempre *gratis para todos* vs *incluido en planes de pago* vs *Plus* vs *free-to-install con cobro por uso*.

---

## 8. (Opcional) Dejar el estándar como skill permanente
Si querés que `code` reutilice §0 + §3 sin repetir el brief: copialos a `.claude/skills/blog-writing-elitevault/SKILL.md` con frontmatter `name` + `description`. Así el próximo post solo necesita título, keyword, money page y datos+fuentes.

**Recordatorio final:** la calidad está en la estructura y en datos reales y citables. Un post corto, exacto y bien estructurado indexa y convierte mejor que uno largo y vago. Si falta un dato, se marca TODO — nunca se inventa.
