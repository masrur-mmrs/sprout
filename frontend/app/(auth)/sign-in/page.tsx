import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TextLink } from "@/components/ui/TextLink";
import { safeNext, withNext } from "@/lib/safe-next";
import { getCurrentUser } from "@/lib/session";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const params = await searchParams;
  // A repeated param arrives as an array, and counts as absent.
  const next = safeNext(params.next);
  // Already signed in: go where sign-in would have. Outside any try/catch, since redirect() throws.
  if (await getCurrentUser()) redirect(next ?? "/");

  return (
    <>
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <SignInForm next={next} reset={params.reset === "1"} />
      <p className="mt-4 text-center text-sm">
        <TextLink href="/forgot-password">Forgot password?</TextLink>
      </p>
      <p className="mt-6 border-t border-slate-200 pt-6 text-center text-sm text-muted">
        New to Sprout? <TextLink href={withNext("/sign-up", next)}>Create an account</TextLink>
      </p>
    </>
  );
}
