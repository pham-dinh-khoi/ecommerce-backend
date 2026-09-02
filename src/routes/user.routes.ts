import { Router } from 'express';
import * as userController from '../controllers/user.controller.js';
import { protect, restrictTo } from '../middleware/auth.middleware.js';
import { uploadAvatar } from '../middleware/upload.middleware.js';

const router = Router();

// ==========================================
// AUTHENTICATION GUARD
// ==========================================
// All routes require the user to be logged in.
router.use(protect);

// ==========================================
// SELF-PROFILE MANAGEMENT
// ==========================================

// Manage user account profile
router.get('/me', userController.getProfile);
router.patch('/me', userController.updateProfile);

// Avatar management
router.patch('/me/avatar', uploadAvatar, userController.updateAvatar);
router.delete('/me/avatar', userController.deleteAvatar);

// ==========================================
// ADDRESS MANAGEMENT
// ==========================================

// Get list of saved addresses
router.get('/me/addresses', userController.getAddresses);

// CRUD operations for addresses
router.post('/me/addresses', userController.addAddress);
router.patch('/me/addresses/:addressId', userController.updateAddress);
router.delete('/me/addresses/:addressId', userController.deleteAddress);

// Set specific address as the default
router.patch('/me/addresses/:addressId/default', userController.setDefaultAddress);

// ==========================================
// ADMIN USER MANAGEMENT
// ==========================================
// Requires 'admin' role.

// Namespace for admin-only user operations
router.use('/admin', restrictTo('admin'));

// Admin CRUD operations
router.get('/admin', userController.adminGetUsers);
router.get('/admin/:id', userController.adminGetUserById);
router.patch('/admin/:id', userController.adminUpdateUser);
router.delete('/admin/:id', userController.adminDeleteUser);

export default router;
