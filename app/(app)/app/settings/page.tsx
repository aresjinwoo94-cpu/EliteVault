import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-6">
      <header>
        <p className="text-xs uppercase tracking-widest text-white/40">
          Settings
        </p>
        <h1 className="mt-1 font-serif text-4xl tracking-tight">Account</h1>
      </header>

      <Card className="p-6">
        <h2 className="text-sm font-medium mb-4">Profile</h2>
        <ProfileForm
          initialFullName={profile?.full_name ?? ""}
          email={profile?.email ?? ""}
        />
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium">Plan</h2>
            <p className="text-xs text-white/40 mt-1">Manage from Billing</p>
          </div>
          <Badge variant={profile?.plan === "free" ? "default" : "gold"}>
            {(profile?.plan ?? "free").toUpperCase()}
          </Badge>
        </div>
      </Card>

      <Card className="p-6 border-destructive/20">
        <div className="flex items-center justify-between">
          <div>
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
