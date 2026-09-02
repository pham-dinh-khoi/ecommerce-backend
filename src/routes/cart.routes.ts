import { Router } from 'express';
import * as cartController from '../controllers/cart.controller.js';
import { optionalAuth } from '../middleware/auth.middleware.js';

const router = Router();

// ==========================================
// CART OPERATIONS
// ==========================================
// These routes support both authenticated and guest users via optionalAuth.
// Guest carts are typically handled via session IDs or temporary identifiers
// if the user is not logged in.

// Retrieve the current cart
router.get('/', optionalAuth, cartController.getCart);

// Add an item to the cart
router.post('/items', optionalAuth, cartController.addItem);

// Update quantity or details of an existing item in the cart
router.patch('/items/:variantId', optionalAuth, cartController.updateItem);

// Remove a specific item from the cart
router.delete('/items/:variantId', optionalAuth, cartController.removeItem);

// Clear the entire cart
router.delete('/', optionalAuth, cartController.clearCart);

export default router;
