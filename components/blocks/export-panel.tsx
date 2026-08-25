"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Download, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmbeddedCheckoutForm } from "@/components/billing/embedded-checkout";
import { exportLiquid } from "@/app/actions/blocks-export";

/**
 * Liquid Blocks WP-D — buy the code, then get the code.
 *
 * The snippet is fetched by a server action AFTER payment and held only in this
 * component's state. It is never part of the page's HTML, never in the polling
 * response, and never in the project row — so there is nothing to find in
 * devtools before paying, which is the difference between a paywall and a
 * curtain.
 *
 * Note what is NOT here: any mention of credits, plans, or an allowance. This
 * is a single purchase available to anyone, which is the whole point of the
 * model — the person most likely to want the download is the one who hasn't
 * subscribed to anything.
 */

export function ExportPanel({
  projectId,
  paid,
  configured,
  priceLabel,
  hasBlock,
  notConfiguredMessage,
}: {
  projectId: string;
  paid: boolean;
  configured: boolean;
  priceLabel: string | null;
  hasBlock: boolean;
  notConfiguredMessage: string;
}) {
  const [checkingOut, setCheckingOut] = useState(false);
  const [snippet, setSnippet] = useState<string | null>(null);
  const [install, setInstall] = useState<string[]>([]);
  const [installText, setInstallText] = useState("");
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  function download() {
    startTransition(async () => {
      const res = await exportLiquid(projectId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setSnippet(res.liquid);
      setInstall(res.install);
      setInstallText(res.installText);
    });
  }

  async function copy() {
    if (!snippet) return;
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Your browser blocked the copy — select the code and copy it manually.");
    }
  }

  if (!hasBlock) {
    return (
      <Card className="p-6 text-center border-white/[0.04]">
        <p className="text-sm text-white/40">
          Build a block above, then you can download the code for it.
        </p>
      </Card>
    );
  }

  /**
   * The purchase can't be offered because no price is configured.
   *
   * Shown as a LOCKED STEP, not as an absence. The first version rendered a
   * quiet grey sentence, which in dev and QA was indistinguishable from the
   * export step not having been built — the reviewer's words were "parece que
   * falta". The step now looks like itself: same heading, same description of
   * what you get, a disabled button where the real one goes, and the reason
   * underneath.
   *
   * The wording still refuses to imply merchant error, because they can neither
   * cause nor fix this, and it says their work is safe — which is the actual
   * question someone has when a step they expected is unavailable.
   */
  if (!configured && !paid) {
    return (
      <Card className="p-6 border-white/[0.04]">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.02]">
            <Lock className="size-4 text-white/35" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-medium text-white/70">
              Download the code for this block
            </h3>
            <p className="mt-2 text-sm text-white/45 max-w-xl">
              The Liquid snippet for the block you previewed, styled with your
              store&apos;s own values, plus instructions for where to paste it.
            </p>
            <Button className="mt-5" disabled>
              <Download className="size-4" />
              Download — not available yet
            </Button>
            <p className="mt-3 text-xs text-white/40 max-w-xl">
              {notConfiguredMessage}
            </p>
          </div>
        </div>
      </Card>
    );
  }

  if (snippet) {
    return (
      <div className="space-y-5">
        <Card className="p-5 border-success/20 bg-success/[0.03]">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-white/80 flex items-center gap-2">
              <Check className="size-4 text-success" />
              Your block, ready to paste.
            </p>
            <Button variant="secondary" onClick={copy}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? "Copied" : "Copy the code"}
            </Button>
          </div>
          {/*
            A scrollable <pre> rather than a download link: the file has to end
            up in Shopify's code editor, and copy-paste is the shortest path
            there. It also keeps the snippet out of the filesystem of whatever
            machine they happen to be on.
          */}
          <pre className="mt-4 max-h-96 overflow-auto rounded-lg bg-obsidian-950 p-4 text-xs leading-relaxed text-white/70 border border-white/[0.06]">
            <code>{snippet}</code>
          </pre>
        </Card>

        <Card className="p-5 border-white/[0.04]">
          <h3 className="text-sm font-medium text-white/80">
            Where to paste it
          </h3>
          <ol className="mt-3 space-y-2.5">
            {install.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm text-white/65">
                <span className="shrink-0 size-5 rounded-full bg-white/[0.06] text-[11px] flex items-center justify-center text-white/50">
                  {i + 1}
                </span>
                <span className="min-w-0">{step}</span>
              </li>
            ))}
          </ol>
          <Button
            variant="secondary"
            className="mt-4"
            onClick={() => {
              navigator.clipboard
                .writeText(installText)
                .then(() => toast.success("Instructions copied."))
                .catch(() => toast.error("Your browser blocked the copy."));
            }}
          >
            <Copy className="size-4" />
            Copy these steps
          </Button>
        </Card>
      </div>
    );
  }

  if (paid) {
    return (
      <Card className="p-6 border-white/[0.04]">
        <p className="text-sm text-white/70">
          You&apos;ve bought this one — download it as many times as you need.
        </p>
        <Button className="mt-4" onClick={download} disabled={isPending}>
          {isPending ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          {isPending ? "Building your snippet…" : "Get the code"}
        </Button>
      </Card>
    );
  }

  if (checkingOut) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setCheckingOut(false)}
          className="text-xs text-white/40 hover:text-white/70 transition-colors"
        >
          ← Not now
        </button>
        <EmbeddedCheckoutForm plan="pro" interval="month" exportProjectId={projectId} />
      </div>
    );
  }

  return (
    <Card className="p-6 border-white/[0.04]">
      <h3 className="text-sm font-medium text-white/80">
        Download the code for this block
      </h3>
      <p className="mt-2 text-sm text-white/50 max-w-xl">
        The Liquid snippet for the block you just previewed, styled with your
        store&apos;s own values, plus step-by-step instructions for where to
        paste it. One payment, no subscription.
      </p>
      <Button className="mt-5" onClick={() => setCheckingOut(true)}>
        <Download className="size-4" />
        {priceLabel ? `Get the code — ${priceLabel}` : "Get the code"}
      </Button>
    </Card>
  );
}
