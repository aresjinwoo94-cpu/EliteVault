# EliteVault en Google Cloud Run (gratis) — plan B mientras Vercel esté pausado

Vercel Hobby pausó el equipo por superar el límite gratuito de CPU activa (hasta el 3 de diciembre).
Esto despliega **la misma app** en Cloud Run, donde la capa gratuita (180 000 vCPU-s, 2 M de peticiones al mes)
alcanza para este tráfico con *CPU solo durante la petición* y *escala a cero*.

Nada de aquí cambia el comportamiento en Vercel: `output: standalone` solo se activa con `NEXT_OUTPUT=standalone`.

## 0. Importante: no uses `.env.local`
Ese archivo es de **desarrollo** (Stripe `sk_test`/`pk_test`, `NEXT_PUBLIC_APP_URL=localhost`, sin claves de Inngest).
Desplegar con él dejaría producción cobrando en modo de prueba. Los valores reales están en
Vercel → Settings → Environment Variables (Production) y en los paneles de Stripe / Inngest / Supabase / Google AI Studio.
Las variables que Vercel marcó como *Sensitive* no se pueden volver a leer: cópialas del proveedor o genera una nueva.

## 1. Preparar los dos archivos (en Cloud Shell, no en tu PC)
1. Abre https://console.cloud.google.com/ con el proyecto `elitevault-shopify` y pulsa **Activar Cloud Shell**.
2. `git clone https://github.com/aresjinwoo94-cpu/EliteVault.git && cd EliteVault/elitevault && git checkout chore/cloud-run`
   (si el repo no tiene la carpeta `elitevault`, entra en la raíz).
3. `cp deploy/cloud-run/.env.build.example deploy/cloud-run/.env.build` y rellénalo (`nano`). Son valores públicos.
   `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` debe empezar por `pk_live_`.
4. `cp deploy/cloud-run/.env.runtime.example deploy/cloud-run/.env.runtime` y rellénalo con los valores de **Production**.
   `STRIPE_SECRET_KEY` debe empezar por `sk_live_` (el script avisa si no).

## 2. Desplegar
```bash
bash deploy/cloud-run/deploy.sh
```
Construye en Cloud Build (~5–8 min) y publica `elitevault-web` en `us-central1`. Al final imprime la URL `https://elitevault-web-….run.app`.

## 3. Probar ANTES de tocar el DNS
Abre la URL de Cloud Run: la landing, `/pricing?cur=MXN`, iniciar sesión. No pruebes pagos reales todavía.

## 4. Cambiar el dominio (lo haces tú)
- Cloud Run → *Administrar dominios personalizados* → asigna `elitevaultapp.com` y `www.elitevaultapp.com` al servicio.
- Google te dará registros DNS (A/AAAA o CNAME). Cámbialos en el DNS del dominio (hoy está en Vercel: `ns1.vercel-dns.com`).
- Cuando resuelva: `curl -X PUT https://elitevaultapp.com/api/inngest` para que Inngest registre la nueva URL.
- Stripe (webhook) y Supabase (redirect URLs) **no cambian** porque el dominio es el mismo.

## Diferencias respecto a Vercel (conocidas)
- Cloud Run no manda `x-vercel-ip-country`: el idioma cae a `Accept-Language` y la moneda a USD (`?cur=` sigue funcionando); las estadísticas por país del panel quedan vacías.
- No hay límite de 60 s por paso: Cloud Run admite 300 s (`--timeout 300`).
- Arranque en frío: la primera petición tras inactividad tarda unos segundos (`--min-instances 0` para quedarse gratis).

## Volver a Vercel
Cuando termine la pausa (o si pagas Pro), apunta el DNS de vuelta a Vercel y borra el servicio con
`gcloud run services delete elitevault-web --region us-central1`.
