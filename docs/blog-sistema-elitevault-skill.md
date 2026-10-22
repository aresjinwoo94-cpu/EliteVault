# Brief — Sistema de redacción EliteVault: skill + reescritura de los posts con más tráfico + 3 posts nuevos

**Para:** agente "code" · **Autor:** Claude (Cowork) · **Fecha:** 2026-10-22
**Base:** `origin/main` · **Flujo:** superpowers, worktree nuevo por PR, typecheck + test, subagente de verificación adversarial, PR sin mergear hasta el OK del dueño.

**Estado previo:** del brief `docs/blog-refresh-posts-antiguos.md` se hicieron los lotes 0–2. **Los lotes 3 y 4 quedan CANCELADOS y sustituidos por este brief.** Si hay ramas de esos lotes a medio hacer, no se mergean (se reporta su estado en el primer PR). Los posts de esos lotes solo se tocan si este brief los selecciona en la Fase C.

---

## 0. Qué quiere el dueño (en sus palabras, resumido)

1. Una **skill** para redactar blogs de EliteVault con reglas fijas:
   - El contenido es **útil para el lector**.
   - **Involucra al máximo la herramienta**, mostrando resultados reales, siempre coordinado con el título y el tema de cada post.
2. Aplicar ese sistema a los **posts con más tráfico**.
3. Escribir **3 posts nuevos** con estas keywords exactas: `shopify store redesign`, `how to increase roas`, `how to boost ecommerce sales with generative AI`.
4. Usar **todo** lo que existe: resultados del Analyzer, el **Meta Campaign Simulator** (escenarios Conservative / Balanced / Aggressive, ROAS a 7 días, win condition, riesgos, tactical move, proyección día a día), la Library, el canal de YouTube, etc.
5. Que el contenido sea **único de EliteVault**, para posicionar mejor.
6. Que cada post trace **una ruta clara** para que el lector se anime a probar EliteVault.

**El dueño delega en Code:** la redacción, la estructura, la elección de contenido por post, qué posts cambiar y el diseño de la ruta hacia la prueba. Code decide con criterio, documenta sus decisiones en el PR y solo se detiene donde este brief lo indica.

---

## Fase A — Inventario de activos y ranking de tráfico (PR-A, junto con la skill)

### A1. Inventario de lo que EliteVault puede mostrar
Leer el código (Analyzer, reporte, fix tracks, top tiendas del nicho, Library, Meta Campaign Simulator, Meta Ads Optimizer, desbloqueo de $7, planes) y escribir `docs/blog-assets-inventory.md`. Para cada feature:
- qué muestra al usuario, con ejemplos de salida reales;
- **en qué plan está disponible**: anónimo / free / desbloqueo de $7 / Pro / Scale. **Verificado en el código, no supuesto;**
- a qué temas de blog se puede atar;
- cómo capturarlo visualmente (§B4).

### A2. Datos propios agregados (lo que nadie más puede publicar)
Consulta **de solo lectura** a Supabase sobre las auditorías completadas, para obtener estadísticas agregadas citables. Por ejemplo: % de tiendas sin info de envío visible en la página de producto, veredicto de ad-readiness más frecuente, problemas más repetidos por nicho, rango del ROAS simulado en el escenario conservador.

**Reglas:**
- Solo agregados con **n ≥ 30**. Publicar siempre "n = X audits, from [fecha] to [fecha]".
- Cero PII: sin URLs, emails ni nombres de tiendas de terceros.
- Guardar la consulta y el resultado en `docs/blog-data/` para que la cifra sea reproducible.
- Si un dato no alcanza n ≥ 30, no se publica como estadística (como mucho, como observación cualitativa rotulada).
- Las cifras del Simulator y del $ potencial son **estimaciones del modelo**: se presentan como "modeled / projected", nunca como resultados reales.

### A3. YouTube
Listar los videos del canal Elitevaultapp (título, ID, fecha, descripción). Por defecto se usa el video definitivo (`43CfVNIds7Q`, `finalVideo` + `FINAL_VIDEO_META`), pero si otro video del canal encaja mejor con el tema de un post, se puede usar.

**No atribuir a un video nada que no se haya verificado que dice.** Si hace falta la transcripción y no está accesible, pedírsela al dueño en el PR y escribir sin citarla.

### A4. Ranking de tráfico del blog
Determinar qué posts reciben más visitas, con la mejor fuente disponible y en este orden: PostHog (pageviews por ruta `/blog/*`, últimos 90 días) → Vercel Analytics → export de Search Console del dueño.
- Si ninguna es accesible desde la máquina, **detenerse solo en este punto** y pedir al dueño el CSV de Search Console (Rendimiento → Páginas → Exportar, últimos 3 meses). **No inventar el ranking.**
- Entregable: tabla en el PR con slug | visitas | clics/impresiones GSC (si hay) | intención (comercial / informativa) | feature de EliteVault que encaja.

---

## Fase B — La skill (PR-A)

Crear `.claude/skills/elitevault-blog-writer/` con:
- `SKILL.md`: cuándo usarla, flujo paso a paso y reglas no negociables.
- `references/assets.md`: enlace o resumen del inventario A1, con el mapa feature ↔ tema ↔ plan.
- `references/voice-and-rules.md`: las reglas de §B1–B5.
- `references/post-patterns.md`: patrones de estructura por intención (diagnóstico, checklist, proceso, comparativa, anatomía, cifras). No es una plantilla única.
- `references/qa-checklist.md`: la verificación que se pasa antes de cada PR de blog.

La skill debe servir para cualquier post futuro: **entrada** = keyword (+ notas opcionales del dueño); **salida** = objeto `BlogPost` en `lib/blog/posts.ts` + assets en `public/blog/<slug>/` + datos en `docs/blog-data/` + entrada en el test.

### B1. Utilidad primero (regla madre)
- **Prueba de valor:** el post tiene que servir y poder rankear aunque el lector nunca use EliteVault. Si al quitar las partes de producto el post queda vacío, no está bien escrito.
- Responde la keyword en la primera frase. Cubre lo que cubren los 5 primeros resultados de Google para esa búsqueda y añade lo que solo EliteVault tiene.

### B2. EliteVault como evidencia, no como anuncio
- Cada post lleva **al menos 1 bloque "EliteVault in action"** (ideal: 2) **atado al tema exacto del post**. Muestra una salida real de la feature que corresponde y explica qué significa y qué haría el lector con ella. Ejemplos de emparejamiento:
  - ROAS / Meta ads → Simulator (escenarios, win condition, riesgos, tactical move) + veredicto ad-readiness + Optimizer.
  - Rediseño / diseño / página de producto → screenshot anotado + fortalezas y debilidades de diseño + top tiendas del nicho / Library.
  - Conversión / "por qué no vendo" → veredicto + $ potencial (estimado) + fix tracks.
  - IA → buyer persona simulado + cómo la IA de EliteVault llega a su diagnóstico (sin revelar prompts ni secretos).
- **Proporción:** el contenido de producto no pasa de ~25–30% del cuerpo. El resto es enseñanza útil.
- **Historias honestas:** un resultado negativo vale más que uno inflado. Ejemplo: el Simulator proyectó pérdida en los 3 escenarios (0.60x–0.65x) y recomendó arreglar confianza y fotos antes de escalar. Eso enseña a no quemar presupuesto y muestra la herramienta haciendo su trabajo.
- Mencionar EliteVault con "(ours — full disclosure)" la primera vez.
- Sin testimonios, conteos de clientes ni resultados de ventas inventados.
- Cada vez que se mencione un feature, decir **en qué plan está** (dato de A1). Nunca prometer en un CTA algo que el plan de entrada no da.

### B3. La ruta hacia la prueba (embudo dentro del post)
Orden recomendado (Code puede adaptarlo por post y debe justificarlo):
1. **Problema** reconocible, en la primera pantalla.
2. **Autodiagnóstico** que el lector puede hacer solo: pasos, checklist o diagrama.
3. **Dónde se vuelve difícil a mano** (comparar contra el líder del nicho, modelar escenarios antes de gastar…).
4. **EliteVault in action** sobre una tienda real (§B4).
5. **CTA de baja fricción y específico al tema**. Ejemplo: "See your store's 7-day ROAS scenarios →", "Find what to redesign first on your store →". El destino es la ruta real que lleve a esa experiencia: verificar en el código qué deep links existen; por defecto, `/sign-up?next=/app/analyzer`.
6. **Siguiente paso honesto:** qué se desbloquea después (desbloqueo de $7 / Pro) y por qué le serviría a ese lector.

Además:
- **3 CTAs por post:** temprano (antes del primer tercio), después del bloque "in action" y al final.
- **Medición:** `utm_source=blog&utm_medium=inline&utm_campaign=<slug>&utm_content=<early|showcase|end>`, para que el dueño vea en PostHog qué post y qué posición generan auditorías.
- Sin "free" en h1, CTAs ni botones.
- Ángulo de marca: ganarle a la competencia de tu nicho, "unbeatable".

### B4. Visuales: resultados reales + diagramas
- **Capturas reales de EliteVault, permitidas y recomendadas:**
  - Generarlas con un script (Playwright/Puppeteer ya están en el stack) sobre **auditorías de tiendas del dueño o de tiendas públicas y anonimizadas**.
  - Ocultar o desenfocar URL, logo y nombre de cualquier tienda de terceros.
  - Formato: `public/blog/<slug>/*.webp`, ≤150 KB, con `width`/`height`, `loading="lazy"` y `alt` descriptivo.
  - Recortar al componente que se explica, no la pantalla entera.
  - Si el componente es datos (escenarios, ROAS), una **réplica HTML/SVG fiel** con los valores reales también vale. Rotular: "From an EliteVault audit (modeled projection)".
  - Commitear el script de captura en `scripts/blog/` para poder repetirlo.
- **Diagramas SVG:** mínimo 2 por post, con el estilo ya establecido (teal `#2DD4BF`, sin dorado, legibles a 360px, `role="img"` + `<title>`/`<desc>`, < 8 KB).

### B5. Reglas heredadas (siguen vigentes)
- Keyword exacta en slug, inicio del title, h1 y primera frase.
- Una keyword por URL; `scripts/tests/seo-cannibalization.test.ts` y el test de formato en verde.
- Lede con respuesta corta → video → CTA temprano.
- 5 FAQ reales. Autor `"Ariel Jiménez"`.
- Cada cifra externa con enlace a su fuente primaria, verificada. El 70.22% de Baymard solo en los 2 slugs de carrito.
- Longitud según intención: comercial 1.500–2.200 palabras, apoyo 1.200–1.800, long-tail 900–1.300. Sin relleno.
- Nada de esqueleto en serie: cada post sigue el patrón de su intención.
- No tocar los CTAs de `/sign-up` existentes fuera de los posts reescritos, ni nada de `app/liquid`.

---

## Fase C — Reescribir los posts con más tráfico (PR-C)

- Con el ranking de A4, elegir **los 5–6 posts con más tráfico** y aplicarles la skill completa. Si uno con mucho tráfico es puramente informativo y no tiene forma honesta de atarse a una feature, Code puede saltarlo y tomar el siguiente, explicándolo en el PR.
- **No cambia:** slug, keyword principal, `date`. Se actualiza `updated`.
- **No se elimina** la sección que hoy responde la keyword: se mejora encima. Una página que ya trae tráfico no se reescribe desde cero.
- Tabla en el PR: slug | visitas | qué feature se integró | palabras antes → después | visuales | CTAs.

## Fase D — 3 posts nuevos (PR-D)

| Keyword exacta | Slug | Feature principal que se muestra | Nota de intención |
|---|---|---|---|
| `shopify store redesign` | `shopify-store-redesign` | Screenshot anotado + fortalezas/debilidades de diseño + comparación con top tiendas del nicho / Library | Ángulo: "no rediseñes a ciegas". Qué cambiar primero, con evidencia; cuándo rediseñar vs cuándo ajustar; proceso sin romper la tienda (duplicar tema, etc.). |
| `how to increase roas` | `how-to-increase-roas` | **Meta Campaign Simulator** (escenarios, win condition, riesgos, tactical move, proyección 7 días) + veredicto ad-readiness + Optimizer | Ángulo: el ROAS se decide en la página antes que en el anuncio, y modelar antes de gastar. Usar la historia honesta de una simulación con pérdida proyectada. |
| `how to boost ecommerce sales with generative AI` | `how-to-boost-ecommerce-sales-with-generative-ai` | Buyer persona simulado + auditoría por IA (cómo diagnostica) | How-to práctico: usos de IA generativa que mueven ventas (copy, imágenes de producto, soporte, CRO), con fuentes. EliteVault como ejemplo de IA aplicada al diagnóstico. |

**Canibalización (resolver en el mismo PR):**
- `best-shopify-tools-increase-roas-2026`: quitar de sus `keywords` las variantes que se solapan con "how to increase roas" (p. ej. `how to improve roas shopify`, `increase meta ads roas shopify`). Su intención es "lista de herramientas"; el nuevo es "cómo hacerlo". Enlazarse entre sí.
- `ai-ecommerce-statistics-revenue-impact`: es de cifras; el nuevo de IA es de cómo hacerlo. Quitar de sus `keywords` cualquier variante de "how to … with AI". Enlazarse entre sí.
- `ecommerce-design-trends-2026`, `shopify-product-page`, `shopify-landing-page-specialist`: verificar que ninguno use "redesign" como keyword. Si alguno la tiene de secundaria, moverla al post nuevo.
- Añadir los 3 slugs nuevos a los hubs de §4 del brief anterior: redesign → hub Producto y diseño; ROAS → hub Anuncios; IA → hub Herramientas.

---

## PRs y orden

| PR | Contenido | Se detiene a esperar OK |
|---|---|---|
| A | Inventario (A1–A3) + ranking de tráfico (A4) + la skill completa (B) | Sí (el dueño revisa la skill y el ranking) |
| D | Los 3 posts nuevos escritos **con la skill** | Sí |
| C | Reescritura de los 5–6 posts con más tráfico **con la skill** | Sí |

D va antes que C: los posts nuevos son la prueba de que la skill funciona, y C la aplica a lo que ya trae tráfico.

## Verificación (subagente adversarial, en cada PR de contenido)
- typecheck + `npm test` en verde (canibalización + formato, con los slugs nuevos o reescritos en el mapa de tiers).
- Cada post pasa la `qa-checklist.md` de la skill, adjunta al PR con ✓/✗ por punto.
- **Prueba de valor:** el subagente lee el post sin los bloques de producto y confirma que sigue siendo útil.
- Cada mención de plan coincide con el gating real del código. Cada cifra propia tiene su consulta en `docs/blog-data/` con n ≥ 30. Cada cifra externa tiene su fuente abierta y confirmada.
- Las capturas no muestran datos identificables de terceros.
- Revisión visual a 360px y 1280px.
- JSON-LD BlogPosting + FAQPage + VideoObject.
- Los UTMs de los 3 CTAs son correctos.

## Después de cada merge (manual, dueño)
- Search Console → solicitar indexación de los posts nuevos o reescritos.
- En PostHog, filtrar por `utm_source=blog` para ver qué post y qué posición de CTA generan auditorías.
