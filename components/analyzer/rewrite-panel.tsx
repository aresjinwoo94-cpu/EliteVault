"use client";

import { useState } from "react";
import { Check, Copy, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { RewriteResult } from "@/lib/supabase/types";
import { useT } from "@/components/i18n/locale-provider";
import { Rich } from "@/components/i18n/rich";
import { fill } from "@/lib/i18n/lookup";

/**
 * Renders the Auto-Rewrite section. The HTML+CSS is sandboxed inside
 * an iframe srcDoc — we never inject untrusted markup into the parent DOM.
 */
export function RewritePanel({ rewrite }: { rewrite: RewriteResult }) {
  const { t } = useT();
  const [copied, setCopied] = useState<"html" | "css" | null>(null);
  const previewDoc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${rewrite.css}\nbody{margin:0;background:#0a0a0f;color:#fafafa;font-family:system-ui,-apple-system,sans-serif}</style></head><body>${rewrite.html}</body></html>`;

  const copy = (kind: "html" | "css") => {
    const text = kind === "html" ? rewrite.html : rewrite.css;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(kind);
      toast.success(fill(t("rewrite.kindCopied"), { kind: kind.toUpperCase() }));
      setTimeout(() => setCopied(null), 1500);
    });
  };

  return (
    <Card className="p-6 relative overflow-hidden">
      <div className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-signal-600/15 blur-3xl" />

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Wand2 className="size-4 text-signal-300" />
            <h3 className="font-medium">{t("rewrite.title")}</h3>
            <Badge variant="ai">
              <Sparkles className="size-3" />
              {t("simulator.scalePlan")}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-white/55">
            <Rich
              text={fill(t("rewrite.intro"), { section: rewrite.section })}
              tags={{ b: (c) => <span className="text-white/85">{c}</span> }}
            />
          </p>
        </div>
      </div>

      <p className="mt-4 text-sm text-white/65 leading-relaxed">
        {rewrite.rationale}
      </p>

      <Tabs defaultValue="preview" className="mt-5">
        <TabsList>
          <TabsTrigger value="preview">{t("rewrite.preview")}</TabsTrigger>
          <TabsTrigger value="html">HTML</TabsTrigger>
          <TabsTrigger value="css">CSS</TabsTrigger>
        </TabsList>

        <TabsContent value="preview">
          <div className="rounded-xl overflow-hidden border border-white/[0.06] bg-obsidian-950">
            <iframe
              srcDoc={previewDoc}
              sandbox="allow-same-origin"
              className="w-full h-[560px] bg-white/2"
              title={t("rewrite.previewTitle")}
            />
          </div>
        </TabsContent>

        <TabsContent value="html">
          <CodeBlock
            code={rewrite.html}
            copied={copied === "html"}
            onCopy={() => copy("html")}
            language="html"
          />
        </TabsContent>

        <TabsContent value="css">
          <CodeBlock
            code={rewrite.css}
            copied={copied === "css"}
            onCopy={() => copy("css")}
            language="css"
          />
        </TabsContent>
      </Tabs>
    </Card>
  );
}

function CodeBlock({
  code,
  copied,
  onCopy,
  language,
}: {
  code: string;
  copied: boolean;
  onCopy: () => void;
  language: string;
}) {
  const { t } = useT();
  return (
    <div className="relative">
      <div className="absolute right-3 top-3 z-10">
        <Button size="sm" variant="secondary" onClick={onCopy}>
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied ? t("rewrite.copied") : t("rewrite.copy")}
        </Button>
      </div>
      <pre className="overflow-auto max-h-[560px] rounded-xl border border-white/[0.06] bg-obsidian-950 p-4 text-xs font-mono text-white/80">
        <code className={`language-${language}`}>{code}</code>
      </pre>
    </div>
  );
}
