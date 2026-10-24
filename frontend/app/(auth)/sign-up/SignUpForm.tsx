"use client";

import { useRouter } from "next/navigation";
import { useId } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { apiFetch } from "@/lib/api/client";
import type { SignUpBody, User } from "@/lib/api/types";
import { checkEmail, checkNewPassword, checkUsername } from "@/lib/auth-validation";
import { FormAlert, useAuthForm } from "../auth-form";

const RULES = { username: checkUsername, email: checkEmail, password: checkNewPassword };

/** `next` arrives already validated (safeNext). */
export function SignUpForm({ next }: { next: string | null }) {
  const router = useRouter();
  const checkboxId = useId();
  const { formRef, alertRef, errors, message, pending, onSubmit, onBlur } = useAuthForm(RULES);

  const signUp = onSubmit(async ({ username, email, password }, data) => {
    const body: SignUpBody = {
      username: username.trim(),
      email: email.trim(),
      password,
      role: data.has("developer") ? "developer" : "user",
    };
    await apiFetch<User>("/api/auth/signup", { method: "POST", body });
    // The root layout (and its header) survives a client navigation: refresh re-renders it signed in.
    router.push(next ?? "/");
    router.refresh();
  });

  return (
    <form ref={formRef} method="post" noValidate onSubmit={signUp} className="mt-6">
      <FormAlert ref={alertRef} message={message} />
      <div className="flex flex-col gap-5">
        <Field
          label="Username"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          errors={errors.username}
          onBlur={onBlur}
        />
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          errors={errors.email}
          onBlur={onBlur}
        />
        {/* No maxLength: it would silently cut a pasted password short. */}
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          hint="8–72 characters"
          required
          errors={errors.password}
          onBlur={onBlur}
        />
        <div className="flex items-start gap-3 text-sm">
          {/* accent-green-700: the browser draws a white check, which needs a dark fill (not brand). */}
          <input
            id={`${checkboxId}-developer`}
            type="checkbox"
            name="developer"
            aria-describedby={`${checkboxId}-developer-hint`}
            className="focus-ring mt-0.5 size-4 shrink-0 accent-green-700"
          />
          <div className="flex flex-col gap-0.5">
            <label htmlFor={`${checkboxId}-developer`} className="font-medium text-ink">
              I want to publish apps
            </label>
            <p id={`${checkboxId}-developer-hint`} className="text-muted">
              You get a dashboard for uploading and managing your apps.
            </p>
          </div>
        </div>
      </div>
      <Button type="submit" disabled={pending} className="mt-6 w-full">
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
