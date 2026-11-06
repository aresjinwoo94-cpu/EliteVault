#!/usr/bin/env bash
# Asistente paso a paso: te pregunta cada dato, te dice dónde encontrarlo, escribe los archivos
# .env.build y .env.runtime y lanza el despliegue. Ejecútalo en Cloud Shell, en la raíz del repo:
#     bash deploy/cloud-run/guided.sh
# Lo que escribas NO se guarda en git (los archivos están ignorados) y no se muestra en pantalla si es secreto.
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD="$DIR/.env.build"
RUNTIME="$DIR/.env.runtime"
# NO se borran: si se corta, vuelve a ejecutar este script y continúa donde iba.
touch "$BUILD" "$RUNTIME"
have() { grep -q "^$2[:=]" "$1"; }

printf '\n\033[1mAntes de empezar\033[0m\n'
echo "   • Pega con CLIC DERECHO → Pegar (o Ctrl+Shift+V). NO uses Ctrl+C ni Ctrl+Z: cierran o pausan el asistente."
echo "   • En las preguntas secretas no se ve nada al pegar. Es normal: pulsa Enter y verás '✓ recibido'."
echo "   • Si se corta, vuelve a ejecutar: bash deploy/cloud-run/guided.sh  (continúa donde lo dejaste)."

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
note() { printf '   \033[2m%s\033[0m\n' "$*"; }

# ask_build KEY "dónde se encuentra" [default]
ask_build() {
  local key="$1" hint="$2" def="${3:-}" val
  if have "$BUILD" "$key"; then echo "   ✓ $key (ya lo tenías)"; return 0; fi
  note "$hint"
  read -r -p "   $key${def:+ [$def]}: " val
  val="${val:-$def}"
  printf '%s=%s\n' "$key" "$val" >> "$BUILD"
}

# ask KEY "dónde se encuentra" secret|plain [required|optional] [prefijo-esperado]
ask() {
  local key="$1" hint="$2" kind="${3:-plain}" req="${4:-optional}" prefix="${5:-}" val
  if have "$RUNTIME" "$key"; then echo "   ✓ $key (ya lo tenías)"; return 0; fi
  while true; do
    note "$hint"
    if [ "$kind" = secret ]; then read -r -s -p "   $key (se oculta al pegar; pulsa Enter): " val; echo; else read -r -p "   $key: " val; fi
    if [ -z "$val" ] && [ "$req" = required ]; then echo "   ⚠  Este dato es obligatorio."; continue; fi
    if [ -n "$val" ] && [ -n "$prefix" ] && [ "${val#"$prefix"}" = "$val" ]; then echo "   ⚠  Debería empezar por '$prefix'. Revisa que sea la clave de PRODUCCIÓN (live)."; continue; fi
    break
  done
  [ -z "$val" ] && return 0
  echo "   ✓ recibido (${#val} caracteres)"
  val="${val//\\/\\\\}"; val="${val//\"/\\\"}"
  printf '%s: "%s"\n' "$key" "$val" >> "$RUNTIME"
}

say "1/6  Datos públicos de la web (no son secretos)"
ask_build NEXT_PUBLIC_APP_URL "Déjalo así (Enter)." "https://elitevaultapp.com"
ask_build NEXT_PUBLIC_SUPABASE_URL "Déjalo así (Enter)." "https://bniqrniajswqvzkhklad.supabase.co"
ask_build NEXT_PUBLIC_SUPABASE_ANON_KEY "Supabase → Project Settings → API → 'anon public' (empieza por eyJ...). Si no lo tienes a mano, tu .env.local tiene el mismo valor."
ask_build NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY "Stripe → Developers → API keys → 'Publishable key' en modo LIVE (pk_live_...)."
ask_build NEXT_PUBLIC_POSTHOG_KEY "Vercel → Environment Variables (si no usas PostHog, Enter)."
ask_build NEXT_PUBLIC_POSTHOG_HOST "Idem (Enter para saltar)."
ask_build NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED "Vercel → Environment Variables (suele ser true; Enter para saltar)." "true"

say "2/6  Supabase y Stripe (LIVE)"
ask SUPABASE_SERVICE_ROLE_KEY "Supabase → Project Settings → API → 'service_role' (secreta)." secret required
ask STRIPE_SECRET_KEY "Stripe → Developers → API keys → 'Secret key' LIVE." secret required "sk_live_"
ask STRIPE_WEBHOOK_SECRET "Stripe → Developers → Webhooks → tu endpoint de elitevaultapp.com → 'Signing secret'." secret required "whsec_"
ask STRIPE_PRICE_PRO_MONTHLY "Stripe → Product catalog → Pro → precio mensual (price_...)." plain required "price_"
ask STRIPE_PRICE_PRO_YEARLY "Pro anual (price_...)." plain required "price_"
ask STRIPE_PRICE_SCALE_MONTHLY "Scale mensual (price_...)." plain required "price_"
ask STRIPE_PRICE_SCALE_YEARLY "Scale anual (price_...)." plain required "price_"

say "3/6  Inngest (tareas en segundo plano: los análisis)"
ask INNGEST_EVENT_KEY "app.inngest.com → Manage → Event Keys." secret required
ask INNGEST_SIGNING_KEY "app.inngest.com → Manage → Signing Key (signkey-prod-...)." secret required
have "$RUNTIME" INNGEST_SERVE_HOST || printf 'INNGEST_SERVE_HOST: "https://elitevaultapp.com"\n' >> "$RUNTIME"

say "4/6  IA"
have "$RUNTIME" AI_PROVIDER || printf 'AI_PROVIDER: "gemini"\n' >> "$RUNTIME"
ask GEMINI_API_KEY "aistudio.google.com → Get API key. Empieza por AIza y mide 39 caracteres (Vercel no deja volver a ver la que puso)." secret required "AIza"
ask GEMINI_API_KEY_JOBS "Segunda clave de Google AI Studio para trabajos en segundo plano, también AIza... (Enter si no tienes)." secret "" "AIza"
ask GEMINI_MODEL "Vercel → Environment Variables → GEMINI_MODEL (Enter si no existe)."
ask GEMINI_MODEL_FAST "Idem GEMINI_MODEL_FAST."
ask GEMINI_MODEL_STABLE "Idem GEMINI_MODEL_STABLE."
ask ANTHROPIC_API_KEY "console.anthropic.com → API keys, empieza por sk-ant- (Enter si no lo usas)." secret "" "sk-ant-"

say "5/6  Capturas, correo y avisos"
ask SCREENSHOTONE_ACCESS_KEY "screenshotone.com → Dashboard → Access key." secret required
ask RESEND_API_KEY "resend.com → API Keys." secret required
ask RESEND_FROM "Remitente, p. ej. EliteVault <hola@elitevaultapp.com> (míralo en Vercel)." plain required
ask META_AD_LIBRARY_TOKEN "Vercel → Environment Variables (Enter si no existe)." secret
ask MICROLINK_API_KEY "Vercel (Enter si no existe)." secret
ask ADMIN_EMAILS "Tu correo de administrador (el que ves en Vercel)." plain required
ask OWNER_NOTIFY_EMAIL "Correo donde recibes avisos (Enter para saltar)."
ask SUPPORT_NOTIFY_EMAIL "Correo de soporte (Enter para saltar)."
have "$RUNTIME" EMAIL_UNSUBSCRIBE_SECRET || printf 'EMAIL_UNSUBSCRIBE_SECRET: "%s"\n' "$(head -c 24 /dev/urandom | base64 | tr -d '=+/\n')" >> "$RUNTIME"
have "$RUNTIME" ANON_SESSION_SECRET || printf 'ANON_SESSION_SECRET: "%s"\n' "$(head -c 24 /dev/urandom | base64 | tr -d '=+/\n')" >> "$RUNTIME"
note "EMAIL_UNSUBSCRIBE_SECRET y ANON_SESSION_SECRET se generaron nuevos (los enlaces de baja de correos viejos dejarán de valer)."

say "6/6  Otras variables de Vercel (opcional)"
note "En Vercel → Environment Variables hay también interruptores y ajustes (AUTO_LOCALE, ANALYZER_*, SCREENSHOT_*, ENABLE_ANON_PREVIEW, ANON_AUDIT_LIMIT_PER_DAY, CHECKOUT_RECOVERY_ENABLED, REPORT_UNLOCK, ANALYZER_REPORT_V2...)."
note "Pega aquí líneas NOMBRE=valor (una por línea) y termina con una línea vacía. Enter directo para saltar."
while IFS= read -r line; do
  [ -z "$line" ] && break
  k="${line%%=*}"; v="${line#*=}"; v="${v%\"}"; v="${v#\"}"
  case "$k" in ''|*[!A-Z0-9_]*) echo "   (ignorada: '$k' no es un nombre válido)"; continue;; esac
  v="${v//\\/\\\\}"; v="${v//\"/\\\"}"
  printf '%s: "%s"\n' "$k" "$v" >> "$RUNTIME"
done

say "Listo. Voy a construir y desplegar (tarda 6–10 min)…"
bash "$DIR/deploy.sh"
