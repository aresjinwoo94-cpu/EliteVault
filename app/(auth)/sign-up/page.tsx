import { AuthForm } from "@/components/auth/auth-form";
import { checkoutNextUrl } from "@/lib/auth/next-url";

export const metadata = { title: "Create your account — EliteVault" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; plan?: string; interval?: string }>;
}) {
  const sp = await searchParams;
  // The landing pricing CTAs link to /sign-up?plan=pro&interval=month. Before
  // this, `plan`/`interval` were dropped on the floor and the buyer landed in
  // the Analyzer — never reaching checkout for the plan they'd just picked.
  // Now a valid paid plan routes them straight to checkout after auth.
  //
  // v3.6.2 default (no plan): sign-up drops the user into the analyzer;
  // the dashboard would be empty for a brand-new account anyway.
  const nextUrl = checkoutNextUrl(sp) ?? sp.next ?? "/app/analyzer";
  return <AuthForm mode="sign-up" nextUrl={nextUrl} />;
}
