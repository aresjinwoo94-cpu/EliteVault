import type { Metadata } from "next";
import Link from "next/link";
import { MarketingNav } from "@/components/marketing/nav";
import { Footer } from "@/components/marketing/footer";
import { PLANS } from "@/lib/stripe/plans";

export const metadata: Metadata = {
  title: "API documentation",
  description:
    "EliteVault REST API v1 — authentication, endpoints, request/response formats, limits, and errors.",
};

function Code({ children }: { children: string }) {
  return (
    <pre className="my-3 overflow-x-auto rounded-lg border border-white/[0.08] bg-obsidian-950 p-4 text-xs leading-relaxed text-white/80">
      <code className="font-mono whitespace-pre">{children}</code>
    </pre>
  );
}

export default function ApiDocsPage() {
  const scale = PLANS.scale;

  return (
    <div className="min-h-screen flex flex-col">
      <MarketingNav />
      <main className="flex-1">
        <div className="container max-w-3xl py-24 md:py-32">
          <p className="text-xs uppercase tracking-widest text-white/40">
            Developers
          </p>
          <h1 className="mt-2 font-serif text-3xl md:text-4xl tracking-tight">
            REST API (v1)
          </h1>

          <div className="legal-prose mt-8">
            <p>
              The EliteVault API lets you run store audits programmatically. It
              is available on the <strong>Scale</strong> plan ($
              {scale.price.month}/mo). All requests use HTTPS and return JSON.
            </p>

            <h2>Authentication</h2>
            <p>
              Authenticate with a bearer token. Create and manage tokens in{" "}
              <Link href="/app/settings/api-keys">Settings → API keys</Link>.
              Pass it in the <code>Authorization</code> header:
            </p>
            <Code>{`Authorization: Bearer ev_live_xxxxxxxxxxxxxxxx`}</Code>
            <p>
              Keep tokens secret — they grant full API access to your account.
              Never expose them in client-side code.
            </p>

            <h2>Usage limits</h2>
            <p>
              API audits draw from your plan&apos;s monthly analysis allowance
              (Scale: <strong>{scale.quotas.analysesPerMonth}</strong> audits /
              month). When you run out, requests return{" "}
              <code>402 out_of_credits</code> until your next billing period.
            </p>

            <h2>Create an analysis</h2>
            <p>
              <code>POST /api/v1/analyses</code> — queues an audit and returns
              immediately. Body:
            </p>
            <ul>
              <li>
                <code>url</code> <span className="text-white/50">(string, required)</span> — the store URL to
                audit.
              </li>
              <li>
                <code>persona</code> <span className="text-white/50">(object, optional)</span> — a buyer
                persona to simulate against.
              </li>
              <li>
                <code>run_rewrite</code> <span className="text-white/50">(boolean, optional, default true)</span>{" "}
                — also generate a rewrite of the hero section.
              </li>
            </ul>
            <Code>{`curl https://elitevaultapp.com/api/v1/analyses \\
  -H "Authorization: Bearer ev_live_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{ "url": "https://yourstore.com" }'`}</Code>
            <p>Returns <code>202 Accepted</code>:</p>
            <Code>{`{
  "id": "8f3c…",
  "status": "queued",
  "check_at": "/api/v1/analyses/8f3c…"
}`}</Code>

            <h2>Retrieve an analysis</h2>
            <p>
              <code>GET /api/v1/analyses/{`{id}`}</code> — poll{" "}
              <code>check_at</code> until <code>status</code> is{" "}
              <code>succeeded</code> (or <code>failed</code>/
              <code>refunded</code>). Statuses: <code>queued</code>,{" "}
              <code>running</code>, <code>succeeded</code>, <code>failed</code>,{" "}
              <code>refunded</code>.
            </p>
            <Code>{`{
  "id": "8f3c…",
  "status": "succeeded",
  "url": "https://yourstore.com",
  "screenshot_url": "https://…",
  "result": {
    "score": 62,
    "summary": "…",
    "category_scores": { "color": 70, "layout": 55, "imagery": 64,
      "technical": 60, "niche_coherence": 58, "cro_principles": 65 },
    "top_fixes": [ { "title": "Move primary CTA above the fold", … } ],
    "annotations": [ … ],
    "buyer_persona_response": { … },
    "scenarios": { … }
  },
  "meta_ads": { … },
  "created_at": "…", "finished_at": "…"
}`}</Code>
            <p>
              The overall <code>score</code> is 0–100. Fields populate only once{" "}
              <code>status</code> is <code>succeeded</code>. Scores are
              AI-generated estimates, not guarantees.
            </p>

            <h2>Errors</h2>
            <p>Errors return a JSON body with an <code>error</code> code:</p>
            <ul>
              <li>
                <code>401 missing_bearer_token</code> — no/invalid token.
              </li>
              <li>
                <code>403 scale_plan_required</code> — your plan doesn&apos;t
                include API access.
              </li>
              <li>
                <code>402 out_of_credits</code> — monthly allowance exhausted.
              </li>
              <li>
                <code>400 invalid_body</code> — request body failed validation.
              </li>
              <li>
                <code>404 not_found</code> — analysis id not found, or not yours.
              </li>
            </ul>

            <h2>Need help?</h2>
            <p>
              Manage your keys in{" "}
              <Link href="/app/settings/api-keys">Settings → API keys</Link>, or{" "}
              <Link href="/support/contact">contact support</Link>.
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
