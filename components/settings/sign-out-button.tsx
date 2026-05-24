"use client";

import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOut } from "@/app/actions/auth";

export function SignOutButton() {
  return (
    <form action={signOut}>
      <Button type="submit" variant="destructive">
        <LogOut className="size-4" />
        Sign out
      </Button>
    </form>
  );
}
