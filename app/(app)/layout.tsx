import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AppSidebar } from "@/components/dashboard/sidebar";
import { AppTopbar } from "@/components/dashboard/topbar";
import { CommandMenu } from "@/components/dashboard/command-menu";
import { PostHogIdentify } from "@/components/analytics/posthog-identify";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, avatar_url, plan, credits")
    .eq("id", user.id)
    .single();

  return (
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
      <AppSidebar profile={profile ?? null} />
      <div className="flex-1 flex flex-col min-w-0">
        <AppTopbar profile={profile ?? null} />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
      <CommandMenu />
    </div>
  );
}
