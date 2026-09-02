import { Router } from 'express';
import * as orderController from '../controllers/order.controller.js';
import { protect, restrictTo } from '../middleware/auth.middleware.js';

const router = Router();

// ==========================================
// AUTHENTICATION GUARD
// ==========================================
// All routes defined below require a valid user session.
router.use(protect);

// ==========================================
// CUSTOMER ROUTES
// ==========================================
// Accessible to any logged-in user.

// Place a new order
router.post('/', orderController.placeOrder);

// Get list of orders belonging to the authenticated user
router.get('/my', orderController.getMyOrders);

// Get details of a specific order belonging to the authenticated user
router.get('/my/:orderId', orderController.getMyOrderById);

// Cancel a specific order (only if it belongs to the user)
router.patch('/my/:orderId/cancel', orderController.cancelMyOrder);

// ==========================================
// ADMIN ROUTES
// ==========================================
// Requires 'admin' role in addition to valid authentication.

// View all orders in the system
router.get('/admin', restrictTo('admin'), orderController.adminGetOrders);

// View revenue and order statistics
router.get('/admin/stats', restrictTo('admin'), orderController.adminGetStats);

// View specific order details by ID
router.get('/admin/:orderId', restrictTo('admin'), orderController.adminGetOrderById);

// Update the status of an order (e.g., 'shipped', 'delivered')
router.patch('/admin/:orderId/status', restrictTo('admin'), orderController.adminUpdateStatus);

export default router;
