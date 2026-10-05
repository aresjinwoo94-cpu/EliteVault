"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProfile } from "@/app/actions/profile";
import { toast } from "sonner";
import { useT } from "@/components/i18n/locale-provider";

export function ProfileForm({
  initialFullName,
  email,
}: {
  initialFullName: string;
  email: string;
}) {
  const { t } = useT();
  const [fullName, setFullName] = useState(initialFullName);
  const [isPending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const res = await updateProfile({ full_name: fullName });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(t("settingsPage.profileUpdated"));
    });
  }

  return (
    <div className="grid sm:grid-cols-2 gap-4">
      <div className="space-y-1.5">
        <Label htmlFor="email">{t("contactForm.email")}</Label>
        <Input id="email" value={email} disabled />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="fullName">{t("settingsPage.fullName")}</Label>
        <Input
          id="fullName"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder={t("settingsPage.namePlaceholder")}
        />
      </div>
      <div className="sm:col-span-2">
        <Button
          onClick={save}
          disabled={isPending || fullName === initialFullName}
        >
          {isPending ? t("settingsPage.saving") : t("settingsPage.save")}
        </Button>
      </div>
    </div>
  );
}
