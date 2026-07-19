import { AuthForm } from "@/components/auth/auth-form";

export const metadata = { title: "Create your account — EliteVault" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const sp = await searchParams;
  // v3.6.2 — sign-up drops the user straight into the analyzer too;
  // dashboard would be empty for a brand-new account anyway.
  return <AuthForm mode="sign-up" nextUrl={sp.next ?? "/app/library"} />;
}
