#!/usr/bin/env bash
# Builds the image on Cloud Build and deploys it to Cloud Run. Run it from Google Cloud Shell
# (gcloud is already logged in there) at the repo root:   bash deploy/cloud-run/deploy.sh
#
#   deploy/cloud-run/.env.build     NEXT_PUBLIC_* values (public by design), copied from .env.build.example
#   deploy/cloud-run/.env.runtime   server secrets, YAML (KEY: "value"), copied from .env.runtime.example
# Both real files are gitignored. NEVER commit them.
set -euo pipefail

PROJECT="${PROJECT:-elitevault-shopify}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-elitevault-web}"
REPO="${REPO:-cloud-run-source-deploy}"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT}/${REPO}/${SERVICE}:$(git rev-parse --short HEAD)"
DIR="$(cd "$(dirname "$0")" && pwd)"

[ -f "$DIR/.env.build" ]   || { echo "Missing $DIR/.env.build (copy .env.build.example and fill it)"; exit 1; }
[ -f "$DIR/.env.runtime" ] || { echo "Missing $DIR/.env.runtime (copy .env.runtime.example and fill it)"; exit 1; }

set -a; . "$DIR/.env.build"; set +a
for v in NEXT_PUBLIC_APP_URL NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY; do
  [ -n "${!v:-}" ] || { echo "$v is empty in .env.build"; exit 1; }
done
case "$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY" in pk_live_*) ;; *) echo "WARNING: NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not pk_live_* — production would run in Stripe TEST mode"; read -r -p "Continue anyway? [y/N] " a; [ "$a" = y ] || exit 1;; esac
grep -q 'STRIPE_SECRET_KEY: *"\?sk_live_' "$DIR/.env.runtime" || { echo "WARNING: STRIPE_SECRET_KEY in .env.runtime is not sk_live_*"; read -r -p "Continue anyway? [y/N] " a; [ "$a" = y ] || exit 1; }

gcloud config set project "$PROJECT" >/dev/null
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com >/dev/null
gcloud artifacts repositories describe "$REPO" --location "$REGION" >/dev/null 2>&1 \
  || gcloud artifacts repositories create "$REPO" --repository-format=docker --location "$REGION"

gcloud builds submit --config "$DIR/cloudbuild.yaml" \
  --substitutions "_IMAGE=${IMAGE},_NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL},_NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL},_NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY},_NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=${NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY},_NEXT_PUBLIC_POSTHOG_KEY=${NEXT_PUBLIC_POSTHOG_KEY:-},_NEXT_PUBLIC_POSTHOG_HOST=${NEXT_PUBLIC_POSTHOG_HOST:-},_NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED=${NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED:-}" .

# Request-based CPU (billed only while a request runs), scale to zero: stays inside the free tier at this traffic.
# --env-vars-file REPLACES every variable the service already has, so it is only used the FIRST time.
# On a redeploy the existing variables (including ones changed later with `gcloud run services update`) are kept.
if gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" >/dev/null 2>&1; then
  ENV_ARGS=()
  echo "El servicio ya existe: se conservan sus variables de entorno actuales."
else
  ENV_ARGS=(--env-vars-file "$DIR/.env.runtime")
fi

gcloud run deploy "$SERVICE" --image "$IMAGE" --region "$REGION" \
  --allow-unauthenticated --port 8080 \
  --cpu 1 --memory 1Gi --timeout 300 --concurrency 40 \
  --min-instances 0 --max-instances 3 \
  --cpu-throttling --cpu-boost \
  "${ENV_ARGS[@]}"

echo
gcloud run services describe "$SERVICE" --region "$REGION" --format 'value(status.url)'
