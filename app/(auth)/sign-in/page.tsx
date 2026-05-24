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
      nextUrl={sp.next ?? "/app"}
      message={sp.message}
    />
  );
}
