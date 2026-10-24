import { z } from "zod";

/** bcrypt only reads the first 72 bytes of a password; anything after them would be ignored. */
export const MAX_PASSWORD_BYTES = 72;

export const roleSchema = z.enum(["developer", "user"]);
export type Role = z.infer<typeof roleSchema>;

// Trim and lower-case before the format check (G10): z.email().trim() would reject "  A@B.COM ".
const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(100));

/** The rule for every new password: signup and reset. */
export const passwordSchema = z
  .string()
  .min(8)
  .max(72)
  .refine((password) => Buffer.byteLength(password, "utf8") <= MAX_PASSWORD_BYTES, {
    message: `Must be at most ${MAX_PASSWORD_BYTES} bytes`,
  });

export const signUpSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(50)
    .regex(/^[a-zA-Z0-9_]+$/, "Use only letters, numbers and underscores"),
  email: emailSchema,
  password: passwordSchema,
  role: roleSchema.default("user"),
});
export type SignUpInput = z.infer<typeof signUpSchema>;

// Shape only: every credential problem is the same 401, never a hint about the password rules.
export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(1024),
});
export type SignInInput = z.infer<typeof signInSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  // randomBytes(32) as lower-case hex: anything else can't be a token we issued.
  token: z.string().regex(/^[0-9a-f]{64}$/, "Invalid reset token"),
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
