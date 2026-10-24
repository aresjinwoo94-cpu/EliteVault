import { redirect } from "next/navigation";
import { createSupabaseServerClient , getUserResult } from "@/lib/supabase/server";
import { AppSidebar } from "@/components/dashboard/sidebar";
import { AppTopbar } from "@/components/dashboard/topbar";
import { HideChromeOnCheckout } from "@/components/dashboard/focus-chrome";
import { CommandMenuLazy } from "@/components/dashboard/command-menu-lazy";
import { PostHogIdentify } from "@/components/analytics/posthog-identify";
import { AppScope } from "@/components/i18n/app-scope";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await getUserResult();
  if (!user) redirect("/sign-in");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, avatar_url, plan, credits")
    .eq("id", user.id)
    .single();

  return (
    <AppScope>
    <div className="min-h-screen flex">
      {/* Tag the PostHog session with this user's id + plan so the
          dashboard can segment by tier (free / pro / scale) and watch
          session replays per user. */}
      <PostHogIdentify
        userId={user.id}
        email={profile?.email ?? user.email ?? null}
        plan={profile?.plan ?? "free"}
        fullName={profile?.full_name ?? null}
      />
      <HideChromeOnCheckout>
        <AppSidebar profile={profile ?? null} />
      </HideChromeOnCheckout>
      <div className="flex-1 flex flex-col min-w-0">
        {/* The payment route drops the chrome at every size; see the
            component. Everywhere else this is a no-op. */}
        <HideChromeOnCheckout>
          <AppTopbar profile={profile ?? null} />
        </HideChromeOnCheckout>
        <main className="flex-1 min-w-0">{children}</main>
      </div>
      <CommandMenuLazy />
    </div>
    </AppScope>
  );
}
