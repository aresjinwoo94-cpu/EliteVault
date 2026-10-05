"use client";

import { useState, useTransition } from "react";
import { Check, Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createApiKey, revokeApiKey } from "@/app/actions/api-keys";
import { useT } from "@/components/i18n/locale-provider";
import { fill } from "@/lib/i18n/lookup";
import { formatDate } from "@/lib/i18n/format";

interface KeyRow {
  id: string;
  name: string;
  token_prefix: string;
  last_used_at: string | null;
  request_count: number;
  revoked_at: string | null;
  created_at: string;
}

export function ApiKeysManager({ initialKeys }: { initialKeys: KeyRow[] }) {
  const { t, locale } = useT();
  const [keys, setKeys] = useState(initialKeys);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [revealed, setRevealed] = useState<{ id: string; token: string } | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();

  function create() {
    if (!name.trim()) {
      toast.error(t("apiKeys.nameRequired"));
      return;
    }
    startTransition(async () => {
      const res = await createApiKey({ name: name.trim() });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setRevealed({ id: res.id, token: res.token });
      setKeys((prev) => [
        {
          id: res.id,
          name,
          token_prefix: res.prefix,
          last_used_at: null,
          request_count: 0,
          revoked_at: null,
          created_at: new Date().toISOString(),
        },
        ...prev,
      ]);
      setName("");
      setOpen(false);
    });
  }

  function revoke(id: string) {
    if (!confirm(t("apiKeys.confirmRevoke"))) {
      return;
    }
    startTransition(async () => {
      const res = await revokeApiKey(id);
      if (!res.ok) {
        toast.error(res.error ?? t("apiKeys.revokeFailed"));
        return;
      }
      setKeys((prev) =>
        prev.map((k) =>
          k.id === id ? { ...k, revoked_at: new Date().toISOString() } : k,
        ),
      );
      toast.success(t("apiKeys.revoked"));
    });
  }

  function copy(token: string) {
    navigator.clipboard.writeText(token);
    toast.success(t("apiKeys.copied"));
  }

  return (
    <>
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium">{t("apiKeys.yourKeys")}</h2>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="size-3.5" />
                {t("apiKeys.newKey")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("apiKeys.createTitle")}</DialogTitle>
                <DialogDescription>
                  {t("apiKeys.createBody")}
                </DialogDescription>
              </DialogHeader>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("apiKeys.placeholder")}
                onKeyDown={(e) => e.key === "Enter" && create()}
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  {t("common.cancel")}
                </Button>
                <Button onClick={create} disabled={isPending}>
                  {isPending ? t("apiKeys.generating") : t("apiKeys.generate")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {keys.length === 0 ? (
          <div className="text-center py-12 text-white/40">
            <KeyRound className="mx-auto size-6 mb-2" />
            <p className="text-sm">{t("apiKeys.none")}</p>
          </div>
        ) : (
          <ul className="divide-y divide-white/[0.04]">
            {keys.map((k) => (
              <li
                key={k.id}
                className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
              >
                <KeyRound className="size-4 text-white/40 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{k.name}</p>
                    {k.revoked_at && (
                      <Badge variant="danger">{t("apiKeys.revokedBadge")}</Badge>
                    )}
                  </div>
                  <p className="text-xs text-white/40 font-mono">
                    {k.token_prefix}
                  </p>
                </div>
                <div className="text-right text-[11px] text-white/40 shrink-0">
                  <p>{fill(t("apiKeys.requests"), { n: k.request_count })}</p>
                  <p>
                    {k.last_used_at
                      ? fill(t("apiKeys.usedOn"), {
                          date: formatDate(k.last_used_at, locale),
                        })
                      : t("apiKeys.neverUsed")}
                  </p>
                </div>
                {!k.revoked_at && (
                  <button
                    onClick={() => revoke(k.id)}
                    className="size-7 grid place-items-center text-white/30 hover:text-destructive rounded-md hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Reveal modal — shown ONCE after creation */}
      <Dialog
        open={!!revealed}
        onOpenChange={(o) => !o && setRevealed(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("apiKeys.saveNow")}</DialogTitle>
            <DialogDescription>
              {t("apiKeys.saveNowBody")}
            </DialogDescription>
          </DialogHeader>
          {revealed && (
            <div className="relative">
              <pre className="overflow-x-auto rounded-lg border border-champagne-400/30 bg-obsidian-950 p-4 pr-16 text-xs font-mono text-champagne-200">
                {revealed.token}
              </pre>
              <Button
                size="sm"
                className="absolute right-3 top-3"
                onClick={() => copy(revealed.token)}
              >
                <Copy className="size-3" />
                {t("apiKeys.copy")}
              </Button>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setRevealed(null)}>
              <Check className="size-4" />
              {t("apiKeys.savedIt")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
