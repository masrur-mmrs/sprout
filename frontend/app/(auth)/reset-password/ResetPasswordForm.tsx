"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, buttonStyles } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { ApiError, apiFetch } from "@/lib/api/client";
import type { MessageResponse, ResetPasswordBody } from "@/lib/api/types";
import { checkNewPassword } from "@/lib/auth-validation";
import { cx } from "@/lib/cx";
import { FormAlert, StatusPanel, useAuthForm } from "../auth-form";

const RULES = { password: checkNewPassword };

/** The backend refused the token itself: unknown, used, expired or malformed. */
function isDeadLink(err: unknown): boolean {
  return (
    err instanceof ApiError &&
    (err.code === "INVALID_OR_EXPIRED_TOKEN" ||
      (err.code === "VALIDATION_ERROR" && err.details?.token !== undefined))
  );
}

/** A reset link that can't be used, and the way to a new one. */
export function DeadResetLink({ title, swappedIn }: { title: string; swappedIn?: boolean }) {
  return (
    <StatusPanel
      tone="error"
      title={title}
      description="Reset links work once and expire after 15 minutes. Request a new one to continue."
      swappedIn={swappedIn}
    >
      <Link href="/forgot-password" className={cx(buttonStyles("primary"), "w-full")}>
        Request a new link
      </Link>
    </StatusPanel>
  );
}

/**
 * Sets a new password with the link's token, which the page has checked is 64 lower-case hex. The
 * token goes only in the POST body: never logged, never put in another URL. Success signs no one
 * in; it replaces this history entry (and the token in it) with sign-in.
 */
export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [expired, setExpired] = useState(false);
  const { formRef, alertRef, errors, message, pending, onSubmit, onBlur } = useAuthForm(RULES);

  const resetPassword = onSubmit(async ({ password }) => {
    const body: ResetPasswordBody = { token, password };
    try {
      await apiFetch<MessageResponse>("/api/auth/reset-password", { method: "POST", body });
    } catch (err) {
      if (!isDeadLink(err)) throw err;
      setExpired(true);
      return;
    }
    router.replace("/sign-in?reset=1");
  });

  if (expired) return <DeadResetLink title="This reset link has expired." swappedIn />;

  return (
    <>
      <p className="mt-2 text-sm text-muted">Choose a new password for your Sprout account.</p>
      <form ref={formRef} method="post" noValidate onSubmit={resetPassword} className="mt-6">
        <FormAlert ref={alertRef} message={message} />
        {/* No maxLength: it would silently cut a pasted password short. */}
        <Field
          label="New password"
          name="password"
          type="password"
          autoComplete="new-password"
          hint="8–72 characters"
          required
          errors={errors.password}
          onBlur={onBlur}
        />
        <Button type="submit" disabled={pending} className="mt-6 w-full">
          {pending ? "Resetting password…" : "Reset password"}
        </Button>
      </form>
    </>
  );
}
