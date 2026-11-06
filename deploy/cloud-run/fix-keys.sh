#!/usr/bin/env bash
# Prueba cada clave del servicio contra su proveedor real, y SOLO te pide de nuevo las que fallen.
# Cada clave nueva se valida ANTES de guardarla y se aplica al servicio de Cloud Run (sin reconstruir).
# No imprime ninguna clave. Ejecútalo en Cloud Shell, en la raíz del repo:
#     bash deploy/cloud-run/fix-keys.sh
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
RUNTIME="$DIR/.env.runtime"
BUILD="$DIR/.env.build"
PROJECT="${PROJECT:-elitevault-shopify}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-elitevault-web}"
[ -f "$RUNTIME" ] || { echo "No existe $RUNTIME. Ejecuta primero: bash deploy/cloud-run/guided.sh"; exit 1; }

# --- lectura del YAML  KEY: "valor"  (con \" y \\ escapados)
getv() { local l; l=$(grep "^$1:" "$RUNTIME" | head -1) || true; l="${l#*: \"}"; l="${l%\"}"; l="${l//\\\"/\"}"; l="${l//\\\\/\\}"; printf '%s' "$l"; }
setv() { # KEY VALUE → reescribe la línea en .env.runtime
  local k="$1" v="$2" e; e="${v//\\/\\\\}"; e="${e//\"/\\\"}"
  grep -v "^$k:" "$RUNTIME" > "$RUNTIME.tmp" || true; printf '%s: "%s"\n' "$k" "$e" >> "$RUNTIME.tmp"; mv "$RUNTIME.tmp" "$RUNTIME"
}
SUPA_URL="$(grep '^NEXT_PUBLIC_SUPABASE_URL=' "$BUILD" 2>/dev/null | cut -d= -f2-)"; SUPA_URL="${SUPA_URL:-https://bniqrniajswqvzkhklad.supabase.co}"

# --- validadores: devuelven 0 si la clave funciona
t_supabase() { [ "$(curl -s -o /dev/null -w '%{http_code}' -m 20 "$SUPA_URL/rest/v1/profiles?select=id&limit=1" -H "apikey: $1" -H "Authorization: Bearer $1")" = 200 ]; }
t_stripe()   { [ "$(curl -s -o /dev/null -w '%{http_code}' -m 20 -u "$1:" https://api.stripe.com/v1/balance)" = 200 ]; }
t_gemini()   { [ "$(curl -s -o /dev/null -w '%{http_code}' -m 20 "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1&key=$1")" = 200 ]; }
t_resend()   { local o; o=$(curl -s -m 20 -w '\n%{http_code}' https://api.resend.com/domains -H "Authorization: Bearer $1"); [ "${o##*$'\n'}" = 200 ] || echo "$o" | grep -qi 'restricted'; }
t_shot()     { [ "$(curl -s -o /dev/null -w '%{http_code}' -m 20 "https://api.screenshotone.com/usage?access_key=$1")" = 200 ]; }

CHECKS=(
  "SUPABASE_SERVICE_ROLE_KEY|t_supabase|Supabase → Project Settings → API → clave 'service_role' / 'Secret' (empieza por sb_secret_ o eyJ)"
  "STRIPE_SECRET_KEY|t_stripe|Stripe → Developers → API keys → Secret key LIVE (sk_live_...)"
  "GEMINI_API_KEY|t_gemini|aistudio.google.com → Get API key (AIza..., 39 caracteres)"
  "RESEND_API_KEY|t_resend|resend.com → API Keys (re_...)"
  "SCREENSHOTONE_ACCESS_KEY|t_shot|screenshotone.com → Dashboard → Access key"
)

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
say "Probando las claves contra cada servicio…"
BAD=()
for c in "${CHECKS[@]}"; do
  IFS='|' read -r key fn hint <<< "$c"
  v="$(getv "$key")"
  if [ -z "$v" ]; then echo "   ✗ $key  (vacía)"; BAD+=("$c"); continue; fi
  if "$fn" "$v"; then echo "   ✓ $key  funciona"; else echo "   ✗ $key  RECHAZADA por el servicio"; BAD+=("$c"); fi
done

# --- anon key pública (compilada en la web): se prueba aparte
ANON="$(grep '^NEXT_PUBLIC_SUPABASE_ANON_KEY=' "$BUILD" 2>/dev/null | cut -d= -f2-)"
ANON_BAD=0
if [ -n "$ANON" ] && t_supabase "$ANON"; then echo "   ✓ NEXT_PUBLIC_SUPABASE_ANON_KEY  funciona"; else echo "   ✗ NEXT_PUBLIC_SUPABASE_ANON_KEY  RECHAZADA o vacía (hay que reconstruir al corregirla)"; ANON_BAD=1; fi

if [ "${#BAD[@]}" -eq 0 ] && [ "$ANON_BAD" -eq 0 ]; then
  say "Todas las claves funcionan. El problema no está en las claves."; exit 0
fi

say "Voy a pedirte SOLO las que fallan. Pega con clic derecho → Pegar. No uses Ctrl+C."
UPDATES=()
for c in "${BAD[@]}"; do
  IFS='|' read -r key fn hint <<< "$c"
  while true; do
    printf '\n   %s\n   %s (se oculta; pulsa Enter, o solo Enter para saltarla): ' "$hint" "$key"
    read -r -s nv; echo
    [ -z "$nv" ] && { echo "   (saltada)"; break; }
    if "$fn" "$nv"; then echo "   ✓ validada contra el servicio (${#nv} caracteres)"; setv "$key" "$nv"; UPDATES+=("$key=$nv"); break
    else echo "   ✗ El servicio la rechazó. Revisa que sea la correcta (producción) y vuelve a pegarla."; fi
  done
done

if [ "${#UPDATES[@]}" -gt 0 ]; then
  say "Aplicando al servicio en Cloud Run (sin reconstruir)…"
  joined=""; for u in "${UPDATES[@]}"; do joined="${joined:+$joined@}$u"; done
  gcloud run services update "$SERVICE" --project "$PROJECT" --region "$REGION" --update-env-vars "^@^$joined" && echo "   ✓ Cloud Run actualizado"
fi

if [ "$ANON_BAD" -eq 1 ]; then
  say "La clave pública de Supabase (anon/publishable) va compilada en la web."
  while true; do
    printf '   Supabase → Project Settings → API → clave pública (sb_publishable_... o eyJ...) (se oculta; Enter): '
    read -r -s na; echo
    [ -z "$na" ] && { echo "   (saltada: tendrás que repetirlo)"; break; }
    if t_supabase "$na"; then
      echo "   ✓ validada"; grep -v '^NEXT_PUBLIC_SUPABASE_ANON_KEY=' "$BUILD" > "$BUILD.tmp"; echo "NEXT_PUBLIC_SUPABASE_ANON_KEY=$na" >> "$BUILD.tmp"; mv "$BUILD.tmp" "$BUILD"
      echo "   Reconstruyendo y desplegando (6–10 min)…"; bash "$DIR/deploy.sh"; break
    else echo "   ✗ Rechazada por Supabase. Vuelve a pegarla."; fi
  done
fi
say "Acelerando los arranques en frío (gratis)…"
gcloud run services update "$SERVICE" --project "$PROJECT" --region "$REGION" --cpu-boost >/dev/null 2>&1 && echo "   ✓ cpu-boost activado"
say "Listo. Vuelve a probar la web y avísame."
