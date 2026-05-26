import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SignOutButton } from "@/components/settings/sign-out-button";
import { ProfileForm } from "@/components/settings/profile-form";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user!.id)
    .single();

  return (
    <div className="p-6 md:p-10 lg:p-12 pt-10 md:pt-14 max-w-3xl mx-auto space-y-8">
      <header>
        <p className="text-xs uppercase tracking-widest text-white/40">
          Settings
        </p>
        <h1 className="mt-2 font-serif text-4xl md:text-5xl tracking-tight leading-[1.05]">
          Account
        </h1>
      </header>

      <Card className="p-6 md:p-7">
        <h2 className="text-sm font-medium mb-5">Profile</h2>
        <ProfileForm
          initialFullName={profile?.full_name ?? ""}
          email={profile?.email ?? ""}
        />
      </Card>

      <Card className="p-6 md:p-7">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-sm font-medium">Plan</h2>
            <p className="text-xs text-white/40 mt-1">
              Manage from{" "}
              <span className="text-white/60">Billing</span>
            </p>
          </div>
          <Badge variant={profile?.plan === "free" ? "default" : "gold"}>
            {(profile?.plan ?? "free").toUpperCase()}
          </Badge>
        </div>
      </Card>

      <Card className="p-6 md:p-7 border-destructive/20">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-sm font-medium">Sign out</h2>
            <p className="text-xs text-white/40 mt-1">
              End your session on this device.
            </p>
          </div>
          <SignOutButton />
        </div>
      </Card>
    </div>
  );
}
