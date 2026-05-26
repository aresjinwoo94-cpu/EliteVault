import { AuthForm } from "@/components/auth/auth-form";

export const metadata = { title: "Sign in — EliteVault" };

export default function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; message?: string }>;
}) {
  return <SignInInner searchParams={searchParams} />;
}

async function SignInInner({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; message?: string }>;
}) {
  const sp = await searchParams;
  return (
    <AuthForm
      mode="sign-in"
      // v3.6.2 — default post-sign-in route is the analyzer, not the
      // dashboard. Users (especially returning ones) want to run an
      // analysis next, not stare at a summary page.
      nextUrl={sp.next ?? "/app/analyzer"}
      message={sp.message}
    />
  );
}
