import type { Metadata } from "next";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const metadata: Metadata = { title: "Forgot password" };

/** Reachable signed in too: a signed-in user may still want a reset link. */
export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Forgot password</h1>
      <ForgotPasswordForm />
    </>
  );
}
