import type { Response } from 'express';
import { catchAsync, AppError } from '../utils/AppError.js';
import type { AuthRequest } from '../@types/auth.types.js';
import * as reviewService from '../services/review.service.js';
import {
  createReviewSchema,
  updateReviewSchema,
  moderateReviewSchema,
  replyReviewSchema,
  reviewQuerySchema,
  adminReviewQuerySchema,
} from '../validations/review.validation.js';

// ==========================================
// USER ACTIONS
// ==========================================

// Create a new product review
export const createReview = catchAsync(async (req: AuthRequest, res: Response) => {
  const input = createReviewSchema.parse(req.body);
  const imageFiles = (req.files as Express.Multer.File[]) || [];
  const review = await reviewService.createReview(input, req.user!.userId, imageFiles);

  const isPending = review.moderation.status === 'pending';
  res.status(201).json({
    success: true,
    message: isPending
      ? 'Đánh giá đã được gửi và đang chờ kiểm duyệt'
      : 'Đánh giá của bạn đã được đăng thành công',
    data: review,
  });
});

// Update an existing review
export const updateReview = catchAsync(async (req: AuthRequest, res: Response) => {
  const reviewId = req.params.reviewId as string;
  const input = updateReviewSchema.parse(req.body);
  const imageFiles = (req.files as Express.Multer.File[]) || [];
  const review = await reviewService.updateReview(reviewId, req.user!.userId, input, imageFiles);
  res.json({ success: true, message: 'Cập nhật đánh giá thành công', data: review });
});

// Delete an existing review
export const deleteReview = catchAsync(async (req: AuthRequest, res: Response) => {
  const reviewId = req.params.reviewId as string;
  await reviewService.deleteReview(reviewId, req.user!.userId);
  res.json({ success: true, message: 'Đã xóa đánh giá' });
});

// Vote helpful for a review
export const voteHelpful = catchAsync(async (req: AuthRequest, res: Response) => {
  const reviewId = req.params.reviewId as string;
  const { isHelpful } = req.body;
  if (typeof isHelpful !== 'boolean') {
    throw new AppError('isHelpful phải là boolean', 400);
  }
  const result = await reviewService.voteHelpful(reviewId, req.user!.userId, isHelpful);
  res.json({ success: true, message: 'Vote thành công', data: result });
});

// Get reviews authored by the current user
export const getMyReviews = catchAsync(async (req: AuthRequest, res: Response) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 10;
  const result = await reviewService.getMyReviews(req.user!.userId, page, limit);
  res.json({ success: true, message: 'OK', ...result });
});

// ==========================================
// PUBLIC ACTIONS
// ==========================================

// Get reviews for a specific product
export const getProductReviews = catchAsync(async (req: AuthRequest, res: Response) => {
  const productId = req.params.productId as string;
  const query = reviewQuerySchema.parse(req.query);
  const result = await reviewService.getProductReviews(productId, query, req.user?.userId);

  res.json({ success: true, message: 'OK', ...result });
});

// ==========================================
// ADMIN / SELLER ACTIONS
// ==========================================

// Reply to a customer review
export const replyReview = catchAsync(async (req: AuthRequest, res: Response) => {
  const reviewId = req.params.reviewId as string;
  const input = replyReviewSchema.parse(req.body);
  const review = await reviewService.replyReview(reviewId, req.user!.userId, input);
  res.json({ success: true, message: 'Phản hồi đã được đăng', data: review });
});

// Get a list of reviews for moderation (Admin dashboard)
export const adminGetReviews = catchAsync(async (req: AuthRequest, res: Response) => {
  const query = adminReviewQuerySchema.parse(req.query);
  const result = await reviewService.getAdminReviews(query);
  res.json({ success: true, message: 'OK', ...result });
});

// Approve, reject, or hide a specific review
export const moderateReview = catchAsync(async (req: AuthRequest, res: Response) => {
  const reviewId = req.params.reviewId as string;
  const input = moderateReviewSchema.parse(req.body);
  const review = await reviewService.moderateReview(reviewId, req.user!.userId, input);
  res.json({
    success: true,
    message: `Đánh giá đã được ${input.status === 'approved' ? 'duyệt' : input.status === 'rejected' ? 'từ chối' : 'ẩn'}`,
    data: review,
  });
});

// Admin-level deletion of any review
export const adminDeleteReview = catchAsync(async (req: AuthRequest, res: Response) => {
  const reviewId = req.params.reviewId as string;
  await reviewService.deleteReview(reviewId, req.user!.userId, true);
  res.json({ success: true, message: 'Đã xóa đánh giá' });
});

// Batch process moderation for multiple reviews
export const bulkModerate = catchAsync(async (req: AuthRequest, res: Response) => {
  const { reviewIds, status, reason } = req.body as {
    reviewIds: string[];
    status: 'approved' | 'rejected' | 'hidden';
    reason?: string;
  };

  if (!Array.isArray(reviewIds) || !reviewIds.length) {
    throw new AppError('reviewIds là bắt buộc', 400);
  }
  if (!['approved', 'rejected', 'hidden'].includes(status)) {
    throw new AppError('status không hợp lệ', 400);
  }

  // Sequentially process moderation to ensure consistent rating updates
  const results = await Promise.allSettled(
    reviewIds.map(id => reviewService.moderateReview(id, req.user!.userId, { status, reason }))
  );

  const succeeded = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;

  res.json({
    success: true,
    message: `Đã xử lý ${succeeded}/${reviewIds.length} đánh giá${failed ? ` (${failed} lỗi)` : ''}`,
    data: { succeeded, failed },
  });
});
