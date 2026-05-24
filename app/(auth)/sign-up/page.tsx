import { AuthForm } from "@/components/auth/auth-form";

export const metadata = { title: "Create your account — EliteVault" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const sp = await searchParams;
  return <AuthForm mode="sign-up" nextUrl={sp.next ?? "/app"} />;
}
