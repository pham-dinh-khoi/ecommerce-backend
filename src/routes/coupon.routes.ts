import { Router } from 'express';
import * as couponController from '../controllers/coupon.controller.js';
import { protect, restrictTo } from '../middleware/auth.middleware.js';
import { couponPreviewLimiter } from '../middleware/ratelimiter.middleware.js';

const router = Router();

// ==========================================
// CUSTOMER ROUTES
// ==========================================
// These routes are accessible to logged-in customers.

// Preview or validate a coupon code before applying it to an order
router.post('/preview', protect, couponPreviewLimiter, couponController.previewCoupon);

// ==========================================
// ADMIN ROUTES
// ==========================================
// Middleware:
// 1. protect: Requires a valid JWT.
// 2. restrictTo('admin'): Restricts access to users with the 'admin' role.

router.use(protect, restrictTo('admin'));

// List all coupons
router.get('/', couponController.getCoupons);

// Create a new discount coupon
router.post('/', couponController.createCoupon);

// Get specific coupon details by ID
router.get('/:id', couponController.getCouponById);

// Update an existing coupon
router.patch('/:id', couponController.updateCoupon);

// Delete a coupon
router.delete('/:id', couponController.deleteCoupon);

// View usage statistics/history for a specific coupon
router.get('/:id/usage', couponController.getCouponUsageHistory);

export default router;
