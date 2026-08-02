import { z } from 'zod';

// ============================================================================
// 1. SHARED UTILITIES
// ============================================================================

/**
 * Reusable MongoDB ObjectId validator.
 * Ensures data passed as an ID strictly conforms to the 24-character hex format.
 */
const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'ID không hợp lệ');

// ============================================================================
// 2. CORE COUPON SCHEMA (The Source of Truth)
// ============================================================================

/**
 * couponBaseSchema
 * Defines the structure of a coupon.
 * Note: We use .coerce for primitives (boolean/number) to ensure that
 * form-data or JSON payloads with stringified numbers are parsed correctly.
 */
const couponBaseSchema = z.object({
  // Sanitization: Convert to uppercase and trim to ensure "save10" and "SAVE10" are treated the same.
  code: z
    .string()
    .min(3, 'Mã tối thiểu 3 ký tự')
    .max(20, 'Mã tối đa 20 ký tự')
    .regex(/^[A-Z0-9_-]+$/, 'Chỉ dùng chữ hoa, số, - và _')
    .toUpperCase()
    .trim(),
  description: z.string().min(5).max(200).trim(),
  discountType: z.enum(['percentage', 'fixed', 'free_shipping', 'buy_x_get_y']),
  discountAmount: z.coerce.number().min(0),
  maxDiscount: z.coerce.number().min(0).optional(),

  // Conditional fields (handled via refinement below)
  buyQuantity: z.coerce.number().int().min(1).optional(),
  getQuantity: z.coerce.number().int().min(1).optional(),
  getProductId: objectId.optional(),

  // Order limits
  minOrderAmount: z.coerce.number().min(0).optional(),
  maxOrderAmount: z.coerce.number().min(0).optional(),

  // Array of valid entities
  allowedProducts: z.array(objectId).default([]),
  excludedProducts: z.array(objectId).default([]),
  allowedCategories: z.array(objectId).default([]),
  allowedUserRoles: z.array(z.enum(['user', 'seller', 'admin'])).default([]),

  firstOrderOnly: z.coerce.boolean().default(false),
  allowedPaymentMethods: z.array(z.enum(['cod', 'paypal'])).default([]),

  // Usage limits
  maxUsageTotal: z.coerce.number().int().min(1).optional(),
  maxUsagePerUser: z.coerce.number().int().min(1).default(1),

  // Temporal validity
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  isActive: z.coerce.boolean().default(true),
});

// ============================================================================
// 3. CREATE & UPDATE LOGIC (Business Rule Enforcement)
// ============================================================================

/**
 * createCouponSchema
 * Uses .refine() to enforce cross-field business logic that
 * simple schema validation cannot catch.
 */
export const createCouponSchema = couponBaseSchema
  .refine(d => d.endDate > d.startDate, {
    message: 'endDate phải sau startDate',
    path: ['endDate'],
  })
  .refine(
    d => d.discountType !== 'percentage' || (d.discountAmount > 0 && d.discountAmount <= 100),
    { message: 'Giảm giá % phải từ 1–100', path: ['discountAmount'] }
  )
  .refine(
    d =>
      d.discountType !== 'buy_x_get_y' ||
      (d.buyQuantity !== undefined && d.getQuantity !== undefined),
    { message: 'buyQuantity và getQuantity là bắt buộc với buy_x_get_y', path: ['buyQuantity'] }
  );

/**
 * updateCouponSchema
 * Uses .partial() to make all fields optional for PATCH requests.
 * Uses .omit() to prevent users from changing the 'code' of an existing coupon,
 * ensuring referential integrity in the database.
 */
export const updateCouponSchema = couponBaseSchema.partial().omit({ code: true });

// ============================================================================
// 4. REQUEST SCHEMAS (Application & Querying)
// ============================================================================

/**
 * applyCouponSchema
 * Used when a customer enters a code in the cart.
 */
export const applyCouponSchema = z.object({
  code: z.string().min(1, 'Vui lòng nhập mã coupon').toUpperCase().trim(),
  orderId: objectId.optional(),
});

/**
 * couponQuerySchema
 * Used for Admin dashboards.
 * 'coerce' ensures that pagination parameters from the URL (?page=1)
 * are correctly cast from strings to numbers.
 */
export const couponQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  keyword: z.string().trim().optional(),
  isActive: z.coerce.boolean().optional(),
  type: z.enum(['percentage', 'fixed', 'free_shipping', 'buy_x_get_y']).optional(),
  sort: z.enum(['createdAt', 'endDate', 'usedCount']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

// ============================================================================
// 5. TYPES
// ============================================================================

export type CreateCouponInput = z.infer<typeof createCouponSchema>;
export type UpdateCouponInput = z.infer<typeof updateCouponSchema>;
export type ApplyCouponInput = z.infer<typeof applyCouponSchema>;
export type CouponQueryInput = z.infer<typeof couponQuerySchema>;
