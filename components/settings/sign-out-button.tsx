"use client";

import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOut } from "@/app/actions/auth";

import { useT } from "@/components/i18n/locale-provider";
export function SignOutButton() {
  const { t } = useT();
  return (
    <form action={signOut}>
      <Button type="submit" variant="destructive">
        <LogOut className="size-4" />
        {t("common.signOut")}
      </Button>
    </form>
  );
}
