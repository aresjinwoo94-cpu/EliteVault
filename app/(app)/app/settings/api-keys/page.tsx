import Link from "next/link";
import { KeyRound } from "lucide-react";
import { createSupabaseServerClient , getUserResult } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ApiKeysManager } from "@/components/settings/api-keys-manager";
import { PLANS } from "@/lib/stripe/plans";
import { getT } from "@/lib/i18n/server";
import { Rich } from "@/components/i18n/rich";

export const metadata = { title: "API Keys" };

export default async function ApiKeysPage() {
  const { t } = await getT();
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await getUserResult();
  const [{ data: profile }, { data: keys }] = await Promise.all([
    supabase
      .from("profiles")
      .select("plan")
      .eq("id", user!.id)
      .single(),
    supabase
      .from("api_keys")
      .select("id, name, token_prefix, last_used_at, request_count, revoked_at, created_at")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false }),
  ]);

  const isScale = PLANS[profile?.plan ?? "free"].unlocksScale;

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-white/40">
            {t("apiKeys.eyebrow")}
          </p>
          <h1 className="mt-1 font-serif text-4xl tracking-tight">
            {t("apiKeys.title")}
          </h1>
          <p className="mt-2 text-sm text-white/55">
            <Rich
              text={t("apiKeys.pageIntro")}
              tags={{
                c: (c) => (
                  <code className="mx-1 px-1.5 py-0.5 rounded bg-white/[0.06] text-white/80 text-xs">
                    {c}
                  </code>
                ),
              }}
            />
          </p>
        </div>
        <Badge variant={isScale ? "gold" : "default"}>
          {t(`plans.${profile?.plan ?? "free"}.name`).toUpperCase()}
        </Badge>
      </header>

      {!isScale ? (
        <Card className="p-8 text-center border-champagne-400/20 bg-gradient-to-br from-champagne-400/[0.04] to-signal-600/[0.04]">
          <KeyRound className="mx-auto size-6 text-champagne-300" />
          <h2 className="mt-4 font-serif text-2xl tracking-tight">
            {t("apiKeys.scaleOnly")}
          </h2>
          <p className="mt-2 text-sm text-white/55 max-w-md mx-auto">
            {t("apiKeys.scaleBody")}
          </p>
          <Link
            href="/app/billing"
            className="inline-block mt-5 text-champagne-400 hover:text-champagne-300 transition-colors"
          >
            {t("apiKeys.upgradeScale")}
          </Link>
        </Card>
      ) : (
        <ApiKeysManager initialKeys={keys ?? []} />
      )}

      {/* Docs */}
      <Card className="p-6">
        <h2 className="text-sm font-medium mb-3">{t("apiKeys.reference")}</h2>
        <div className="space-y-4 text-sm">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-white/40">
              POST /api/v1/analyses
            </p>
            <pre className="mt-2 overflow-x-auto rounded-lg border border-white/[0.06] bg-obsidian-950 p-3 text-xs font-mono text-white/80">
{`curl -X POST https://your-app.com/api/v1/analyses \\
  -H "Authorization: Bearer ev_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{ "url": "https://yourstore.com", "run_rewrite": true }'`}
            </pre>
            <p className="mt-2 text-xs text-white/55">
              <Rich
                text={t("apiKeys.pageReturns")}
                tags={{
                  c: (c) => <code className="text-champagne-300">{c}</code>,
                  ok: (c) => <code className="text-success">{c}</code>,
                  bad: (c) => <code className="text-destructive">{c}</code>,
                }}
              />
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-white/40">
              GET /api/v1/analyses/[id]
            </p>
            <pre className="mt-2 overflow-x-auto rounded-lg border border-white/[0.06] bg-obsidian-950 p-3 text-xs font-mono text-white/80">
{`curl https://your-app.com/api/v1/analyses/<id> \\
  -H "Authorization: Bearer ev_live_..."`}
            </pre>
          </div>
        </div>
      </Card>
    </div>
  );
}
