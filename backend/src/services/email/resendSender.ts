import { render } from "@react-email/render";
import { createElement } from "react";
import { Resend } from "resend";
import PasswordResetEmail from "../../emails/PasswordResetEmail.js";
import type { EmailSender } from "./emailSender.js";

/** Blueprint §6. */
export const PASSWORD_RESET_SUBJECT = "Reset your Sprout password";

/**
 * The production EmailSender (blueprint §6). It takes its config as arguments instead of importing
 * `env`, so tests can build one without the backend environment.
 */
export function createResendSender(config: {
  apiKey: string;
  /** e.g. "Sprout <no-reply@yourdomain.com>", on a domain verified in Resend. */
  from: string;
  appUrl: string;
}): EmailSender {
  const resend = new Resend(config.apiKey);

  return {
    async sendPasswordReset({ to, username, resetUrl }) {
      // Rendered here rather than passed as `react:`, so a plain-text part goes out too.
      const email = createElement(PasswordResetEmail, {
        username,
        resetUrl,
        appUrl: config.appUrl,
      });
      const [html, text] = await Promise.all([render(email), render(email, { plainText: true })]);

      // Resend reports API failures in `error` instead of throwing.
      const { error } = await resend.emails.send({
        from: config.from,
        to,
        subject: PASSWORD_RESET_SUBJECT,
        html,
        text,
      });
      if (error) {
        // Name and status only: Resend's message can quote an email address. The Resend dashboard
        // logs have the full error.
        throw new Error(
          `Resend rejected the password reset email: ${error.name} (status ${error.statusCode ?? "unknown"})`,
        );
      }
    },
  };
}
