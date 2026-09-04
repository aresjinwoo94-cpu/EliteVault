# Plan — pivote a app nativa de Shopify

Rama: `feat/shopify-app-pivot`, creada desde `perf/blocks-preview-latency` (no desde `main`).
Eso es deliberado: **todo el motor de Liquid Blocks vive en esa rama y nunca se mergeó a
`main`**. En `main` no existe `lib/blocks/`. Si el pivote se hubiera ramificado de `main`, no
habría nada que portar.

---

## 1. Confirmo la separación reuso / reemplazo

**Se reusa** (existe, probado, 513 tests verdes en `1ea9c8b`):

- El motor de render: `lib/blocks/browser.ts` + `browser-pool.ts` (Chromium templado),
  `collect-tokens.ts` (lectura in-page), `design-tokens.ts` (calibración), `capture-bounds.ts`,
  `request-filter.ts`, y el pipeline `inngest/functions/blocks-preview.ts`.
- El catálogo y los diseños: `catalog.ts`, `variants.ts`, `render-block.ts`,
  `design-references.md` — los 8 tipos con sus variantes y su CSS scopeado a `.ev-blk`.
- Las lecciones caras que ya están pagadas y que se pierden si se reescribe: fuente
  efectivamente aplicada (no la pila declarada), espera de webfonts, barrido de carga diferida
  con tope, captura de página completa acotada, y los guards de contención de CSS.

**Se reemplaza:** exportar-Liquid-para-pegar, el pago one-time de Stripe
(`STRIPE_PRICE_LIQUID_EXPORT`), la página `/app/liquid`, y el input por URL — la tienda ahora
llega por OAuth.

---

## 2. [DECISIÓN A CONFIRMAR] Layout de repo

**Mi recomendación: proyecto separado, motor consumido como SERVICIO HTTP.**

- `C:\Dev\MK3v2\elitevault-shopify\` → repo nuevo, scaffold literal del template oficial.
- El motor **se queda donde está** (repo Next.js) y se promueve de "interno de `/app/liquid`" a
  **API autenticada**. La app de Shopify lo llama por HTTP.

Por qué, y por qué descarté el monorepo:

- El motor necesita Chromium. Ya tiene su worker Inngest, su pool de navegador templado, su
  control de coste y sus 513 tests **en este repo**. Moverlo a un paquete compartido significa
  duplicar esa infraestructura de test o publicar a un registro privado; consumirlo por HTTP no
  cuesta ninguna de las dos cosas. El brief ya lo llama "servicio/API compartido" — lo tomo
  literal.
- Un monorepo obligaría a meter workspaces en el `package.json` raíz de un sitio que está **en
  producción**, con 252 errores de typecheck de base y `ignoreBuildErrors`. El riesgo de
  desestabilizar el `npm install` del sitio que hoy factura no lo compensa la comodidad.
- Respeta el [NO NEGOCIABLE]: la app se scaffoldea del template, no se injerta en Next.js.

**Corrígeme aquí si prefieres monorepo** — es el único punto en el que un cambio tuyo me
obligaría a rehacer trabajo, y por eso va marcado. Todo lo demás lo puedo ajustar sobre la marcha.

---

## 3. Qué se porta y cómo

| Pieza | Destino | Forma |
|---|---|---|
| Motor puppeteer (medición → inyección → captura) | se queda en Next.js | API `POST /api/blocks/preview`, autenticada por token de servicio, dominio de tienda en vez de URL pegada |
| Catálogo + variantes + `design-references.md` | **ambos** repos | fuente única de datos, ver §4 |
| `render-block.ts` (HTML+CSS del bloque) | se queda (preview) | sigue siendo el renderizador del preview |
| Liquid del app block | **nuevo**, en la extensión | segundo renderizador desde el mismo modelo |
| `liquid-validate.ts`, `install-instructions.ts`, `export-pricing.ts`, `settle-export.ts` | se retiran | son del modelo "pega este Liquid" |

---

## 4. El riesgo que el brief no nombra, y que decide si el producto funciona

El diferenciador es **el preview fiel**. Pero tras el pivote hay **dos renderizadores** del
mismo bloque:

1. el del **preview** (HTML+CSS inyectado por puppeteer, hoy `render-block.ts`),
2. el del **app block** (Liquid + CSS dentro del tema).

Si divergen, **el preview miente** — y mentir sobre cómo va a quedar es exactamente lo que este
producto vende no hacer. Es el mismo fallo que ya cazamos dos veces en Liquid Blocks (preview
contra export en `bundle_tiers`: 603 de 756 combinaciones cotizaban dinero distinto).

Mi propuesta: el bloque es **datos** (tipo + variante + settings + tokens), y los dos
renderizadores se generan de ahí, con un test que renderiza el mismo spec por ambos caminos y
compara la estructura resultante. Ese test es la garantía del diferenciador, no un extra.

Por eso **reordeno el plan**: ver §6.

---

## 5. Correcciones al brief (dime si alguna te parece mal)

1. **Polaris React ya no aplica.** El template actual (`pushed 2026-09-03`) **no** depende de
   `@shopify/polaris`. Trae `@shopify/app-bridge-react@4` y la UI son **componentes web de
   Polaris** (`<s-app-nav>`, `<s-link>`, `<s-page>`…). El brief dice "Polaris + App Bridge";
   en la práctica es App Bridge con los `s-*`. Sigo el template, no la suposición.
2. **Ruta del brief.** El brief está en `docs/BRIEF-elitevault-shopify-app.md`, no en
   `docs/brief-shopify-app.md`. Sin consecuencias, pero lo anoto.
3. **El motor necesita una historia de auth que hoy no tiene.** Está gateado por el flag
   `LIQUID_BLOCKS` y por sesión de Supabase. La app de Shopify es otro llamante: hace falta
   auth máquina-a-máquina y cuota por tienda, o queda un endpoint que lanza Chromium abierto a
   quien lo encuentre.
4. **Presupuesto de la extensión.** 30 blocks y 100 KB de Liquid comprimido para 8 tipos × 2–3
   variantes es probable que entre, pero **hay que medirlo en WP-4**, no asumirlo. Si no entra,
   la salida es un app block con `schema` de variante en vez de un block por variante.
5. **WP-1 no se puede cerrar entero sin ti.** Ver §7.

---

## 6. Orden de WP (ajustado)

Mantengo la numeración del brief; cambio **qué entra en WP-2**.

- **WP-1 · Scaffold + auth.** Template oficial, OAuth por session token, `s-app-nav` con las 4
  secciones vacías (Inicio, Bloques, Ajustes, Facturación).
- **WP-2 · Rebanada vertical de UN bloque, por los DOS renderizadores.** No sólo portar el motor:
  un bloque (`trust_icons`, el más simple) desde el modelo de datos hasta (a) preview fiel por
  el motor y (b) app block Liquid en la extensión, con el test de equivalencia de §4.
  *Por qué:* el brief pone la extensión en WP-4, después de la galería. Si construyo el preview
  primero y luego descubro que el Liquid no puede reproducirlo, el preview miente y hay que
  rehacer la galería. La extensión es la restricción; que hable primero.
- **WP-3 · Los 8 bloques + galería + preview.** Ya con el contrato de §4 fijado.
- **WP-4 · Extensión completa + deep link.** Los 8 tipos, presupuestos medidos, deep link cuya
  posición coincide con la del preview.
- **WP-5 · Fixes recomendados (máx 3, atados a galería).** El brief los mete en WP-3; los separo
  porque la regla dura ("si la galería no lo resuelve, no se recomienda") es lógica propia y
  merece sus propios tests.
- **WP-6 · Barra IA.** Acotada a settings/variantes del bloque activo, reversible.
- **WP-7 · Inicio + Ajustes.**
- **WP-8 · Facturación Shopify.**
- **WP-9 · Endurecimiento Built for Shopify.**

---

## 7. Lo que NO puedo hacer yo, y hace falta de ti

WP-1 dice *"la app instala en una dev store"*. Eso necesita:

- una cuenta de **Shopify Partners**,
- una app creada en el dashboard (client ID + secret),
- una **dev store**,
- `shopify app dev`, que abre un login interactivo en el navegador y levanta un túnel.

Nada de eso puedo hacerlo desde aquí: la sesión no es interactiva y no tengo tus credenciales.

**Lo que sí entrego en WP-1:** el scaffold del template oficial, la nav con las 4 secciones,
typecheck y build verdes, y un `README` con los comandos exactos para que lo conectes tú. Marco
WP-1 como *"verificado hasta donde llega sin credenciales"* — no como cerrado — y digo
explícitamente qué falta. No voy a decirte que instala en una dev store sin haberlo visto
instalar.

---

## 8. Nota honesta para el PR (pedida en el brief §0)

Volverse app de Shopify implica OAuth, listing en el App Store, cumplir "Built for Shopify",
billing vía Shopify con su comisión, y una revisión de semanas que puede rechazar. Los
prerequisitos de elegibilidad de Built for Shopify (≥50 instalaciones de tiendas de pago activas,
≥5 reviews) no se cumplen construyendo: se cumplen vendiendo. El motor y los diseños se
reaprovechan; lo nuevo es la capa de entrega, auth y UI — y es un lift grande, asumido a propósito.
