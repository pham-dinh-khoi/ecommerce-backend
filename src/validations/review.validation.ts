import { z } from 'zod';

// ============================================================================
// 1. SHARED UTILITIES
// ============================================================================

/**
 * Standard MongoDB ObjectId validator.
 * Centralizing this ensures strict validation across all review-related operations.
 */
const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'ID không hợp lệ');

// ============================================================================
// 2. CUSTOMER SCHEMAS (Review Lifecycle)
// ============================================================================

/**
 * createReviewSchema
 * Validates data for creating a new review. 
 * We enforce a minimum length of 20 characters for content to prevent 
 * low-quality, "spammy" reviews (e.g., "Good", "Ok").
 */
export const createReviewSchema = z.object({
  productId: objectId,
  rating: z.coerce
    .number()
    .int('Rating phải là số nguyên')
    .min(1, 'Rating tối thiểu 1 sao')
    .max(5, 'Rating tối đa 5 sao'),
  title: z
    .string({ message: 'Tiêu đề là bắt buộc' })
    .min(5, 'Tiêu đề ít nhất 5 ký tự')
    .max(150)
    .trim(),
  content: z
    .string({ message: 'Nội dung đánh giá là bắt buộc' })
    .min(20, 'Nội dung ít nhất 20 ký tự để đánh giá có giá trị')
    .max(5000, 'Nội dung không quá 5000 ký tự')
    .trim(),
});

/**
 * updateReviewSchema
 * Uses .optional() to allow users to update just one part of their review 
 * (e.g., changing the rating) without resubmitting the entire body.
 */
export const updateReviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5).optional(),
  title: z.string().min(5).max(150).trim().optional(),
  content: z.string().min(20).max(5000).trim().optional(),
});

// ============================================================================
// 3. MODERATION & COMMUNICATION
// ============================================================================

/**
 * moderateReviewSchema
 * Handles admin workflow for approving or hiding reviews that violate community guidelines.
 */
export const moderateReviewSchema = z.object({
  status: z.enum(['approved', 'rejected', 'hidden']),
  reason: z.string().max(500).trim().optional(),
});

/**
 * replyReviewSchema
 * Used by sellers or admins to respond to user feedback.
 */
export const replyReviewSchema = z.object({
  content: z
    .string({ message: 'Nội dung phản hồi là bắt buộc' })
    .min(10, 'Phản hồi ít nhất 10 ký tự')
    .max(1000)
    .trim(),
});

// ============================================================================
// 4. QUERY PARAMETERS
// ============================================================================

/**
 * reviewQuerySchema
 * Used by the public/frontend to fetch reviews.
 * 
 * NOTE: The use of .transform() is critical here. Query parameters arrive 
 * from the URL as strings (e.g., "true"), so this automatically casts them 
 * into actual JavaScript booleans for your database queries.
 */
export const reviewQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(10),
  sort: z.enum(['newest', 'oldest', 'highest', 'lowest', 'helpful', 'verified']).default('newest'),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  verified: z
    .enum(['true', 'false'])
    .transform(v => v === 'true')
    .optional(),
  withImages: z
    .enum(['true', 'false'])
    .transform(v => v === 'true')
    .optional(),
});

/**
 * adminReviewQuerySchema
 * Advanced filtering for the admin panel.
 */
export const adminReviewQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(['pending', 'approved', 'rejected', 'hidden']).optional(),
  productId: objectId.optional(),
  userId: objectId.optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  sort: z.enum(['createdAt', 'rating', 'helpfulCount']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('asc'),
});

// ============================================================================
// 5. TYPES
// ============================================================================

export type CreateReviewInput = z.infer<typeof createReviewSchema>;
export type UpdateReviewInput = z.infer<typeof updateReviewSchema>;
export type ModerateReviewInput = z.infer<typeof moderateReviewSchema>;
export type ReplyReviewInput = z.infer<typeof replyReviewSchema>;
export type ReviewQueryInput = z.infer<typeof reviewQuerySchema>;
export type AdminReviewQueryInput = z.infer<typeof adminReviewQuerySchema>;