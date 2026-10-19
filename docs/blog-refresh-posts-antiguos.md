# Brief — Refrescar los 19 posts antiguos con el formato de los posts nuevos

**Para:** agente "code" · **Autor:** Claude (Cowork) · **Fecha:** 2026-10-18
**Base:** `origin/main` · **Archivo principal:** `lib/blog/posts.ts`
**Flujo:** el de siempre (superpowers, worktree nuevo por lote, typecheck + test, subagente de verificación adversarial). **Un PR por lote** (§5), ninguno se mergea sin el OK del dueño.

**Referencia de calidad:** los 3 posts de `docs/blog-primera-venta-3-posts.md` ya publicados (`abandoned-cart-recovery`, `shopify-product-page`, `shopify-cro-audit`). Lo que funcionó ahí se aplica aquí.

---

## 0. Qué cambia y qué NO

**NO cambia (protege lo ya indexado):**
- **Slug / URL de ningún post.** Cero redirects.
- **`keyword` principal de ningún post.** Ya pasaron por el arreglo de canibalización y el test los vigila.
- **`date` original.** Solo se actualiza `updated`, y solo si el post cambió de verdad.
- **Contenido que hoy responde la keyword.** Se reescribe y se amplía, pero no se elimina la sección que contesta la búsqueda principal. Reescribir de golpe una página que ya rankea puede bajarla temporalmente, así que se mejora sobre lo que hay, no desde cero.
- CTAs a `/sign-up?next=/app/analyzer…` (PR #96) y nada de `app/liquid`.

**Sí cambia (el formato nuevo):**
1. **Lede con respuesta corta** (`<p class="lede">`, 2–3 frases) que contiene la keyword exacta en la primera frase.
2. **Video definitivo** (`finalVideo`) justo después del lede, más `video: FINAL_VIDEO_META` en el objeto del post (VideoObject JSON-LD). **Se elimina `teaserVideo` de todos los posts**: su título dice "…for Free" y choca con el reposicionamiento sin "free". Si después de esto `teaserVideo`, `TEASER_ID` y `TEASER_TITLE` quedan sin uso, se borran.
3. **CTA inline temprano** (antes del primer tercio) + CTA final. Texto: `Run the audit on your store →` (sin "free").
4. **Mínimo 2 diagramas SVG por post**, con el mismo estilo y las mismas reglas que los 3 posts nuevos (figure + svg `role="img"` + `<title>`/`<desc>`, teal `#2DD4BF`, cero dorado, legible a 360px, sin JS, < 8 KB). Los diagramas existentes que ya cumplen se conservan.
5. **Estructura propia de la intención** (columna "Esqueleto" en §3). Prohibido el esqueleto en serie "What does X actually do? / Who does what / When to hire" en más de un post.
6. **Longitud por tier** (§3). Más largo solo si aporta: cada sección añadida responde algo que el lector de esa keyword espera.
7. **FAQ: 5 por post**, de "People also ask" reales.
8. **Datos:** cada cifra con enlace a la fuente primaria, verificada abriéndola. Las cifras antiguas sin fuente o que no se pueden verificar se **quitan**. Nada inventado. Los ejemplos ilustrativos van rotulados.
   - **El 70.22% de Baymard** solo puede aparecer en `abandoned-cart-recovery` y `why-customers-abandon-cart-2026`. En los demás posts se sustituye por otro dato pertinente o se elimina.
9. **"free":** fuera de h1, CTAs y textos de botón. En `title` solo donde la keyword lo exige (`free website audit tools`, `new free shopify tools 2026`).
10. **Ángulo de marca (el del video):** ganarle a la competencia de tu nicho, "unbeatable". Va en el puente al video y en el cierre, sin forzarlo. EliteVault se menciona con "(ours — full disclosure)". Sin mencionar la app de Shopify (no está publicada).
11. **Autor:** `"Ariel Jiménez"` en todos.
12. **Enlazado por clústeres (§4):** cada post enlaza a su hub, a 2 posts hermanos del clúster y a `/` (anchor "Shopify store audit"), con anchors descriptivos y sin repetir el mismo anchor dos veces en un post.

## 1. Cambios globales (lote 0, antes que los posts)

- Reemplazar `teaserVideo` → `finalVideo` en los 5 posts que lo usan y añadir `video: FINAL_VIDEO_META` en los 19.
- Borrar el teaser si queda sin uso.
- Ampliar `scripts/tests/seo-cannibalization.test.ts` (o crear `scripts/tests/blog-format.test.ts`) con:
  - Todo post contiene `43CfVNIds7Q` en `bodyHtml` y tiene `video.id === "43CfVNIds7Q"`.
  - Ningún `bodyHtml` contiene `lH4O5UE4CPY` (el teaser).
  - Todo post tiene ≥2 `<svg`, ≥5 FAQ y `author`.
  - "70.22" solo aparece en los 2 slugs permitidos.
  - Ningún `h1` contiene "free".
  - Palabras de cuerpo ≥ mínimo del tier de cada slug (mapa en el test).
  - **Este test fallará hasta terminar el último lote.** Para no bloquear los PR intermedios, el mapa de tiers del test incluye solo los slugs ya refrescados, y cada lote añade los suyos.

## 2. Cómo trabajar cada post

1. Leer el post actual y anotar qué sección responde la keyword (se conserva y se mejora).
2. Revisar qué responde hoy Google para esa keyword (los 5 primeros resultados): qué secciones cubren que nosotros no. Esa es la lista de huecos a cubrir.
3. Reescribir con el esqueleto del §3, añadir los diagramas, el video, los CTAs y las FAQ.
4. Verificar cada cifra en su fuente.
5. `updated` = fecha del PR. `readingMinutes` = palabras / 230.

## 3. Plan por post

Tiers de longitud de cuerpo:
- **T1** (cerca de la compra, prioridad): 1.500–2.200 palabras.
- **T2** (apoyo): 1.200–1.800.
- **T3** (long-tail / definición): 900–1.300.

| Lote | Slug | Keyword (no cambia) | Tier | Esqueleto | Diagramas (2) |
|---|---|---|---|---|---|
| 1 | `why-your-shopify-store-isnt-converting` | why is my shopify store not converting | T1 | Diagnóstico: síntoma → causa probable → cómo comprobarlo → arreglo, para 8 causas | (a) árbol de decisión "traffic but no sales": ¿quién llega? → ¿qué ve? → ¿dónde se va? (b) mapa de las 8 causas por etapa del recorrido |
| 1 | `how-to-increase-shopify-conversion-rate` | how to increase shopify conversion rate | T1 | Plan por etapas (home → producto → carrito → checkout), con acciones ordenadas por impacto | (a) embudo con la palanca principal de cada etapa (b) matriz impacto/esfuerzo con las acciones del post |
| 1 | `is-your-store-ready-for-meta-ads` | is my store ready for meta ads | T1 | Checklist de 6 puntos con prueba aprobado/suspenso por punto + qué hacer si falla | (a) semáforo de readiness (6 puntos) (b) recorrido anuncio → landing → compra con los puntos donde se rompe |
| 1 | `why-meta-ads-arent-converting` | why meta ads not converting | T1 | Diagnóstico separado: ¿problema del anuncio o de la página? Métricas que lo delatan | (a) árbol CTR alto/bajo × conversión alta/baja → dónde está el problema (b) "message match" anuncio vs landing |
| 2 | `ecommerce-store-audit-vs-consultant` | cro audit cost | T1 | Precios por tipo (freelancer / agencia / herramienta): qué incluye cada uno y cuándo vale la pena. Enlaza a `shopify-cro-audit` para el checklist (no repetirlo) | (a) escalera de opciones por precio y profundidad (b) qué entrega cada opción (tabla visual) |
| 2 | `shopify-store-analyzer` | shopify store analysis | T1 | Paso a paso en orden (ya es el ángulo); ampliar cada paso con qué mirar y cómo medirlo | Revisar los 3 existentes; conservar 2 que cumplan (orden de los 5 pasos + speed test vs análisis completo) |
| 2 | `free-website-audit-tools` | free website audit tools | T1 | Comparativa por tipo (speed, SEO, CRO, accesibilidad): qué mide cada herramienta y límites honestos. Sin precios inventados | (a) mapa de tipos de auditoría vs qué responden (b) "qué herramienta según tu pregunta" (árbol) |
| 2 | `reverse-engineer-winning-shopify-stores` | how to find winning shopify stores | T1 | Proceso: encontrar → filtrar → desmontar (oferta, página, confianza, precio) → aplicar a tu tienda. Ángulo del video, muy alineado | (a) proceso en 4 pasos (b) plantilla de desmontaje de una tienda líder |
| 3 | `good-conversion-rate-for-shopify` | good conversion rate for shopify | T2 | Benchmarks con fuente por nicho/dispositivo/tráfico + cómo leer la tuya + qué hacer si estás debajo | (a) rango de benchmark con "dónde estás tú" (solo cifras con fuente) (b) por qué tu tasa varía: tráfico frío vs caliente |
| 3 | `why-customers-abandon-cart-2026` | why customers abandon cart | T2 | Motivos ordenados por dato (Baymard) → cómo detectar cada uno en tu tienda. Enlaza a `abandoned-cart-recovery` (la recuperación no se repite aquí) | Conservar el existente si cumple + (b) motivo → dónde nace (producto / carrito / checkout) |
| 3 | `best-shopify-tools-increase-roas-2026` | best shopify tools to increase roas | T2 | Lista por problema que resuelve (creativo, landing, medición, retención), con criterio de elección. Sin precios ni claims de apps sin fuente | (a) qué palanca del ROAS toca cada categoría (b) stack mínimo vs avanzado |
| 3 | `store-analyzer-vs-shopify-analytics` | how to read shopify analytics | T2 | Guía de reportes (nombres verificados en help.shopify.com) → qué significa cada número → qué no te dice | Conservar 2 de los 3 existentes que cumplan |
| 3 | `store-audit-review-my-store-feedback` | review my shopify store | T2 | Los 5 comentarios recurrentes → cómo comprobarlo tú → cómo pedir un review útil en Reddit (plantilla de post) | Conservar los 2 existentes si cumplen |
| 3 | `ecommerce-design-trends-2026` | ecommerce design trends 2026 | T2 | Tendencias filtradas por "¿convierte?", con evidencia o ejemplo por tendencia; marcar las que son moda sin dato | Conservar el existente + (b) tendencia vs impacto (útil / neutro / riesgo) |
| 4 | `ecommerce-cro-specialist` | ecommerce cro specialist | T3 | Qué hace → señales de que necesitas uno → qué pedirle → cómo evaluar su trabajo (sin la plantilla "who does what") | Conservar los 2 existentes si cumplen |
| 4 | `shopify-landing-page-specialist` | shopify landing page specialist | T3 | Plantilla de brief descargable en texto (secciones del brief) + cómo revisar la entrega | Conservar 2 de los 3 existentes |
| 4 | `ai-shopify-designer` | ai shopify designer | T3 | Flujo de trabajo IA + humano, paso a paso, con checklist de QA antes de publicar (miedo a romper la tienda) | Conservar los 2 existentes si cumplen |
| 4 | `ai-ecommerce-statistics-revenue-impact` | AI in ecommerce statistics | T3 | Estadísticas agrupadas por uso (personalización, búsqueda, soporte, CRO), **cada una re-verificada**; quitar las que no se puedan verificar | Revisar los 3 existentes; conservar 2 |
| 4 | `new-free-shopify-tools-2026` | new free shopify tools 2026 | T3 | **Actualizar a lo vigente** (Shopify Editions más recientes, verificadas en shopify.com/editions y help.shopify.com); quitar lo que ya no existe o cambió de nombre | (a) mapa de herramientas por problema que resuelven (b) nativo de Shopify vs app de terceros |

> Si al investigar un post resulta que la intención real de Google es distinta del esqueleto propuesto, manda la intención real. Anótalo en el PR.

## 4. Clústeres y hubs (enlazado interno)

| Clúster | Hub | Posts |
|---|---|---|
| Conversión | `shopify-cro-audit` | why-your-shopify-store-isnt-converting, how-to-increase-shopify-conversion-rate, good-conversion-rate-for-shopify, shopify-store-analyzer, store-analyzer-vs-shopify-analytics, store-audit-review-my-store-feedback |
| Producto y diseño | `shopify-product-page` | ecommerce-design-trends-2026, reverse-engineer-winning-shopify-stores, ai-shopify-designer, shopify-landing-page-specialist |
| Carrito | `abandoned-cart-recovery` | why-customers-abandon-cart-2026 |
| Anuncios | `is-your-store-ready-for-meta-ads` | why-meta-ads-arent-converting, best-shopify-tools-increase-roas-2026 |
| Herramientas y contratación | `free-website-audit-tools` | ecommerce-store-audit-vs-consultant, ecommerce-cro-specialist, new-free-shopify-tools-2026, ai-ecommerce-statistics-revenue-impact |

Cada post enlaza a su hub y a 2 hermanos. Cada hub enlaza a todos los posts de su clúster (en una sección "Related guides" o en contexto). **Los 3 posts nuevos se tocan solo para añadir esos enlaces de hub; su contenido no se modifica.**

## 5. Lotes / PRs

| PR | Contenido | Rama |
|---|---|---|
| 0 | Cambios globales del §1 (video, teaser fuera, test base) | `feat/blog-refresh-0-global` |
| 1 | Lote 1 (4 posts T1 de diagnóstico y ads) | `feat/blog-refresh-1` |
| 2 | Lote 2 (4 posts T1 de auditoría y herramientas) | `feat/blog-refresh-2` |
| 3 | Lote 3 (6 posts T2) | `feat/blog-refresh-3` |
| 4 | Lote 4 (5 posts T3) + enlaces de hub en los 3 posts nuevos | `feat/blog-refresh-4` |

Cada lote parte de `origin/main` **después** del merge del anterior (el dueño mergea entre lotes). Si el dueño pide ir más rápido, se pueden encadenar ramas, pero nunca mezclar dos lotes en un PR.

## 6. Verificación por lote (subagente adversarial)

- typecheck + `npm test` en verde (incluidos los tests de canibalización y de formato del lote).
- Por cada post del lote, en el dev server: `<title>`, description, `<h1>`, canonical auto-referente, JSON-LD BlogPosting + FAQPage + VideoObject.
- Tabla antes/después: slug | palabras antes → después | diagramas | FAQ | fuentes. Que ninguna sección que respondía la keyword haya desaparecido (comparar H2 antes/después).
- Revisión visual a 360px y 1280px de cada diagrama y del video (facade: solo miniatura hasta el clic).
- El subagente abre al menos 1 fuente por post y confirma la cifra citada.
- grep del lote: sin `lH4O5UE4CPY`, sin "free" en h1/CTAs, sin "70.22" fuera de los 2 slugs permitidos.

## 7. Después de cada merge (manual, dueño)

- Search Console → Inspección de URL → Solicitar indexación de los posts del lote (hay un límite diario de solicitudes: si se llena, seguir al día siguiente).
- En ~3–4 semanas, comparar clics e impresiones de cada post contra el periodo anterior.
