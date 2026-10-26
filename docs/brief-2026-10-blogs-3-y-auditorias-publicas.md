# Brief — 3 posts nuevos con la skill + rediseño de las auditorías públicas (/s/)

**Para:** agente "code" · **Autor:** Claude (Cowork) · **Fecha:** 2026-10-25
**Base:** `origin/main` · **Flujo:** superpowers, worktree nuevo por PR, typecheck + test, subagente de verificación adversarial, PR sin mergear hasta el OK del dueño.

Este brief tiene dos partes independientes: la Parte 1 (blogs) y la Parte 2 (auditorías públicas). Pueden ir en paralelo en PRs separados.

---

# PARTE 1 — 3 posts nuevos con `elitevault-blog-writer`

Usar la skill **tal cual** (`.claude/skills/elitevault-blog-writer/`): workflow de 10 pasos, value test, evidencia de producto ≤30%, fuentes verificadas, `qa-check.mts` y subagente adversarial. Este brief solo añade las keywords, la intención y qué herramienta de EliteVault encaja en cada post. Code decide la estructura final con la skill y la justifica en el PR.

| Keyword exacta (del dueño) | Slug | Hub (clúster) | Herramienta EliteVault que aporta |
|---|---|---|---|
| `a/b testing` | `ab-testing` | Conversión → `shopify-cro-audit` | Analyzer: anotaciones y fixes como **fuente de hipótesis** ("qué testear primero"), $ potencial para priorizar, buyer persona como chequeo previo al test |
| `virtual assistant for shopify` | `virtual-assistant-for-shopify` | Herramientas y contratación → `free-website-audit-tools` | Analyzer como "brief" listo para entregar a un VA (lista de tareas priorizada); qué delegar a un VA vs qué automatizar |
| `meta media buyer` | `meta-media-buyer` | Anuncios → `is-your-store-ready-for-meta-ads` | **Meta Campaign Simulator** (escenarios, win condition, riesgos, tactical move) + veredicto de ad-readiness + Meta Ads Optimizer. Encaja con el posicionamiento del repo: "thinks like a senior media buyer" |

En el slug `ab-testing` la "/" no puede ir en la URL. La keyword exacta `a/b testing` va en `keyword`, al inicio del `title`, en el `h1` y en la primera frase.

## Notas de intención (para que el post sea útil de verdad)

**`a/b testing`**
- Es un término muy amplio: también lo buscan producto, email, SaaS… Para no competir de frente con guías genéricas gigantes, el post enfoca A/B testing **para tiendas ecommerce/Shopify**, sin sacar la keyword exacta del inicio del title.
- **Ángulo único y honesto:** la mayoría de las tiendas pequeñas **no tiene tráfico suficiente** para un A/B test con significancia estadística. Explicar con una fuente verificable cómo se calcula el tamaño de muestra, con un ejemplo ilustrativo rotulado. Luego, qué hacer con poco tráfico: priorizar por evidencia (auditoría, persona, comparación con el líder del nicho) y testear solo lo grande.
- **EliteVault NO ejecuta A/B tests.** Decirlo claro. Su papel es decidir qué testear y en qué orden.
- Verificar en help.shopify.com qué opciones de testing tiene Shopify hoy (nativas y apps). Sin precios inventados.

**`virtual assistant for shopify`**
- La intención dominante probablemente es **contratar un VA** (tareas, costo, dónde contratar, cómo entrenarlo), con algo de "asistente de IA" (p. ej. Shopify Sidekick). Revisar los 5 primeros resultados de Google y seguir la intención real.
- **EliteVault no es un VA.** El ángulo es: qué tareas sí delegar, cuáles requieren criterio, y cómo una auditoría convierte "mejora la tienda" en una lista concreta de tareas para el VA, ordenada por impacto.
- Datos de costos de VA solo con fuente verificable. Si no hay, rangos descritos cualitativamente.

**`meta media buyer`**
- Intención: qué hace un media buyer de Meta, cuánto cuesta, cuándo contratar uno y cómo evaluarlo.
- **Ángulo único:** antes de pagar a un media buyer, comprobar que la tienda puede convertir. Si no, el mejor buyer quema presupuesto.
- Mostrar el Simulator con la **salida real guardada** (`simulatorReplica()`), p. ej. el caso con pérdida proyectada en los 3 escenarios y su tactical move, rotulado "modeled projection".
- **Gating real:** el Simulator es Pro+Scale y el Optimizer solo Scale. Verificar en el código y decirlo en el post.
- El Optimizer no tiene salida real guardada: mostrarlo solo por sus entradas y salidas documentadas, sin fabricar un resultado (regla de la skill).

## Canibalización
- No hay hoy ningún post con estas keywords ni variantes (`a/b`, `split test`, `media buyer`, `virtual assistant`). Verificarlo de nuevo con grep antes de escribir.
- `shopify-product-page` tiene una FAQ sobre "how to A/B test on Shopify": enlazarla al post nuevo y no ampliar esa FAQ.
- `ecommerce-cro-specialist` y `shopify-landing-page-specialist` (contratación): enlazar entre sí con `virtual-assistant-for-shopify` y `meta-media-buyer`, sin compartir keywords.

## Entrega Parte 1
**PR-1** con los 3 posts, el reporte `qa-check` de cada uno, la tabla slug | keyword | palabras | herramienta mostrada | plan verificado | fuentes, y la lista de posts a indexar.

---

# PARTE 2 — Auditorías públicas (`/s/[slug]`) que animen a probar EliteVault

## Contexto
El dueño usa las auditorías públicas para **conectar con clientes**: le manda el enlace al dueño de una tienda. Hoy no atraen. Página revisada: `/s/vitallivingstore-com-4fovey` (`app/s/[slug]/page.tsx`, `lib/analyzer/share-v2.ts`).

## Diagnóstico (lo que hay hoy)

1. **Contradice decisiones recientes del dueño:**
   - Muestra **6 puntuaciones /100** y el radar (Color 65, Layout 55…). El dueño decidió quitar todo score visible y dejar el $ potencial como métrica visible.
   - La metadata de fallback dice "scored X/100" y el JSON-LD lleva "— X/100" en el headline.
   - El CTA "Audit your store free" aparece ×3, junto a "1 free analysis · no card". El dueño quitó "free" de la landing y del posicionamiento.
2. **Es estática y sin siguiente paso:** muestra el veredicto, el $ potencial y 4 anotaciones, y termina. Lo más persuasivo del producto (Simulator, comparación con el líder del nicho, buyer persona, fixes priorizados) no aparece ni como vista bloqueada.
3. **Fricción:** los 3 CTAs llevan a `/sign-up`, aunque el flujo anónimo de 1 auditoría ya existe en la landing.
4. **Un solo tono para dos lectores distintos:** "Your audit · <dominio>" le sirve al dueño de esa tienda (outreach), pero no a otro visitante que llega por Google o por un enlace compartido.
5. **Obsolescencia:**
   - Auditorías antiguas sin los campos v2 (`ad_readiness_verdict`, `fix_count`, `potential_why`…) se ven pobres.
   - No se ve con claridad la fecha de la auditoría.
   - La tienda pudo cambiar desde entonces.
6. **Indexación:** todas las `/s/` van al sitemap. Hay dos problemas:
   - Muchas páginas delgadas y parecidas dañan la calidad del sitio a ojos de Google.
   - Indexar una crítica pública de una tienda de terceros que no pidió la auditoría es delicado: si el dueño de la tienda la encuentra en Google antes que en el mensaje, el outreach empieza mal.

## Objetivo
Que la página `/s/` haga dos trabajos:
- **(a)** convencer al **dueño de esa tienda** de reclamar o ver el reporte completo;
- **(b)** convencer a **cualquier otro visitante** de correr EliteVault en su propia tienda.

Todo sin scores visibles, sin "free" y sin revelar lo que es de pago.

## Cambios (Code decide la implementación concreta y la justifica)

### 2.1 Alinear con el producto actual
- Quitar las puntuaciones /100, el radar y cualquier score de la UI, la metadata, el JSON-LD y la imagen OG (`opengraph-image.tsx`). El score se sigue usando internamente para la banda del $ potencial (como en `share-v2.ts`).
- Hero = el mismo del reporte v2: veredicto ad-readiness + $ potencial (estimado) + "N things are costing you sales".
- Copy sin "free" ni "no card". Mantener "Estimates, not guarantees".

### 2.2 Dos lectores, una página
- **Para el dueño de la tienda (outreach):**
  - Bloque "Is this your store?" → **reclamar la auditoría**: registrarse y que la auditoría quede ligada a su cuenta, para ver el reporte completo con la oferta de desbloqueo de $7 sobre **esa misma auditoría**.
  - **Verificar primero** cómo funcionan el entitlement del unlock y la propiedad de los análisis (`analyses.user_id`, settlement de WP-2 del unlock). Si reclamar requiere migración o cambia la lógica de pago, **diseñarlo en `docs/` y detenerse para el OK del dueño antes de implementar** (va en PR-3).
  - **Nota personal opcional del dueño** por auditoría compartida (campo de texto corto al compartir, solo editable por el owner/admin), mostrada arriba: "Prepared by Ariel for <domain>".
- **Para cualquier otro visitante:**
  - **Caja de URL embebida** ("Run the same audit on your store") que usa el **flujo anónimo existente** (1 intento, mismas reglas de cuota y anti-bot), sin pasar por sign-up.
  - Gancho comparativo: "How does your store compare to <domain>?".
- Code decide si el modo se detecta por parámetro (p. ej. `?for=owner` en el enlace que manda el dueño) o se muestran ambos bloques en orden. Debe justificarlo.

### 2.3 Vistas bloqueadas de lo premium (sin filtrar lo de pago)
- Mostrar **qué más existe**, con nombres y conteos pero **sin contenido de pago**. `share-v2` excluye a propósito los títulos de top_fixes y el persona, y eso se mantiene. Ejemplos:
  - "3 fixes ranked by impact — locked";
  - "How a buyer persona reacts to this store — locked";
  - "7-day Meta ROAS scenarios — Pro";
  - "Compared with the top stores in this niche".
- Si se usa una muestra visual (p. ej. una tarjeta del Simulator), debe ser **una muestra genérica rotulada "Example"**, nunca datos inventados presentados como de esa tienda.
- Cada bloque bloqueado lleva su CTA específico, con el plan correcto verificado en el código.

### 2.4 Frescura
- Mostrar "Audited on <fecha>" visible.
- Auditorías antiguas (sin campos v2, o con más de N días; Code propone N): banner "This store may have changed since" + CTA "Run a fresh audit".
- **Acción manual de re-auditar** una `/s/` desde el panel del owner/admin (`owner-monitor`), que reemplace los datos del share o cree uno nuevo, a decidir por Code.
- **Nada de re-auditoría masiva automática:** el Analyzer corre en la API gratis de Gemini y Vercel Hobby.

### 2.5 Política de indexación
- **Por defecto, `noindex`** (enlace no listado, fuera del sitemap) para las auditorías de tiendas que no pidieron la auditoría (outreach) y para las pre-v2 o con `capture_blocked`.
- **Indexables** solo las que tienen contenido v2 completo y fueron del propio dueño de la tienda (auditó la suya y la publicó) o que el dueño de la tienda reclamó.
- Los enlaces no listados siguen funcionando para el outreach: quien tiene el link la ve.
- Ajustar `app/sitemap.ts` y `robots` en `generateMetadata` en consecuencia. Documentar la regla en el código.

### 2.6 Kit de outreach (ayuda al dueño a conectar)
- En el panel del owner (o al compartir): botón **"Copy outreach message"** que genera un mensaje corto y honesto con el dominio, el veredicto en palabras, 1 hallazgo concreto **ya visible en la página pública** (nada de pago) y el enlace con UTM. Sin envío automático: solo copiar.
- La imagen OG nueva (sin score) debe verse bien al pegar el enlace en Reddit, email, IG o WhatsApp.

### 2.7 Medición
- Eventos PostHog en `/s/`: `share_view` (con modo owner/visitor), `share_cta_click` (con posición), `share_urlbox_submit`, `share_claim_start`, `share_claim_done`.
- UTMs en el enlace del kit de outreach: `utm_source=share&utm_medium=outreach&utm_campaign=<share_slug>`.

## Entrega Parte 2
- **PR-2:** 2.1, 2.2 (solo la parte del visitante + la nota personal), 2.3, 2.4 (banner + fecha), 2.5, 2.6 y 2.7.
- **PR-3:** el flujo de **reclamar** (2.2, dueño de la tienda) + el unlock sobre la auditoría reclamada + la re-auditoría manual (2.4). **Primero, un doc de diseño en `docs/` y detenerse para el OK del dueño**, porque toca propiedad de análisis y pagos.

## Verificación (Parte 2, subagente adversarial)
- typecheck + tests en verde. Tests nuevos:
  - la página `/s/` no renderiza ningún "/100" ni el radar;
  - no aparece "free" en los CTAs;
  - las auditorías pre-v2 y las de outreach salen con `noindex` y fuera del sitemap;
  - los bloques bloqueados no contienen texto de top_fixes ni del persona.
- Revisión visual a 360px y 1280px de una `/s/` v2, una pre-v2 y una con `capture_blocked`.
- La caja de URL respeta la cuota anónima y el anti-bot existentes (probar los casos de cuota agotada y de tienda bloqueada).
- La imagen OG se renderiza sin score.
- Los eventos de PostHog se disparan (verificar en local).
