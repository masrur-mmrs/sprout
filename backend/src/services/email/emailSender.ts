/** What a password reset email needs. `resetUrl` carries the raw token: never log or store it. */
export interface PasswordResetMessage {
  to: string;
  username: string;
  resetUrl: string;
}

/**
 * Sends transactional email. `createApp({ email })` receives one: the Resend sender in
 * `src/index.ts`, a recording fake in tests. A failed send rejects.
 */
export interface EmailSender {
  sendPasswordReset(message: PasswordResetMessage): Promise<void>;
}
