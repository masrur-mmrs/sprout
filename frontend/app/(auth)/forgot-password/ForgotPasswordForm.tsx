"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, buttonStyles } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { TextLink } from "@/components/ui/TextLink";
import { apiFetch } from "@/lib/api/client";
import type { ForgotPasswordBody, MessageResponse } from "@/lib/api/types";
import { checkEmail } from "@/lib/auth-validation";
import { cx } from "@/lib/cx";
import { FormAlert, StatusPanel, useAuthForm } from "../auth-form";

const RULES = { email: checkEmail };

/**
 * Asks for a reset link. Anti-enumeration: a 200 always swaps in the backend's one confirmation
 * text, the same for any email, and nothing else in the UI branches on the account existing. A 400
 * or 429 shows its error, and neither depends on the account either.
 */
export function ForgotPasswordForm() {
  const [sent, setSent] = useState<string | null>(null);
  const { formRef, alertRef, errors, message, pending, onSubmit, onBlur } = useAuthForm(RULES);

  const requestLink = onSubmit(async ({ email }) => {
    const body: ForgotPasswordBody = { email: email.trim() };
    const res = await apiFetch<MessageResponse>("/api/auth/forgot-password", {
      method: "POST",
      body,
    });
    setSent(res.message);
  });

  if (sent) {
    return (
      <StatusPanel
        tone="success"
        title={sent}
        description="The link works once and expires in 15 minutes."
        swappedIn
      >
        <Link href="/sign-in" className={cx(buttonStyles("secondary"), "w-full")}>
          Back to sign in
        </Link>
      </StatusPanel>
    );
  }

  return (
    <>
      <p className="mt-2 text-sm text-muted">
        Enter the email you signed up with, and we’ll send you a link to reset your password.
      </p>
      <form ref={formRef} method="post" noValidate onSubmit={requestLink} className="mt-6">
        <FormAlert ref={alertRef} message={message} />
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          errors={errors.email}
          onBlur={onBlur}
        />
        <Button type="submit" disabled={pending} className="mt-6 w-full">
          {pending ? "Sending link…" : "Send reset link"}
        </Button>
      </form>
      <p className="mt-6 border-t border-slate-200 pt-6 text-center text-sm text-muted">
        Remembered it? <TextLink href="/sign-in">Back to sign in</TextLink>
      </p>
    </>
  );
}
