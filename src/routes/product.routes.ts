import { Router } from 'express';
import * as productController from '../controllers/product.controller.js';
import { protect, restrictTo, optionalAuth } from '../middleware/auth.middleware.js';
import { uploadProductImages, uploadVariantImages } from '../middleware/upload.middleware.js';

const router = Router();

// ==========================================
// PUBLIC ROUTES
// ==========================================
// Accessible to guests and authenticated users.

// Get list of products (optionalAuth enables personalized UX like wishlists)
router.get('/', optionalAuth, productController.getProducts);

// Get a specific product by ID or Slug
router.get('/:idOrSlug', productController.getProductById);

// ==========================================
// ADMIN ROUTES
// ==========================================
// Requires both authentication and 'admin' role.

router.use(protect, restrictTo('admin'));

// --- Product Management ---
router.post('/', uploadProductImages, productController.createProduct);
router.patch('/:id', productController.updateProduct);
router.delete('/:id', productController.deleteProduct);
router.delete('/:id/permanent', productController.permanentlyDeleteProduct);

// --- Product Image Management ---
router.post('/:id/image', uploadProductImages, productController.addProductImages);
router.delete('/:id/images/:publicId', productController.deleteProductImage);
router.patch('/:id/images/:publicId/primary', productController.setPrimaryImage);
router.patch('/:id/images/reorder', productController.reorderImages);

// --- Product Variants ---
router.post('/:id/variants', uploadVariantImages, productController.addVariant);
router.patch('/:id/variants/:variantId', productController.updateVariant);
router.delete('/:id/variants/:variantId', productController.deleteVariant);

export default router;
