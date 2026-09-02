import { Router } from 'express';
import * as paymentController from '../controllers/payment.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { paymentInitiateLimiter } from '../middleware/ratelimiter.middleware.js';

const router = Router();

// ==========================================
// PAYMENT GATEWAY CALLBACKS
// ==========================================
// These routes do NOT use 'protect'.
// They are accessed via server-to-server communication or browser redirects
// from the payment gateway. Authentication is handled by validating
// digital signatures/tokens sent by the providers.

// PayPal
router.get('/paypal/return', paymentController.paypalReturn);
router.get('/paypal/cancel', paymentController.paypalCancel);
router.post('/paypal/webhook', paymentController.paypalWebhook);

// ==========================================
// AUTHENTICATED ROUTES
// ==========================================
// Requires a valid JWT session for standard user actions.
router.use(protect);

// Initialize a payment flow for an order
router.post('/initiate', paymentInitiateLimiter, paymentController.initiatePayment);

// Poll for payment status (useful for frontend UI synchronization)
router.get('/status/:orderId', paymentController.checkPaymentStatus);

export default router;
