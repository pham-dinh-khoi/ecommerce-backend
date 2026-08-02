import type { Response } from 'express';
import { catchAsync } from '../utils/AppError.js';
import type { AuthRequest } from '../@types/auth.types.js';
import * as productService from '../services/product.service.js';
import {
  createProductSchema,
  updateProductSchema,
  productQuerySchema,
  variantSchema,
  updateVariantSchema,
} from '../validations/product.validation.js';

// ==========================================
// Product Operations
// ==========================================

export const getProducts = catchAsync(async (req: AuthRequest, res: Response) => {
  const query = productQuerySchema.parse(req.query);

  // Users can only view 'active' products unless they are an admin or seller
  if (req.user?.role !== 'admin' && req.user?.role !== 'seller') {
    query.status = 'active';
  }

  const result = await productService.getProducts(query);
  res.json({ success: true, message: 'OK', ...result });
});

export const getProductById = catchAsync(async (req: AuthRequest, res: Response) => {
  const product = await productService.getProductById(req.params.idOrSlug as any);
  res.json({ success: true, message: 'OK', data: product });
});

export const createProduct = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = createProductSchema.parse({
    ...req.body,
    // Variants and tags may be sent as JSON strings from form-data
    variants:
      typeof req.body.variants === 'string' ? JSON.parse(req.body.variants) : req.body.variants,
    tags: typeof req.body.tags === 'string' ? JSON.parse(req.body.tags) : req.body.tags,
  });

  const imageFiles = (req.files as Express.Multer.File[]) || [];
  const product = await productService.createProduct(data, imageFiles, req.user!.userId);

  res.status(201).json({ success: true, message: 'Product created successfully', data: product });
});

export const updateProduct = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = updateProductSchema.parse(req.body);
  const product = await productService.updateProduct(req.params.id as any, data, req.user!.userId);
  res.json({ success: true, message: 'Product updated successfully', data: product });
});

export const deleteProduct = catchAsync(async (req: AuthRequest, res: Response) => {
  await productService.deleteProduct(req.params.id as any);
  res.json({ success: true, message: 'Product deleted successfully' });
});

export const permanentlyDeleteProduct = catchAsync(async (req: AuthRequest, res: Response) => {
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id) {
    res.status(400).json({ success: false, message: 'Missing id in the path' });
    return;
  }
  await productService.permanentlyDeleteProduct(id);
  res.json({ success: true, message: 'Đã xóa vĩnh viễn sản phẩm' });
});
// ==========================================
// Variant Operations
// ==========================================

export const addVariant = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = variantSchema.parse({
    ...req.body,
    attributes:
      typeof req.body.attributes === 'string'
        ? JSON.parse(req.body.attributes)
        : req.body.attributes,
  });
  const imageFiles = (req.files as Express.Multer.File[]) || [];
  const product = await productService.addVariant(req.params.id as any, data, imageFiles);
  res.status(201).json({ success: true, message: 'Variant added successfully', data: product });
});

export const updateVariant = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = updateVariantSchema.parse(req.body);
  const product = await productService.updateVariant(
    req.params.id as any,
    req.params.variantId as any,
    data as any
  );
  res.json({ success: true, message: 'Variant updated successfully', data: product });
});

export const deleteVariant = catchAsync(async (req: AuthRequest, res: Response) => {
  const product = await productService.deleteVariant(
    req.params.id as any,
    req.params.variantId as any
  );
  res.json({ success: true, message: 'Variant deleted successfully', data: product });
});

// ==========================================
// Image Management Operations
// ==========================================

export const addProductImages = catchAsync(async (req: AuthRequest, res: Response) => {
  const imageFiles = (req.files as Express.Multer.File[]) || [];
  if (!imageFiles.length) {
    res.status(400).json({ success: false, message: 'Please select images to upload' });
  }
  const product = await productService.addProductImages(req.params.id as any, imageFiles);
  res.status(201).json({ success: true, message: 'Images uploaded successfully', data: product });
});

export const deleteProductImage = catchAsync(async (req: AuthRequest, res: Response) => {
  const { publicId } = req.params;
  const product = await productService.deleteProductImage(
    req.params.id as any,
    decodeURIComponent(publicId as any)
  );
  res.json({ success: true, message: 'Image deleted successfully', data: product });
});

export const setPrimaryImage = catchAsync(async (req: AuthRequest, res: Response) => {
  const product = await productService.setPrimaryImage(
    req.params.id as any,
    decodeURIComponent(req.params.publicId as any)
  );
  res.json({ success: true, message: 'Primary image set successfully', data: product });
});

export const reorderImages = catchAsync(async (req: AuthRequest, res: Response) => {
  const { orderedPublicIds } = req.body as { orderedPublicIds: string[] };
  if (!Array.isArray(orderedPublicIds) || !orderedPublicIds.length) {
    res.status(400).json({ success: false, message: 'Invalid image list' });
  }
  const product = await productService.reorderImages(req.params.id as any, orderedPublicIds);
  res.json({ success: true, message: 'Images reordered successfully', data: product });
});
