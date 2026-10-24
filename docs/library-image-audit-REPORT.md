# Library — diagnóstico de imágenes (WP-L0)

Generado: 2026-10-12T18:37:52.954Z · solo lectura (sin cambios en BD ni Storage) · `scripts/library/image-audit.mts`

## Resumen

| | Todas | Publicadas |
|---|---|---|
| Filas | 133 | 96 (100%) |
| thumbnail_url vacío | 0 | 0 (0%) |
| mshots | 46 | 28 (29%) |
| Externa | 0 | 0 (0%) |
| Propia (Storage) | 87 | 68 (71%) |
| Propia de otro proyecto | 0 | 0 (0%) |
| **Mostrarían la letra** | 46 | 28 (29%) |

### Imágenes propias (87)

- Objeto existe (HEAD 200): 87
- `render/image` responde 200: 87
- `render/image` falla aunque el objeto existe: 0
- Megapíxeles del original (mediana / máx): 1.1 / 7.2
- Dimensiones más comunes: 1200×900, 1200×750, 1440×900, 1000×750, 1200×628, 1200×844
- Formatos: jpeg: 87
- Peso del original (mediana / máx MB): 0.08 / 0.84

#### ¿Falla `render/image` según el tamaño del original? (hipótesis 1)

| Megapíxeles | Imágenes | render 200 | render ≠ 200 |
|---|---|---|---|
| 0–2 | 85 | 85 | 0 |
| 2–8 | 2 | 2 | 0 |
| 8–25 | 0 | 0 | 0 |
| 25–∞ | 0 | 0 | 0 |

### Por nicho (publicadas)

| Nicho | Publicadas | Con letra |
|---|---|---|
| accessories | 6 | 3 |
| apparel | 9 | 0 |
| baby | 8 | 0 |
| beauty | 6 | 3 |
| beverage | 5 | 0 |
| eyewear | 7 | 0 |
| fitness | 6 | 3 |
| footwear | 8 | 5 |
| grooming | 8 | 0 |
| home | 5 | 0 |
| pet | 7 | 0 |
| skincare | 8 | 4 |
| wellness | 13 | 10 |

### Bucket `screenshots/library`

- Objetos listados: 87 · referenciados por una fila: 87 · **huérfanos** (sin fila que los use): 0

## Detalle de tiendas que mostrarían la letra

| Estado | Nicho | Tienda | Dominio | Clase | Motivo | MP | Actualizada |
|---|---|---|---|---|---|---|---|
| published | accessories | BaubleBar | Fashion Jewelry & Accessories | baublebar.com | mshots | URL de mshots (descartada a propósito por thumbSrc) |  | 2026-10-10 |
| review | accessories | Fossil | Watches, Handbags, Wallets & Jewelry | fossil.com | mshots | URL de mshots (descartada a propósito por thumbSrc) |  | 2026-10-10 |
| published | accessories | Herschel Supply Co. | Backpacks, Bags & Accessories | herschel.com | mshots | URL de mshots (descartada a propósito por thumbSrc) |  | 2026-10-10 |
| review | accessories | Kendra Scott | Fine & Fashion Jewelry | kendrascott.com | mshots | URL de mshots (descartada a propósito por thumbSrc) |  | 2026-10-10 |
| review | accessories | Lulus | Women's Clothing, Dresses & Accessories | lulus.com | mshots | URL de mshots (descartada a propósito por thumbSrc) |  | 2026-10-10 |
| published | accessories | MVMT | Watches, Sunglasses & Accessories | mvmtwatches.com | mshots | URL de mshots (descartada a propósito por thumbSrc) |  | 2026-10-10 |
| published | beauty | Jones Road Beauty | Clean, High-Grade Cosmetics | jonesroadbeauty.com | mshots | URL de mshots (descartada a propósito por thumbSrc) |  | 2026-10-10 |
| published | beauty | MERIT Beauty | Minimalist Makeup | meritbeauty.com | mshots | URL de mshots (descartada a propósito por thumbSrc) |  | 2026-10-10 |
| published | beauty | Saie | Clean Beauty & Makeup | saiehello.com | mshots | URL de mshots (descartada a propósito por thumbSrc) |  | 2026-10-10 |
| review | fitness | Fabletics | Activewear & Workout Clothes | fabletics.com | mshots | URL de mshots (descartada a propósito por thumbSrc) |  | 2026-10-10 |
| published | fitness | Gymshark | Official Store | gymshark.com | mshots | URL de mshots (descartada a propósito por thumbSrc) |  | 2026-10-10 |
| review | fitness | Lululemon | Yoga & Workout Clothes | lululemon.com | mshots | URL de mshots (descartada a propósito por thumbSrc) |  | 2026-10-10 |
| published | fitness | Myprotein US | Sports Nutrition & Supplements | myprotein.com | mshots | URL de mshots (descartada a propósito por thumbSrc) |  | 2026-10-10 |
| published | fitness | Peloton | At-Home Fitness | onepeloton.com | mshots | URL de mshots (descartada a propósito por thumbSrc) |  | 2026-10-10 |
| review | fitness | WHOOP | Wearable Health & Fitness Tracker | whoop.com | mshots | URL de mshots (descartada a propósito por thumbSrc) |  | 2026-10-10 |
| published | footwear | Birdies | birdies.com | mshots | URL de mshots (descartada a propósito por thumbSrc) |  | 2026-10-10 |
| review | footwear | Birkenstock | birkenstock.com | mshots | URL de mshots (descartada a propósito por thumbSrc) |  | 2026-10-10 |
| review | footwear | Clarks | clarksusa.com | mshots | URL de mshots (descartada a propósito por thumbSrc) |  | 2026-10-10 |
| review | footwear | Crocs | crocs.com | mshots | URL de mshots (descartada a propósito por thumbSrc) |  | 2026-10-10 |
| review | footwear | Hoka | hoka.com | mshots | URL de mshots (descartada a propósito por thumbSrc) |  | 2026-10-10 |
| published | footwear | On Running | on-running.com | mshots | URL de mshots (descartada a propósito por thumbSrc) |  | 2026-10-10 |
| published | footwear | On Running | on.com | mshots | URL de mshots (descartada a propósito por thumbSrc) |  | 2026-10-10 |
| review | footwear | Running Warehouse | runningwarehouse.com | mshots | URL de mshots (descartada a propósito por thumbSrc) |  | 2026-10-10 |
| published | footwear | Thursday Boot Co. | thursdayboots.com | mshots | URL de mshots (descartada a propósito por thumbSrc) |  | 2026-10-10 |
| review | footwear | Vans | vans.com | mshots | URL de mshots (descartada a propósito por thumbSrc) |  | 2026-10-10 |
| published | footwear | Veja | veja-store.com | mshots | URL de mshots (descartada a propósito por thumbSrc) |  | 2026-10-10 |
| published | skincare | Dermatica | dermatica.com | mshots | URL de mshots (descartada a propósito por thumbSrc) |  | 2026-10-10 |
| published | skincare | Dieux Skin | dieuxskin.com | mshots | URL de mshots (descartada a propósito por thumbSrc) |  | 2026-10-10 |
| published | skincare | Skinfix | skinfix.com | mshots | URL de mshots (descartada a propósito por thumbSrc) |  | 2026-10-10 |
| published | skincare | The Ordinary | theordinary.com | mshots | URL de mshots (descartada a propósito por thumbSrc) |  | 2026-10-10 |
| review | skincare | Topicals | topicals.com | mshots | URL de mshots (descartada a propósito por thumbSrc) |  | 2026-10-10 |
| review | wellness | Athletic Greens (AG1) | athleticgreens.com | mshots | URL de mshots (descartada a propósito por thumbSrc) |  | 2026-10-10 |
| published | wellness | Bala | bala.com | mshots | URL de mshots (descartada a propósito por thumbSrc) |  | 2026-10-10 |
| review | wellness | Beam | b-classic.com | mshots | URL de mshots (descartada a propósito por thumbSrc) |  | 2026-10-10 |
| published | wellness | Boka | boka.com | mshots | URL de mshots (descartada a propósito por thumbSrc) |  | 2026-10-10 |
| published | wellness | Calm | calm.com | mshots | URL de mshots (descartada a propósito por thumbSrc) |  | 2026-10-10 |
| review | wellness | Care/of | careof.com | mshots | URL de mshots (descartada a propósito por thumbSrc) |  | 2026-10-10 |
| review | wellness | Golde | golde.com | mshots | URL de mshots (descartada a propósito por thumbSrc) |  | 2026-10-10 |
| published | wellness | HUM Nutrition | humnutrition.com | mshots | URL de mshots (descartada a propósito por thumbSrc) |  | 2026-10-10 |
| published | wellness | Live Tinted | livetinted.com | mshots | URL de mshots (descartada a propósito por thumbSrc) |  | 2026-10-10 |
| published | wellness | OSEA Malibu | oseamalibu.com | mshots | URL de mshots (descartada a propósito por thumbSrc) |  | 2026-10-10 |
| published | wellness | Purple | gopurple.com | mshots | URL de mshots (descartada a propósito por thumbSrc) |  | 2026-10-10 |
| published | wellness | Ritual | ritual.com | mshots | URL de mshots (descartada a propósito por thumbSrc) |  | 2026-10-10 |
| published | wellness | Sakara Life | sakara.com | mshots | URL de mshots (descartada a propósito por thumbSrc) |  | 2026-10-10 |
| published | wellness | Seed Health | seed.com | mshots | URL de mshots (descartada a propósito por thumbSrc) |  | 2026-10-10 |
| review | wellness | Therabody | theragun.com | mshots | URL de mshots (descartada a propósito por thumbSrc) |  | 2026-10-10 |

## Conclusiones (hipótesis del brief §L.2)

| # | Hipótesis | Veredicto | Evidencia |
|---|---|---|---|
| 1 | Originales gigantes rompen `render/image` | **Descartada** | Las 87 imágenes propias son JPEG de 0.08 MB (mediana) / 0.84 MB (máx), máx 7.2 MP; `render/image` responde 200 en las 87. |
| 2 | Un script re-procesó y pisó subidas del dueño | **Sin evidencia** | 0 objetos huérfanos en `screenshots/library` y 87/87 filas con objeto existente. Si hubo un borrado, no deja rastro hoy (no hay `thumbnail_source` ni historial). No se puede probar ni descartar con los datos actuales. |
| 3 | Tiendas nuevas entraron con URL de mshots | **CONFIRMADA — es la causa de todas las letras** | Las 46 filas con mshots (28 publicadas + 18 en `review`) se crearon **todas el 2026-10-10**, todas `added_by_ai`; las 87 filas anteriores (mayo–julio) tienen imagen propia. `scripts/expand-library.ts:77` y `discover.mts:208` insertan mshots a propósito; `thumbSrc` (`site-card.tsx:32`) y `toThumb` (`niche-pages.ts:40`) las descartan → letra. |
| 4 | Formato no soportado / cuota de transformaciones | **Descartada** | 87/87 JPEG, 0 fallos de render. |

**Qué falla de verdad:** no es un problema de imágenes rotas sino de **publicación sin imagen**: el gate de publicación dejó pasar a `published` 28 tiendas cuyo `thumbnail_url` es un placeholder de mshots (nicho más afectado: wellness 10/13, footwear 5/8, skincare 4/8, accessories/beauty/fitness 3/6). Es exactamente el hueco que cierra L.3 (#4: "una tienda sin imagen real verificada no se publica").

**Implicaciones para WP-L1:**
- El problema de "originales de 57 MP / `render/image` falla" **no existe hoy**; aun así normalizar al guardar (recorte hero + WebP) sigue siendo buena idea (menos peso), pero ya no es urgente para arreglar letras.
- Lo urgente: (a) obtener imagen real para las 46 filas (28 publicadas primero) con la cadena og:image → captura de viewport en cola aparte; (b) que el gate (`judgeStore`) rechace mshots/vacío; (c) dejar de insertar mshots en `expand-library.ts` / `discover.mts`.
- Las 18 filas en `review` con mshots no se ven en la Library pública, pero se publicarían sin imagen si pasan el gate hoy.
- Para "las imágenes del dueño son sagradas" (L.3 #3) hace falta `thumbnail_source`: hoy no se puede distinguir una imagen subida a mano de una automática (las 87 propias son JPEG de 1200×900/1200×750/1440×900…, consistentes con el pipeline automático).
- Otro hallazgo para L2: el gate también dejó publicados `calm.com` (app de meditación), `gopurple.com` (colchones) en wellness, y `athleticgreens.com` está en `review` (dominio equivocado señalado en el brief).
