import { Router } from 'express';
import * as categoryController from '../controllers/category.controller.js';
import { protect, restrictTo } from '../middleware/auth.middleware.js';
import { uploadCategoryImage } from '../middleware/upload.middleware.js';

const router = Router();

// ==========================================
// PUBLIC ROUTES
// ==========================================
// These routes are accessible to all users (customers, guests).

// List all categories
router.get('/', categoryController.getAllCategories);

// Get hierarchy (e.g., parent-child category structure)
router.get('/tree', categoryController.getCategoryTree);

// Get specific category details
router.get('/:id', categoryController.getCategoryById);

// ==========================================
// ADMIN ROUTES
// ==========================================
// Middleware:
// 1. protect: Requires a valid JWT.
// 2. restrictTo('admin'): Requires the user role to be 'admin'.

router.use(protect, restrictTo('admin'));

// Create a new category (includes image upload)
router.post('/', uploadCategoryImage, categoryController.createCategory);

// Update a category (includes image upload)
router.patch('/:id', uploadCategoryImage, categoryController.updateCategory);

// Delete a category
router.delete('/:id', categoryController.deleteCategory);

export default router;