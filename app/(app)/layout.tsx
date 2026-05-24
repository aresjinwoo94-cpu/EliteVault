import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AppSidebar } from "@/components/dashboard/sidebar";
import { AppTopbar } from "@/components/dashboard/topbar";
import { CommandMenu } from "@/components/dashboard/command-menu";

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
      <AppSidebar profile={profile ?? null} />
      <div className="flex-1 flex flex-col min-w-0">
        <AppTopbar profile={profile ?? null} />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
      <CommandMenu />
    </div>
  );
}
