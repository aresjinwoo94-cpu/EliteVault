# Meta Ad Library: why every call is HTTP 400, and exactly how to fix it

_Diagnosed 2026-10-10 by calling the API with the configured `META_AD_LIBRARY_TOKEN` (read-only GETs; the token was not changed or printed)._

## Diagnosis

Every request — `ads_archive`, `debug_token`, even `/me` — answers:

```
OAuthException, code 190, subcode 463
"Error validating access token: Session has expired on Thursday, 23-Jul-26 14:00:00 PDT."
```

* It is **not** a permissions problem, a wrong endpoint or a missing identity check: Meta rejects the
  token before it looks at any of that.
* The token is a **user access token** (`EAAc…`). Those expire — a long-lived one lasts ~60 days — and this
  one expired on **23 July 2026**. `lib/library/meta-ad-library.ts` deliberately swallows the error body
  (every failure resolves to `null`), which is why the jobs only ever printed `HTTP 400` and nobody saw
  "expired". Since then **no ad count in the Library has been measured**; all of them are seeds/estimates.

## What you have to do (≈10 minutes, in Meta's consoles — I can't and didn't touch credentials)

1. **Confirm the account can use the Ad Library API.** With the Facebook account that owns the developer
   app: complete identity confirmation (facebook.com/id) and accept the Ad Library API terms at
   `https://www.facebook.com/ads/library/api`. Without it a valid token still gets permission errors.
2. **Create a fresh token.** developers.facebook.com → your app → Tools → *Graph API Explorer* → pick the
   app → *Generate Access Token* (no special permissions are needed for `ads_archive`).
3. **Make it long-lived** (otherwise it dies in ~1–2 hours):
   ```
   GET https://graph.facebook.com/v21.0/oauth/access_token
       ?grant_type=fb_exchange_token&client_id=<APP_ID>&client_secret=<APP_SECRET>&fb_exchange_token=<SHORT_TOKEN>
   ```
   The result lasts ~60 days → put a reminder to renew it every ~55 days.
   *Worth trying instead:* an **app access token** (`<APP_ID>|<APP_SECRET>`). If `ads_archive` accepts it
   (test below), it never expires, which removes the renewal chore.
4. **Test it before saving** (replace `<TOKEN>`; a good answer is HTTP 200 with a `data` array):
   ```
   curl "https://graph.facebook.com/v21.0/ads_archive?access_token=<TOKEN>&search_terms=Allbirds&ad_reached_countries=%5B%22DE%22%5D&ad_active_status=ACTIVE&ad_type=ALL&fields=id&limit=1"
   ```
5. Put the new value in **Vercel (Production) and `.env.local`** as `META_AD_LIBRARY_TOKEN`.
6. Tell me, and I run `npm run library:momentum -- --all`. It writes the proof of measurement
   (`ad_signals.source = "meta_ad_library"`, `measured_at`) only for brands Meta really answers for, and
   from then on those — and only those — show the "N active ads" badge.

## Two limits to know even with a valid token

* **EU/UK only.** The Ad Library API exposes *commercial* ads only for the EU/UK; for the US it returns
  just political/issue ads. The client used to query `["US"]`, so even a perfect token would have counted
  ~0 for ordinary stores. It now queries `DE, FR, ES, IT, NL` by default (override with
  `META_AD_LIBRARY_COUNTRIES=GB,DE,…`), and the badge says the count is for ads reaching EU countries.
  A US-only advertiser will legitimately show no badge.
* **Name matching.** `search_terms` is a free-text search, not a Page match, so a generic brand name can
  pick up other advertisers' ads. Treat the number as indicative.

## What the product shows today

No row carries the measurement marker, so **the "N active ads" badge appears nowhere** (winners card,
Library, landing). Revenue/conversion figures stay, labelled as modeled estimates.
