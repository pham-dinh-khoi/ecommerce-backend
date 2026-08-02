import { Router } from 'express';
import * as reviewController from '../controllers/review.controller.js';
import { protect, restrictTo, optionalAuth } from '../middleware/auth.middleware.js';
import { uploadProductImages } from '../middleware/upload.middleware.js';
import { reviewCreateLimiter } from '../middleware/ratelimiter.middleware.js';

const router = Router();

// ==========================================
// PUBLIC ROUTES
// ==========================================
// Accessible to any user.

// Get reviews for a specific product
// Note: This is typically mounted at /api/products/:productId/reviews
router.get('/products/:productId/reviews', optionalAuth, reviewController.getProductReviews);

// ==========================================
// AUTHENTICATED ROUTES
// ==========================================
// Requires a valid JWT session.

router.use(protect);

// --- User Management ---
// Create a new review (with image support)
router.post('/', uploadProductImages, reviewController.createReview);

// Get the logged-in user's review history
router.get('/my', reviewController.getMyReviews);

// Update or Delete a specific review owned by the user
router.patch('/:reviewId', uploadProductImages, reviewCreateLimiter, reviewController.updateReview);
router.delete('/:reviewId', reviewController.deleteReview);

// --- Social Interaction ---
// Toggle helpful vote for a review
router.post('/:reviewId/helpful', reviewController.voteHelpful);

// ==========================================
// ADMIN / SELLER ROUTES
// ==========================================

// Seller or Admin can reply to a public review
router.post('/:reviewId/reply', restrictTo('admin', 'seller'), reviewController.replyReview);

// --- Admin-Only Moderation ---
// Requires Admin role for sensitive moderation actions
router.use(restrictTo('admin'));

router.get('/admin', reviewController.adminGetReviews);
router.patch('/admin/bulk-moderate', reviewController.bulkModerate);
router.patch('/:reviewId/moderate', reviewController.moderateReview);
router.delete('/admin/:reviewId', reviewController.adminDeleteReview);

export default router;
