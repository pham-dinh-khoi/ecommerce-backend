import type { Response } from 'express';
import { catchAsync } from '../utils/AppError.js';
import type { AuthRequest } from '../@types/auth.types.js';
import * as couponService from '../services/coupon.service.js';
import {
  createCouponSchema,
  updateCouponSchema,
  applyCouponSchema,
  couponQuerySchema,
} from '../validations/coupon.validation.js';

// ─── User: Preview Coupon Before Checkout ───────────────────────────────────

export const previewCoupon = catchAsync(async (req: AuthRequest, res: Response) => {
  const { code } = applyCouponSchema.parse(req.body);
  const result = await couponService.previewCoupon(code, req.user!.userId, req.user!.role);
  res.json({
    success: true,
    message: `Coupon "${code}" is valid — discount applied: ${result.discountAmount.toLocaleString('en-US')} VND`,
    data: result,
  });
});

// ─── Admin: CRUD Operations ─────────────────────────────────────────────────

export const getCoupons = catchAsync(async (req: AuthRequest, res: Response) => {
  const query = couponQuerySchema.parse(req.query);
  const result = await couponService.getCoupons(query);
  res.json({ success: true, message: 'OK', ...result });
});

export const getCouponById = catchAsync(async (req: AuthRequest, res: Response) => {
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id) {
    res.status(400).json({ success: false, message: 'Missing ID in the path parameters' });
    return;
  }
  const coupon = await couponService.getCouponById(id);
  res.json({ success: true, message: 'OK', data: coupon });
});

export const createCoupon = catchAsync(async (req: AuthRequest, res: Response) => {
  const input = createCouponSchema.parse(req.body);
  const coupon = await couponService.createCoupon(input, req.user!.userId);
  res.status(201).json({ success: true, message: 'Coupon created successfully', data: coupon });
});

export const updateCoupon = catchAsync(async (req: AuthRequest, res: Response) => {
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id) {
    res.status(400).json({ success: false, message: 'Missing ID in the path parameters' });
    return;
  }

  const input = updateCouponSchema.parse(req.body);
  const coupon = await couponService.updateCoupon(id, input);
  res.json({ success: true, message: 'Coupon updated successfully', data: coupon });
});

export const deleteCoupon = catchAsync(async (req: AuthRequest, res: Response) => {
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id) {
    res.status(400).json({ success: false, message: 'Missing ID in the path parameters' });
    return;
  }
  await couponService.deleteCoupon(id);
  res.json({ success: true, message: 'Coupon deleted successfully' });
});

export const getCouponUsageHistory = catchAsync(async (req: AuthRequest, res: Response) => {
  const couponId = req.params.couponId as string;
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const result = await couponService.getCouponUsageHistory(couponId, page, limit);
  res.json({ success: true, message: 'OK', ...result });
});