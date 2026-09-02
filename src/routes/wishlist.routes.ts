import { Router } from 'express';
import * as wishlistController from '../controllers/wishlist.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = Router();

// ==========================================
// AUTHENTICATION GUARD
// ==========================================
// All wishlist operations require an authenticated user.
router.use(protect);

// ==========================================
// WISHLIST OPERATIONS
// ==========================================

// Retrieve the user's wishlist
router.get('/', wishlistController.getWishlist);

// Toggle a product in the wishlist (Add if not present, Remove if already present)
// This is a great UX pattern for 'Heart/Like' buttons
router.post('/:productId', wishlistController.toggleWishlist);

// Check if a specific product exists in the user's wishlist
// Useful for updating the UI state of a 'Heart' icon on product listing pages
router.get('/:productId/check', wishlistController.checkWishlist);

// Clear all items from the user's wishlist
router.delete('/', wishlistController.clearWishlist);

export default router;
