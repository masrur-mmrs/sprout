import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TextLink } from "@/components/ui/TextLink";
import { safeNext, withNext } from "@/lib/safe-next";
import { getCurrentUser } from "@/lib/session";
import { SignUpForm } from "./SignUpForm";

export const metadata: Metadata = { title: "Create account" };

export default async function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  const params = await searchParams;
  // A repeated param arrives as an array, and counts as absent.
  const next = safeNext(params.next);
  // Already signed in: go where sign-up would have. Outside any try/catch, since redirect() throws.
  if (await getCurrentUser()) redirect(next ?? "/");

  return (
    <>
      <h1 className="text-2xl font-semibold">Create account</h1>
      <p className="mt-2 text-sm text-muted">Discover indie apps, or publish your own.</p>
      <SignUpForm next={next} />
      <p className="mt-6 border-t border-slate-200 pt-6 text-center text-sm text-muted">
        Already have an account? <TextLink href={withNext("/sign-in", next)}>Sign in</TextLink>
      </p>
    </>
  );
}
