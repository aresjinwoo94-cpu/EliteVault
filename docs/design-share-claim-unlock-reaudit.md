# Diseño PR-3 — reclamar una auditoría pública, unlock de $7 sobre ella y re-auditoría manual

**Estado:** propuesta, **sin implementar**. Espera el OK del dueño (toca propiedad de `analyses` y pagos).
**Brief:** `docs/brief-2026-10-blogs-3-y-auditorias-publicas.md` §2.2 (dueño de la tienda), §2.4 (re-auditoría manual), §2.7 (eventos `share_claim_*`).
**Base:** PR-2 (`feat/share-page-redesign`). Este documento no cambia código.

## 0. Resumen y decisiones que necesito de ti

Recomendación en una frase: **reclamar = traspasar la propiedad de la fila de `analyses` al usuario que reclama, con un enlace de un solo uso que el dueño genera al copiar el mensaje de outreach**. Con eso el unlock de $7, el informe, el polling y todo lo que filtra por `analyses.user_id` funcionan **sin tocar ni una línea de pagos**.

| # | Decisión | Mi recomendación | Alternativas |
|---|---|---|---|
| D1 | Modelo de reclamar | **A. Traspaso de propiedad** (`analyses.user_id` pasa al reclamante) | B. Copia de la fila · C. Concesión de lectura sin traspaso |
| D2 | Quién puede reclamar | Solo quien tenga el **enlace con token** que genera el dueño; token de un solo uso | Cualquiera con el enlace `/s/` (más fácil, sin prueba de posesión) |
| D3 | ¿Se indexa tras reclamar? | **No automático.** Solo si el email del reclamante coincide con el dominio de la tienda; si no, lo decides tú en el panel | Indexar siempre al reclamar · No indexar nunca |
| D4 | Re-auditoría manual | Botón por fila en el panel del dueño, solo para auditorías **no reclamadas**, máx. 1 al día por auditoría, sin batch ni cron | Permitir también las reclamadas |
| D5 | Umbral "antigua" | 45 días (ya está en PR-2) | 30 / 60 |
| D6 | Migración | `0046` (tabla de tokens + log de reclamaciones + RPC). Se aplica a prod **antes** del merge (como 0025/0028), tras tu OK | — |

Si respondes "OK a la recomendación", implemento PR-3 tal como está aquí.

## 1. Cómo funciona hoy (verificado en código)

- **Propiedad.** `analyses.user_id` (FK a `profiles`). Las auditorías anónimas tienen `user_id null` + `anon_id` (migración 0023). `lib/anon/claim.ts` ya **re-parenta** auditorías sin dueño al registrarse: `update analyses set user_id = <nuevo> where anon_id = <token> and user_id is null`, con el cliente de servicio. Hay precedente de traspaso con service role.
- **Auditorías de outreach.** Las crea el dueño desde su propia cuenta (`user_id` = dueño; la cuenta de equipo se excluye de las estadísticas por `BLOG_EXCLUDE_EMAILS`). Se publican con `shareAnalysis()` (`analyses.share_slug`, `shared_at`), que solo actúa sobre filas propias.
- **Protección de columnas.** La migración 0039 deja a `anon`/`authenticated` modificar en `analyses` solo `share_slug` y `shared_at`. Cualquier columna nueva queda de solo-servidor sin más trabajo. Las funciones `security definer` y el service role no pasan por ese trigger.
- **Unlock de $7.** Tabla `analysis_unlocks` (migración 0043): `analysis_id` PK, `user_id` = comprador, `stripe_session_id` único, `status paid|refunded`; RLS: el comprador lee los suyos, solo el servicio escribe. `lib/unlocks/guard.ts` (`checkUnlockEligibility`) exige que la auditoría sea **del usuario** (`.eq("user_id", userId)`), esté `succeeded` y no tenga captura bloqueada. `lib/unlocks/entitlement.ts` → `resolveFullReport` combina plan + unlock. `lib/unlocks/settle.ts` comprueba, al liquidar, que la auditoría pertenece al pagador (si no, reembolso automático). `REPORT_UNLOCK` está activo por defecto en código.
- **Quién lee qué.** 35 sitios leen `from("analyses")`; casi todos filtran por `user_id` del visitante autenticado (informe, polling `/api/analyses/[id]`, Fix Tracks, Growth Map, simulador, API v1, checkout del unlock).

Consecuencia: cualquier diseño que **no** cambie `user_id` obliga a tocar esos ~35 sitios y la liquidación de pagos. Es el riesgo principal y por eso recomiendo A.

## 2. Opciones para "reclamar"

### A. Traspaso de propiedad (recomendada)
La fila pasa a ser del reclamante. Todo lo demás (informe completo con el unlock, Fix Tracks, simulador, polling) funciona igual que para cualquier auditoría suya.
- **Pros:** cambio mínimo y localizado; el unlock de $7 se compra **sobre esa misma auditoría** sin tocar pagos; mismo patrón que `claimAnonAnalyses`.
- **Contras:** la auditoría sale del panel del dueño. Mitigación: tabla de log `analysis_claims` (quién y cuándo) y la lista del panel sigue mostrándola como "reclamada por <email>", porque el panel lee con el servicio. El enlace público `/s/<slug>` **sigue funcionando** (el slug viaja con la fila).
- **No se devuelven créditos** ni se cobra al reclamante: la auditoría ya se pagó (créditos del dueño); el reclamante no gasta su auditoría gratuita ni su cuota.

### B. Copia de la fila al reclamar
Nueva fila para el reclamante con el mismo `result`/captura.
- **Pros:** no destructiva; el dueño conserva su registro.
- **Contras:** dos filas de la misma auditoría que se desfasan; hay que copiar o regenerar la captura; el enlace público apunta al original, no a lo que ve el reclamante; "el unlock sobre esa misma auditoría" deja de ser literal; cualquier cuenta podría fabricarse auditorías gratis de tiendas ajenas.

### C. Concesión de lectura sin traspaso
Tabla `analysis_claims(analysis_id, user_id)` + política RLS que deja leer.
- **Contras (decisivos):** hay que modificar los ~35 puntos que filtran por `user_id`, el checkout del unlock y `settle.ts`. Máximo riesgo sobre pagos y fugas de datos. Descartada.

## 3. Verificación de que quien reclama es el dueño de la tienda

No hay forma de **probar** la propiedad de un dominio ajeno sin un flujo de verificación (DNS/meta tag), que no se justifica aquí. Propongo dos capas baratas:

1. **Posesión del enlace (D2).** El dueño, al pulsar "Copy outreach message", genera un token aleatorio de 32 bytes para esa auditoría. El mensaje enlaza a `/s/<slug>?c=<token>&utm_source=share&utm_medium=outreach&utm_campaign=<slug>`. Solo con un token válido y no usado la página muestra el bloque **"Is this your store?"**. Sin token, la página es la de PR-2 (visitante), sin bloque de reclamar.
2. **Señal de dominio (D3, opcional).** Si el email (verificado) del reclamante pertenece al dominio de la tienda, queda marcado `claim_verified = true`. Solo entonces propongo que la auditoría pueda pasar a indexable, y aun así **tú** confirmas con el interruptor del panel (PR-2).

Riesgo residual (se documenta, no se elimina): quien reciba un enlace reenviado puede reclamar una auditoría de una tienda que no es suya. Impacto: ve el informe de una tienda **pública** (lo que ya enseña el enlace) y puede comprar el unlock; no obtiene nada que no pudiera obtener auditando esa URL. El traspaso queda registrado y es reversible por ti (ver §6).

## 4. Modelo de datos (migración 0046, propuesta)

```sql
-- Tokens de un solo uso para reclamar (solo servicio; sin políticas RLS = nadie más lee ni escribe)
create table public.analysis_claim_tokens (
  analysis_id uuid primary key references public.analyses(id) on delete cascade,
  token_hash  text not null,                 -- sha256 del token; el token en claro solo existe en el mensaje
  created_at  timestamptz not null default now(),
  claimed_at  timestamptz,
  claimed_by  uuid references public.profiles(id)
);
alter table public.analysis_claim_tokens enable row level security;
revoke all on public.analysis_claim_tokens from anon, authenticated;

-- Registro de traspasos (auditable y reversible)
create table public.analysis_claims (
  id            bigint generated always as identity primary key,
  analysis_id   uuid not null references public.analyses(id) on delete cascade,
  from_user_id  uuid references public.profiles(id),
  to_user_id    uuid not null references public.profiles(id),
  email_domain_match boolean not null default false,
  claimed_at    timestamptz not null default now()
);
alter table public.analysis_claims enable row level security;
revoke all on public.analysis_claims from anon, authenticated;

-- RPC atómica (security definer, ejecutable solo por el servicio):
-- claim_shared_audit(p_slug text, p_token_hash text, p_user uuid, p_email_domain_match boolean)
--   1. fila de analyses con ese share_slug, status succeeded, result no nulo, user_id = el del dueño original
--   2. el token existe, coincide, no está usado       (si no: error 'invalid_or_used')
--   3. update analyses set user_id = p_user           (traspaso)
--      update analysis_claim_tokens set claimed_at, claimed_by
--      insert into analysis_claims (...)
--   devuelve el id de la auditoría
```

Notas:
- Se hace con RPC para que el traspaso y el consumo del token sean **una sola transacción** (sin carreras entre dos reclamantes).
- Cada reclamante: **máx. 3 reclamaciones al día** (cuenta en `analysis_claims`), para que una cuenta no se lleve todas las auditorías públicas.
- `share_slug`, `share_note` y `share_indexable` se mantienen. Al traspasar, `share_indexable` se pone en `false` si no hay coincidencia de dominio.

## 5. Flujo del reclamante

1. Abre el enlace del outreach con `?c=<token>`. La página valida el token en servidor (hash) y muestra **"Is this your store? Claim this audit"** encima del resto, con la nota personal. Evento `share_view` con `mode: "owner"`.
2. Clic en "Claim" → `share_claim_start`. Si no hay sesión: `/sign-up?next=/s/<slug>/claim?c=<token>` (el registro ya conserva `next`).
3. `GET /s/[slug]/claim` (ruta de servidor, requiere sesión): llama a la RPC, calcula `email_domain_match`, redirige a `/app/analyzer/<id>`; `share_claim_done`. Si el token es inválido o ya se usó: página clara "This link was already used" con la caja de auditar la propia tienda.
4. En `/app/analyzer/<id>` el reclamante es el dueño de la fila: ve el informe de plan Free (problemas, captura anotada, fix #1) y la **oferta de $7 de esa misma auditoría** (el flujo actual de `checkUnlockEligibility` → Checkout → `settle`), o Pro. Nada nuevo en pagos.

## 6. Entitlement del unlock sobre la auditoría reclamada

- Tras el traspaso `analyses.user_id = reclamante`, por lo que `checkUnlockEligibility` devuelve `ok`, el checkout asocia `supabase_user_id = reclamante` y `settle.ts` verifica propiedad correctamente. **No hay cambios en `lib/unlocks/*`, en el webhook ni en Stripe.**
- Casos límite a cubrir con tests:
  - ya existe un `analysis_unlocks` de la fila (no puede, el dueño original no la compra; se comprueba y, si existiera, se mueve su `user_id` en la misma RPC);
  - reembolso (`charge.refunded`) → vuelve a bloquearse, sin relación con el traspaso;
  - el reclamante ya tiene plan de pago → `has_full_report`, no se ofrece unlock;
  - dos reclamantes a la vez → solo uno gana (token de un solo uso, transacción);
  - `REPORT_UNLOCK` apagado → la oferta no aparece, el traspaso sigue funcionando.
- **Revertir** (por si alguien reclama por error): acción solo del dueño en el panel que ejecuta la RPC inversa usando el registro `analysis_claims` (solo si no hay `analysis_unlocks` pagado de esa fila; si lo hay, no se puede revertir).

## 7. Re-auditoría manual (§2.4)

- **Dónde:** botón "Re-audit" por fila en el panel del dueño (`components/admin/owner-shared-audits.tsx`), con confirmación, deshabilitado para las **reclamadas** (D4: esa auditoría ya es del reclamante; él puede re-auditar con sus créditos) y para las que se re-auditaron hace menos de 24 h.
- **Qué hace:** reutiliza el pipeline normal (`createAnalysis`, misma Inngest, mismos límites) con el mismo `url`, desde la cuenta del dueño (consume su cuota, **no** la de nadie más). Al terminar con éxito, una RPC `repoint_share(p_old, p_new)` mueve el `share_slug`, la nota y el flag de indexación a la fila nueva (el enlace enviado sigue siendo el mismo, con datos frescos) y conserva la fila antigua como historial.
- **No existe ningún cron, batch ni "re-auditar todas".** Una auditoría, una acción humana, una vez. Es el único modo de usar Gemini aquí.
- Si la re-auditoría falla o la captura sale bloqueada, el slug **no** se mueve (se queda el dato anterior con su banner "puede haber cambiado").

## 8. Cambios por archivo (cuando des el OK)

| Área | Archivos |
|---|---|
| Migración | `supabase/migrations/0046_share_claim.sql` (tablas, RPCs `claim_shared_audit`, `repoint_share`, revocaciones) |
| Lógica | `lib/share/claim.ts` (token, hash, validación, RPC), `lib/share/reaudit.ts` |
| Página | `app/s/[slug]/page.tsx` (modo owner por `?c=`), `components/share/share-claim-block.tsx`, `app/s/[slug]/claim/route.ts` |
| Panel | `app/actions/share-admin.ts` (generar token al copiar, revertir, re-auditar), `components/admin/owner-shared-audits.tsx` |
| Mensaje | `lib/analyzer/outreach-message.ts` (enlace con `?c=`; el token se genera al copiar) |
| Eventos | `share_claim_start`, `share_claim_done` (nombres ya declarados en `lib/analytics/share-events.ts`) |
| Tests | traspaso atómico y de un solo uso; token inválido/usado; límite de 3 al día; unlock/settle tras traspaso; el modo owner no filtra contenido de pago; sin `?c=` no hay bloque de reclamar; re-auditoría solo manual y para no reclamadas |

## 9. Seguridad y privacidad

- El token en claro solo vive en el mensaje; en base de datos solo el hash. Un solo uso. Sin PII en los eventos (solo `share_slug`).
- `analysis_claim_tokens` y `analysis_claims` no tienen políticas: solo el servicio las lee/escribe; las RPC son `security definer` y solo `service_role` puede ejecutarlas.
- El traspaso nunca expone `top_fixes` ni el persona a quien no es el dueño de la fila: tras el traspaso son suyos, y con las mismas reglas de plan/unlock de cualquier cuenta.
- El panel sigue gateado por `getOwner()` (`ADMIN_EMAILS`).

## 10. Plan de despliegue

1. PR-2 mergeado y migración 0045 aplicada (nota personal e indexación).
2. Tu OK a este diseño (D1–D6).
3. PR-3: migración 0046 aplicada a prod **antes** del merge, tests, subagente adversarial, revisión visual 360/1280 de la página en modo owner.
4. Piloto: genera 1 enlace, reclámalo con una cuenta de prueba (Stripe en modo test para el unlock; el Preview de Vercel y las claves test ya están preparados desde el trabajo del unlock).

## 11. Qué NO incluye

Verificación DNS del dominio, borrado de la fila antigua tras re-auditar, re-auditorías masivas o programadas, envío automático del outreach.
