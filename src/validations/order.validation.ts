import { z } from 'zod';

// ============================================================================
// 1. SHARED UTILITIES
// ============================================================================

/**
 * Reusable ID and Contact formatters.
 * Centralizing these prevents regex drift across the application.
 */
const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'ID không hợp lệ');
const phone = z.string().regex(/^(0|\+84)\d{9,10}$/, 'Số điện thoại không hợp lệ');

// ============================================================================
// 2. ORDER PROCESSING SCHEMAS
// ============================================================================

/**
 * newAddressSchema
 * Defines the shape of a manual address input. Used when the user
 * does not want to use a saved address profile.
 */
const newAddressSchema = z.object({
  recipientName: z.string().min(2).trim(),
  recipientPhone: phone,
  province: z.string().min(1),
  district: z.string().min(1),
  ward: z.string().min(1),
  streetAddress: z.string().min(5).max(200).trim(),
});

/**
 * placeOrderSchema
 * Enforces the "Either/Or" pattern for delivery addresses:
 * The order must have either a saved `addressId` or a `newAddress` object.
 */
export const placeOrderSchema = z
  .object({
    addressId: objectId.optional(),
    newAddress: newAddressSchema.optional(),
    paymentMethod: z.enum(['cod', 'paypal']),
    couponCode: z.string().trim().toUpperCase().optional(),
    note: z.string().max(500).trim().optional(),
  })
  .refine(d => d.addressId || d.newAddress, {
    message: 'Phải cung cấp địa chỉ giao hàng (addressId hoặc newAddress)',
    path: ['addressId'],
  });

// ============================================================================
// 3. ADMIN / OPERATIONAL SCHEMAS
// ============================================================================

/**
 * updateStatusSchema
 * Business rule enforcement for order lifecycle.
 * The 'refine' block ensures that we cannot mark an order as 'shipped'
 * without providing a tracking code—preventing inconsistent data states.
 */
export const updateStatusSchema = z
  .object({
    status: z.enum(['confirmed', 'processing', 'shipped', 'delivered', 'cancelled']),
    note: z.string().max(500).optional(),
    carrier: z.string().trim().optional(),
    trackingCode: z.string().trim().optional(),
    estimatedDelivery: z.string().datetime({ offset: true }).optional(),
  })
  .refine(d => d.status !== 'shipped' || !!d.trackingCode, {
    message: 'Phải có mã vận đơn khi chuyển sang trạng thái shipped',
    path: ['trackingCode'],
  });

/**
 * cancelOrderSchema
 * Enforces quality control on cancellation reasons to prevent spam or
 * empty cancellation requests.
 */
export const cancelOrderSchema = z.object({
  reason: z
    .string({ message: 'Vui lòng cung cấp lý do hủy đơn' })
    .min(10, 'Lý do hủy ít nhất 10 ký tự')
    .max(500)
    .trim(),
});

// ============================================================================
// 4. QUERY / PAGINATION SCHEMAS
// ============================================================================

/**
 * userOrderQuerySchema
 * Defines parameters for customers viewing their order history.
 */
export const userOrderQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(10),
  status: z
    .enum(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'])
    .optional(),
});

/**
 * adminOrderQuerySchema
 * Advanced filtering for the admin dashboard.
 * 'coerce' handles incoming string-based query parameters from the URL.
 */
export const adminOrderQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z
    .enum(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'])
    .optional(),
  userId: objectId.optional(),
  keyword: z.string().trim().optional(),
  paymentMethod: z.enum(['cod', 'paypal']).optional(),
  fromDate: z.string().datetime({ offset: true }).optional(),
  toDate: z.string().datetime({ offset: true }).optional(),
  sort: z.enum(['createdAt', 'totalAmount']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

// ============================================================================
// 5. TYPES
// ============================================================================

export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;
export type UserOrderQueryInput = z.infer<typeof userOrderQuerySchema>;
export type AdminOrderQueryInput = z.infer<typeof adminOrderQuerySchema>;
