import type { Response } from 'express';
import { catchAsync } from '../utils/AppError.js';
import type { AuthRequest } from '../@types/auth.types.js';
import * as wishlistService from '../services/wishlist.service.js';
import { productIdParamSchema, wishlistQuerySchema } from '../validations/wishlist.validation.js';

// ==========================================
// WISHLIST OPERATIONS
// ==========================================

/**
 * @desc Retrieve the authenticated user's wishlist
 * @route GET /wishlist
 */
export const getWishlist = catchAsync(async (req: AuthRequest, res: Response) => {
  const { page, limit } = wishlistQuerySchema.parse(req.query);

  const result = await wishlistService.getWishlist(req.user!.userId, page, limit);
  res.json({ success: true, message: 'OK', ...result });
});

/**
 * @desc Toggle a product in the wishlist (Add if missing, remove if present)
 * @route POST /wishlist/toggle/:productId
 */
export const toggleWishlist = catchAsync(async (req: AuthRequest, res: Response) => {
  const { productId } = productIdParamSchema.parse(req.params);

  const result = await wishlistService.toggleWishlist(req.user!.userId, productId);
  res.json({
    success: true,
    message: result.added ? 'Đã thêm vào danh sách yêu thích' : 'Đã xóa khỏi danh sách yêu thích',
    data: result,
  });
});

/**
 * @desc Check if a specific product is already in the user's wishlist
 * @route GET /wishlist/check/:productId
 */
export const checkWishlist = catchAsync(async (req: AuthRequest, res: Response) => {
  const { productId } = productIdParamSchema.parse(req.params);

  const isInList = await wishlistService.isInWishlist(req.user!.userId, productId);
  res.json({ success: true, message: 'OK', data: { isInWishlist: isInList } });
});

/**
 * @desc Remove all items from the user's wishlist
 * @route DELETE /wishlist/clear
 */
export const clearWishlist = catchAsync(async (req: AuthRequest, res: Response) => {
  await wishlistService.clearWishlist(req.user!.userId);
  res.json({ success: true, message: 'Đã xóa toàn bộ danh sách yêu thích' });
});
