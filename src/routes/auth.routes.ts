import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import {
  loginLimiter,
  registerLimiter,
  forgotPasswordLimiter,
} from '../middleware/ratelimiter.middleware.js';

const router = Router();

// ==========================================
// PUBLIC ROUTES
// ==========================================
// These routes do not require an authentication token.

// Account creation and email verification
router.post('/register', registerLimiter, authController.register);
router.get('/verify-email/:token', authController.verifyEmail);

// Authentication and token management
router.post('/login', loginLimiter, authController.login);
router.post('/refresh-token', authController.refreshToken);

// Password recovery flow
router.post('/forgot-password', forgotPasswordLimiter, authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);

// ==========================================
// PROTECTED ROUTES
// ==========================================
// These routes require a valid JWT via the 'protect' middleware.

router.use(protect);

// Session management
router.post('/logout', authController.logout);
router.post('/logout-all', authController.logoutAll);

// User profile and settings
router.get('/me', authController.getMe);
router.patch('/change-password', authController.changePassword);

export default router;