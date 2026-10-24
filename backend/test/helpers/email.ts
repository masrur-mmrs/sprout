import type { EmailSender, PasswordResetMessage } from "../../src/services/email/emailSender.js";

export interface FakeEmailSender extends EmailSender {
  /** Every message passed to the sender, in order, including ones it then failed to send. */
  sent: PasswordResetMessage[];
}

/**
 * Records messages instead of sending them. With `fails`, each send records and then rejects with
 * an error carrying the message, so a test can check that nothing from it is logged.
 */
export function fakeEmailSender({ fails = false }: { fails?: boolean } = {}): FakeEmailSender {
  const sent: PasswordResetMessage[] = [];
  return {
    sent,
    async sendPasswordReset(message) {
      sent.push(message);
      if (fails) {
        throw Object.assign(new Error("Resend rejected the password reset email"), {
          payload: message,
        });
      }
    },
  };
}
