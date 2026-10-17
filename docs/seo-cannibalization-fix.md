# Brief — Arreglar canibalización de keywords (SEO)

**Para:** agente "code" · **Autor del análisis:** Claude (Cowork) · **Fecha:** 2026-10-10
**Rama base:** `main` (producción). NO partir de `feat/owner-monitor-v2`: su `lib/blog/posts.ts` está desfasado (le faltan 4 posts que sí están en main).
**Rama sugerida:** `fix/seo-keyword-cannibalization`
**Flujo:** el de siempre (superpowers, rama nueva, typecheck + test, subagente de verificación adversarial).

---

## 1. Problema

Varias URLs propias apuntan a la misma keyword. Google divide la señal entre ellas y ninguna se consolida. Tres conflictos:

| Keyword | URLs que compiten hoy |
|---|---|
| **store audit / free store audit / shopify store audit** | `/` (home) · `/free-website-audit` · `/blog/store-audit-review-my-store-feedback` · `/blog/ecommerce-store-audit-vs-consultant` · `/blog/free-website-audit-tools` (secundaria) |
| **shopify store analyzer / store analyzer** | `/` (home) · `/blog/shopify-store-analyzer` · `/blog/store-analyzer-vs-shopify-analytics` · `/free-website-audit` ("web analyzer") |
| **why is my shopify store not converting** | `/blog/why-your-shopify-store-isnt-converting` · `/blog/store-analyzer-vs-shopify-analytics` (secundaria) |

## 2. Regla

**Una keyword principal por URL.** La home es dueña de "store audit" y "shopify store analyzer". Las demás páginas se re-apuntan a otra intención, con contenido que ya tienen.

- **NO se cambian slugs ni URLs** → cero redirects 301, no se pierde lo indexado.
- **Home: título y H1 se quedan IGUAL** (decisión del dueño, y están bien):
  - title: `Shopify Store Analyzer & Store Audit | EliteVault`
  - H1 (`hero.line1`): `Shopify store audit —` (LP oct-2026: sin "Free" delante)
- No tocar los CTAs del blog a `/sign-up?next=/app/analyzer` (PR #96).
- No tocar `app/liquid`.

## 3. Mapa de keywords (fuente de verdad)

| URL | Keyword principal NUEVA | Antes |
|---|---|---|
| `/` | store audit · shopify store audit · shopify store analyzer | LP oct-2026: la home deja de apuntar a "free …" |
| `/free-website-audit` | **free ecommerce website audit** | store audit |
| `/blog/store-audit-review-my-store-feedback` | **review my shopify store** | store audit |
| `/blog/ecommerce-store-audit-vs-consultant` | **cro audit cost** | ecommerce store audit |
| `/blog/shopify-store-analyzer` | **how to analyze your shopify store** | shopify store analyzer |
| `/blog/store-analyzer-vs-shopify-analytics` | **how to read shopify analytics** | store analyzer |
| `/blog/free-website-audit-tools` | free website audit tools | (sin cambio; solo limpiar secundarias) |
| `/blog/why-your-shopify-store-isnt-converting` | why is my shopify store not converting | (sin cambio; queda como dueña única) |

Antes de elegir, revisé en Google la página de resultados de cada keyword nueva para confirmar que la intención coincide con el contenido del post:
- "cro audit cost": salen guías de precios de agencias.
- "how to read shopify analytics": salen guías de reportes.
- "free ecommerce website audit": salen landings de auditoría gratis de agencias.
- "review my shopify store": mezcla el subreddit r/reviewmyshopify y servicios de review con apps de reseñas de producto. Es algo ambiguo, por eso va acompañada de las secundarias "shopify store feedback" y "rate my shopify store".

---

## 4. Cambios por archivo

### WP-1 · `/free-website-audit` (app/free-website-audit/page.tsx + lib/i18n/messages.ts)

- `metadata.title`: `Free Ecommerce Website Audit — Conversion Check in 60s`
  (respetar la plantilla de título del layout; si duplica "EliteVault", ajustar)
- `metadata.description`: `Free ecommerce website audit: paste your URL and get a conversion check, an annotated screenshot and ranked fixes in about a minute. Shopify, DTC & dropshipping. No card.`
- `openGraph.title`: `Free Ecommerce Website Audit — EliteVault`
- `openGraph.description`: sin la frase "store audit".
- `freeAudit.heroH1`:
  - EN: `Free ecommerce website audit — see why visitors leave without buying`
  - ES: `Auditoría web gratis para ecommerce — descubre por qué se van sin comprar`
- `metadata.keywords`:
  - **Quitar:** `store audit`, `free store audit`, `free shopify store audit`, `shopify store audit`, `ecommerce store audit tool`, `free store analyzer`, `shopify audit tool` y el bloque "Design/desire cluster" (queda solo en la home).
  - **Poner primero:** `free ecommerce website audit`, `ecommerce website audit`, `online store website audit`.
  - **Mantener:** el grupo dropshipping (intención distinta y válida) y `free website audit` / `website audit tool`.
- **Copy visible del body** (`freeAudit.*` en EN y ES): donde un H2/H3 o la primera frase del body digan "store audit", cambiar a "ecommerce website audit". Las menciones sueltas en párrafos pueden quedarse.
- **Comentarios del código:** quitar el que dice `// Primary — this page is the dedicated "store audit" landing.` y dejar uno que apunte a este brief.

### WP-2 · Posts del blog (lib/blog/posts.ts)

Para cada post: cambiar `keyword`, `keywords`, `title`, `h1`, `description`, y poner `updated` a la fecha del deploy. **Reescribir las primeras ~200 palabras** para que respondan la keyword nueva de forma directa (Google y los motores de IA leen eso primero). Ajustar también los H2 que repitan la keyword vieja. El resto del contenido se conserva.

**a) `store-audit-review-my-store-feedback`**
- keyword: `review my shopify store`
- keywords: `["review my shopify store", "shopify store feedback", "rate my shopify store", "r/reviewmyshopify", "shopify store review checklist"]`
- title: `Review My Shopify Store: What Feedback Threads Keep Saying`
- h1: `Asked strangers to review your Shopify store? Here's what the feedback keeps repeating`
- description: `What "review my Shopify store" threads keep repeating: unclear hero, buried trust, slow mobile, surprise costs — and which fix to make first.`

**b) `ecommerce-store-audit-vs-consultant`**
- keyword: `cro audit cost`
- keywords: `["cro audit cost", "how much does a cro audit cost", "cro consultant cost", "cro agency pricing", "ecommerce cro audit price"]`
- title: `How Much Does a CRO Audit Cost? (2026 Prices + a Free Option)`
- h1: `How much does a CRO audit cost — and what do you actually get for $2,000?`
- description: `A consultant CRO audit runs $1,500–$2,000 per store. What that price covers, the framework they use, and how to run the same checks free in about a minute.`
- Mantener las cifras que ya cita el post; no inventar precios nuevos.

**c) `shopify-store-analyzer`** (la home es dueña de "shopify store analyzer"; este post pasa a intención how-to sobre la tienda PROPIA, para no chocar con `reverse-engineer-winning-shopify-stores`, que cubre competidores)
- keyword: `how to analyze your shopify store`
- keywords: `["how to analyze your shopify store", "shopify store analysis", "analyze my shopify store", "shopify store analysis checklist"]`
- title: `How to Analyze Your Shopify Store (What to Check, in Order)`
- h1: `How do you analyze your own Shopify store — and what should you check first?`
- description: `A step-by-step way to analyze your Shopify store: what to check, in what order, how it differs from a speed test — and how to run the full check free.`

**d) `store-analyzer-vs-shopify-analytics`**
- keyword: `how to read shopify analytics`
- keywords: `["how to read shopify analytics", "shopify analytics explained", "shopify analytics reports", "shopify data analysis"]`
- title: `How to Read Shopify Analytics (and What the Numbers Won't Tell You)`
- h1: `Shopify tracks everything — so how do you actually read the numbers?`
- description: `How to read Shopify analytics: which reports matter, what conversion and drop-off numbers mean, and the one thing the data can't tell you about your store.`
- **Quitar** de keywords: `store analyzer`, `ecommerce store analyzer`, `why is my shopify store not converting`.
- **Añadir una sección** (~250–350 palabras) "The Shopify reports to read first", con los reportes reales de Shopify Analytics (sesiones, desglose de conversión / embudo, sesiones por landing page, conversión en el tiempo). **Verificar los nombres exactos contra la documentación oficial de Shopify (help.shopify.com); no inventar nombres de reportes.** El ángulo del post se mantiene: los datos dicen *qué* pasa, no *por qué* → ahí entra el análisis.

**e) `free-website-audit-tools`**
- En `keywords`, reemplazar `free store audit tool` por `website grader`. Nada más.

### WP-3 · Enlazado interno (consolidar la señal hacia la home)

En cada uno de los 5 posts tocados, añadir **un** enlace contextual dentro del texto (no reemplaza el CTA a sign-up):
- a), b), e) → `<a href="/">free Shopify store audit</a>`
- c) → `<a href="/">Shopify store analyzer</a>`
- d) → `<a href="/">free Shopify store audit</a>`
- Un solo enlace por post, en una frase natural, preferiblemente en la segunda mitad del texto.

### WP-4 · Home (limpieza menor, sin tocar title ni H1)

En `app/page.tsx` `metadata.keywords`, quitar los términos que ahora pertenecen a otras páginas: `free website audit`, `website analyzer`, `winning shopify stores`, `buyer persona simulator`, `meta ads forecast`. (Google ignora la meta keywords, pero así el código refleja el mapa y nadie vuelve a crear el conflicto.)

### WP-5 · Test de protección (evitar que vuelva a pasar)

Añadir un test en el runner que ya usa el repo:
1. Ningún par de posts en `allPosts` comparte el mismo `keyword`.
2. Ningún post incluye en su `keywords` el `keyword` principal de otro post.
3. Ningún post usa como `keyword` ni incluye en `keywords` estas keywords reservadas para la home: `store audit`, `free store audit`, `free shopify store audit`, `shopify store audit`, `shopify store analyzer`, `store analyzer`.

Con el estado actual de main, el test debe **fallar antes** del cambio y **pasar después**. Verificarlo así.

---

## 5. Verificación (subagente adversarial)

- `typecheck` + tests en verde, incluido el test nuevo.
- `curl` / dev server en `/`, `/free-website-audit` y los 5 posts: confirmar `<title>`, `<meta name="description">`, `<h1>` y `canonical` (que el canonical siga siendo auto-referente).
- `/sitemap.xml` sigue listando las mismas URLs, con `lastModified` actualizado en los posts tocados.
- grep sobre el diff final: "store audit" ya no aparece en title, h1, description ni keyword de ninguna página fuera de la home.
- Revisión visual rápida de `/free-website-audit` en EN y ES (el H1 nuevo no rompe el layout del hero).

## 6. Después del deploy (manual, dueño)

1. Search Console → Inspección de URL → **Solicitar indexación** de: `/free-website-audit` y los 5 posts.
2. Validar volúmenes en Semrush → Bulk Analysis (US): `free ecommerce website audit`, `review my shopify store`, `cro audit cost`, `how to analyze your shopify store`, `how to read shopify analytics`. Si alguna sale en 0, alternativas:
   - review → `shopify store feedback`
   - cost → `cro consultant cost`
   - analyze → `shopify store analysis`
3. En ~3–4 semanas, Search Console → Rendimiento → consulta "store audit" → pestaña Páginas: debería aparecer **solo la home**.

## 7. Fuera de alcance (siguiente paso, NO en este PR)

Keywords reservadas para los 3 blogs nuevos con el video definitivo (no usarlas en ningún otro sitio mientras tanto):
- `shopify product page checklist`
- `shopify trust badges`
- `above the fold ecommerce`

El video también irá embebido en los posts existentes `why-your-shopify-store-isnt-converting` e `is-your-store-ready-for-meta-ads`, sin crear posts nuevos para esos temas.

---

## 8. Addendum 2026-10-11 — resultados de Semrush y reemplazos

Volúmenes medidos por el dueño en Semrush (US, desktop):

| Keyword | Volumen US | Decisión |
|---|---|---|
| free ecommerce website audit | n/a (0) | **Reemplazada** → `free cro audit` (wording de solicitudes reales de Upwork: "CRO Audit") |
| review my shopify store | 20 (global 100) | Se mantiene |
| cro audit cost | n/a (0) | **Reemplazada** → `shopify cro audit` (Upwork: "Shopify CRO Audit", "Shopify CRO Audit Report") |
| how to read shopify analytics | 20 (global 70) | Se mantiene |
| how to analyze your shopify store | sin dato (0) | **Reemplazada** → `shopify store analysis` (30 US, global 220) |
| shopify store feedback | 20 | Secundaria de "review my shopify store" |

Upwork bloquea la lectura automática (403); las frases salen de los títulos de solicitudes públicas devueltas por búsqueda. Los volúmenes de `free cro audit` y `shopify cro audit` están **sin validar**: comprobar en Semrush en la próxima ronda.
