import { z } from 'zod';
import { LIMITS } from '../limits';
import { LANGUAGES } from '../appearance';

export const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());
export const passwordSchema = z.string().min(LIMITS.password.min).max(LIMITS.password.max);
export const displayNameSchema = z.string().trim().min(LIMITS.displayName.min).max(LIMITS.displayName.max);
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(LIMITS.username.min)
  .max(LIMITS.username.max)
  .regex(/^[a-z0-9_.]+$/, 'invalid_username');

/** Birth year: only used to apply under-18 protections. Ages 5–120. */
export const birthYearSchema = z
  .number()
  .int()
  .refine((y) => {
    const now = new Date().getUTCFullYear();
    return y <= now - 5 && y >= now - 120;
  }, 'invalid_birth_year');

/** Years to offer in a birth-year picker, newest first (ages 5 to 100). */
export function birthYearChoices(now = new Date()): number[] {
  const y = now.getUTCFullYear();
  return Array.from({ length: 96 }, (_, i) => y - 5 - i);
}

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: displayNameSchema,
  accountType: z.enum(['student', 'teacher']).default('student'),
  birthYear: birthYearSchema.optional(),
  language: z.enum(LANGUAGES as [string, ...string[]]).optional(),
  timezone: z.string().max(64).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(LIMITS.password.max) });
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({ refreshToken: z.string().min(20).max(512).optional() });
export const requestResetSchema = z.object({ email: emailSchema });
export const resetPasswordSchema = z.object({ token: z.string().min(20).max(256), password: passwordSchema });
export const verifyEmailSchema = z.object({ token: z.string().min(20).max(256) });
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema });

/** Password strength 0..4 (length, classes). Mirrors the UI meter. */
export function passwordStrength(pw: string): number {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(4, score);
}
