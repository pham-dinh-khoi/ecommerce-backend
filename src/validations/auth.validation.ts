import { z } from 'zod';

// ============================================================================
// 1. SHARED / REUSABLE SCHEMAS
// ============================================================================

/**
 * passwordSchema
 * We impose a 72-byte limit because bcrypt (the standard hashing algorithm)
 * truncates passwords longer than 72 bytes. Keeping this consistent ensures
 * predictable behavior during hashing.
 */
const passwordSchema = z
  .string({ message: 'Password is required' })
  .min(8, 'Password must be at least 8 characters long')
  .max(72, 'Password must not exceed 72 characters')
  .regex(/[a-z]/, 'The password requires at least one lowercase letter')
  .regex(/[A-Z]/, 'The password requires at least one uppercase letter')
  .regex(/[0-9]/, 'The password requires at least one number');

// ============================================================================
// 2. AUTHENTICATION SCHEMAS
// ============================================================================

/**
 * registerSchema
 * Defines the shape of the registration request.
 * We use .trim() and .toLowerCase() on the email to prevent duplicate
 * accounts caused by whitespace or casing differences.
 */
export const registerSchema = z.object({
  name: z
    .string({ message: 'Name is required' })
    .min(2, 'Name must be at least 2 characters long')
    .max(100, 'name must not exceed 50 characters')
    .trim(),
  email: z.string({ message: 'Email is required' }).email('Invalid email').toLowerCase().trim(),
  password: passwordSchema,
  phone: z
    .string()
    // Supports standard local formats (starting with 0) or international (+84)
    .regex(/^(0|\+84)\d{9,10}$/, 'Invalid phone number')
    .optional(),
});

/**
 * loginSchema
 * Standard login validation. Note: We do not trim or lowercase the password
 * because special characters and casing are required for security.
 */
export const loginSchema = z.object({
  email: z.string({ message: 'Email is required' }).email('Invalid email').toLowerCase(),
  password: z.string({ message: 'Password is required' }).min(1, 'Please enter your password'),
});

/**
 * changePasswordSchema
 * Uses .refine() for cross-field validation.
 * It ensures the user doesn't accidentally set their new password
 * to be the same as their current one.
 */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string({ message: 'Please enter your current password' }),
    newPassword: passwordSchema,
  })
  .refine(data => data.currentPassword !== data.newPassword, {
    message: 'The new password must be different from the current password',
    path: ['newPassword'],
  });

/**
 * forgotPasswordSchema
 * Simple email validation to ensure the user provides a valid address
 * before we trigger an email-sending process.
 */
export const forgotPasswordSchema = z.object({
  email: z.string({ message: 'Email is required' }).email('Invalid email').toLowerCase(),
});

/**
 * resetPasswordSchema
 * Requires the token (usually from an email link) and the new password.
 */
export const resetPasswordSchema = z.object({
  token: z.string({ message: 'The token is mandatory' }),
  newPassword: passwordSchema,
});

/**
 * refreshTokenSchema
 * Validation for refresh token rotation.
 * Marked as optional because the token can often be extracted from HttpOnly
 * cookies rather than the request body.
 */
export const refreshTokenSchema = z.object({
  refreshToken: z.string({ message: 'A refresh token is required' }).optional(),
});

// ============================================================================
// 3. TYPE EXPORTS (TypeScript Inference)
// ============================================================================

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
