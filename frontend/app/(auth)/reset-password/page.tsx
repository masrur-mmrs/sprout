import type { Metadata } from "next";
import { RESET_TOKEN } from "@/lib/auth-validation";
import { DeadResetLink, ResetPasswordForm } from "./ResetPasswordForm";

// The URL carries the token: send no Referer anywhere (so it can't leak to another origin or a
// backend log), and keep the page out of search indexes.
export const metadata: Metadata = {
  title: "Reset password",
  referrer: "no-referrer",
  robots: { index: false },
};

/** Reachable signed in too: the link in the email works either way. */
export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const { token } = await searchParams;
  // A missing, repeated (array) or malformed token can't be one we issued: no form for it.
  const valid = typeof token === "string" && RESET_TOKEN.test(token);

  return (
    <>
      <h1 className="text-2xl font-semibold">Reset password</h1>
      {valid ? (
        <ResetPasswordForm token={token} />
      ) : (
        <DeadResetLink title="This reset link isn’t valid." />
      )}
    </>
  );
}
