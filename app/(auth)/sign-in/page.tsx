import { AuthForm } from "@/components/auth/auth-form";
import { checkoutNextUrl } from "@/lib/auth/next-url";

export const metadata = { title: "Sign in — EliteVault" };

export default function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string;
    message?: string;
    plan?: string;
    interval?: string;
  }>;
}) {
  return <SignInInner searchParams={searchParams} />;
}

async function SignInInner({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string;
    message?: string;
    plan?: string;
    interval?: string;
  }>;
}) {
  const sp = await searchParams;
  return (
    <AuthForm
      mode="sign-in"
      // Mirrors sign-up: a RETURNING user who clicks a pricing CTA and
      // switches to "Sign in" still lands on checkout for the plan they
      // picked (the sign-up ↔ sign-in toggle carries `next` across).
      //
      // v3.6.2 — default post-sign-in route is the analyzer, not the
      // dashboard. Users (especially returning ones) want to run an
      // analysis next, not stare at a summary page.
      nextUrl={checkoutNextUrl(sp) ?? sp.next ?? "/app/analyzer"}
      message={sp.message}
    />
  );
}
