import { z } from 'zod';

// ─── Profile Management ─────────────────────────────────────────────────────

/**
 * Schema for updating user profile information.
 * Uses .optional() for all fields to allow partial updates.
 */
export const updateProfileSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters long')
    .max(100, 'Name must not exceed 100 characters')
    .trim()
    .optional(),

  // Validation for Vietnamese phone number format
  // Supports formats starting with '0' (local) or '+84' (international)
  phone: z
    .string()
    .regex(/^(0|\+84)\d{9,10}$/, 'Invalid phone number')
    .optional(),

  gender: z.enum(['male', 'female', 'other']).optional(),

  // Coerce date string from inputs to Date object for validation
  dateOfBirth: z.coerce.date().max(new Date(), 'A birth date cannot be in the future').optional(),
});

// ─── Address Management ─────────────────────────────────────────────────────

/**
 * Base schema for a complete address.
 * Used for creating new addresses where all fields are mandatory.
 */
export const addressSchema = z.object({
  label: z
    .string({ message: 'Address labels are mandatory' })
    .min(1, 'Labels cannot be empty')
    .max(50, 'Labels should not exceed 50 characters')
    .trim(),

  recipientName: z
    .string({ message: 'Recipient Name name is required.' })
    .min(2, 'Name must be at least 2 characters long')
    .trim(),

  recipientPhone: z
    .string({ message: 'Recipient Phone is required.' })
    .regex(/^(0|\+84)\d{9,10}$/, 'Invalid phone number'),

  province: z.string({ message: 'Province/city is required' }).min(1),
  district: z.string({ message: 'District/county is mandatory' }).min(1),
  ward: z.string({ message: 'Ward/commune is mandatory' }).min(1),

  streetAddress: z
    .string({ message: 'Street address is required' })
    .min(5, 'Address must be at least 5 characters long')
    .max(200, 'Addresses must not exceed 200 characters')
    .trim(),

  // Coerce string input (e.g., "true"/"false") to boolean
  isDefault: z.coerce.boolean().default(false),
});

/**
 * Derived schema for updating addresses.
 * .partial() makes all fields optional, adhering to the DRY principle.
 */
export const updateAddressSchema = addressSchema.partial();

// ─── Admin: User Management ─────────────────────────────────────────────────

/**
 * Schema for admin-level user updates.
 * Restricted to specific fields an admin is allowed to modify.
 */
export const adminUpdateUserSchema = z.object({
  role: z.enum(['admin', 'seller', 'user']).optional(),
  isActive: z.coerce.boolean().optional(),
});

/**
 * Schema for filtering and pagination when viewing the user list.
 */
export const adminUserQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  keyword: z.string().trim().optional(),
  role: z.enum(['admin', 'seller', 'user']).optional(),
  isActive: z.coerce.boolean().optional(),
  sort: z.enum(['createdAt', 'name', 'email']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

// ─── Types Export ───────────────────────────────────────────────────────────

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type AddressInput = z.infer<typeof addressSchema>;
export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;
export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;
export type AdminUserQueryInput = z.infer<typeof adminUserQuerySchema>;
