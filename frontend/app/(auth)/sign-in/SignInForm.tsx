"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { apiFetch } from "@/lib/api/client";
import type { SignInBody, User } from "@/lib/api/types";
import { required } from "@/lib/auth-validation";
import { withNext } from "@/lib/safe-next";
import { FormAlert, useAuthForm } from "../auth-form";

// Presence only: every credential problem is the backend's one generic 401.
const RULES = {
  email: required("Enter your email address.", { trim: true }),
  password: required("Enter your password."),
};

const RESET_DONE = "Your password has been reset. Sign in with your new password.";

/** `next` arrives already validated (safeNext); `reset` is the `?reset=1` a password reset ends on. */
export function SignInForm({ next, reset }: { next: string | null; reset: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const { formRef, alertRef, errors, message, pending, onSubmit, onBlur } = useAuthForm(RULES);

  // Exactly once: Strict Mode runs effects twice, so a ref guards the toast. Then `reset` leaves the
  // URL (`next` stays), so a reload or Back doesn't show it again.
  const resetShown = useRef(false);
  useEffect(() => {
    if (!reset || resetShown.current) return;
    resetShown.current = true;
    toast.show(RESET_DONE, "success");
    router.replace(withNext("/sign-in", next), { scroll: false });
  }, [reset, next, router, toast]);

  const signIn = onSubmit(async ({ email, password }) => {
    const body: SignInBody = { email: email.trim(), password };
    await apiFetch<User>("/api/auth/signin", { method: "POST", body });
    // The root layout (and its header) survives a client navigation: refresh re-renders it signed in.
    router.push(next ?? "/");
    router.refresh();
  });

  return (
    <form ref={formRef} method="post" noValidate onSubmit={signIn} className="mt-6">
      <FormAlert ref={alertRef} message={message} />
      <div className="flex flex-col gap-5">
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          errors={errors.email}
          onBlur={onBlur}
        />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          errors={errors.password}
          onBlur={onBlur}
        />
      </div>
      <Button type="submit" disabled={pending} className="mt-6 w-full">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
