import { z } from 'zod';

// ============================================================================
// 1. SHARED SCHEMAS
// ============================================================================

/**
 * objectIdSchema
 * A reusable regex-based validator for MongoDB ObjectIDs.
 * Ensures the string is exactly 24 hexadecimal characters, preventing
 * malformed ID queries from reaching the database layer.
 */
const objectIdSchema = z
  .string({ message: 'ID là bắt buộc' })
  .regex(/^[a-f\d]{24}$/i, 'ID không hợp lệ');

// ============================================================================
// 2. CART VALIDATION
// ============================================================================

/**
 * addToCartSchema
 * Validates the payload for adding items to the cart.
 * We use 'z.coerce.number()' because API request bodies often parse numbers 
 * as strings (e.g., "1"). Coercion automatically converts "1" to 1.
 */
export const addToCartSchema = z.object({
  productId: objectIdSchema,
  variantId: objectIdSchema,
  quantity: z.coerce
    .number()
    .int('Số lượng phải là số nguyên')
    .min(1, 'Số lượng ít nhất là 1')
    .max(100, 'Số lượng tối đa là 100')
    .default(1), // Default to 1 if not provided
});

/**
 * updateCartItemSchema
 * Validation for updating an existing cart item quantity.
 * Restricts values between 1 and 100 to ensure reasonable cart limits.
 */
export const updateCartItemSchema = z.object({
  quantity: z.coerce
    .number()
    .int('Số lượng phải là số nguyên')
    .min(1, 'Số lượng ít nhất là 1')
    .max(100, 'Số lượng tối đa là 100'),
});

// ============================================================================
// 3. WISHLIST VALIDATION
// ============================================================================

export const wishlistProductSchema = z.object({
  productId: objectIdSchema,
});

// ============================================================================
// 4. TYPES
// ============================================================================

export type AddToCartInput = z.infer<typeof addToCartSchema>;
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;
export type WishlistProductInput = z.infer<typeof wishlistProductSchema>;