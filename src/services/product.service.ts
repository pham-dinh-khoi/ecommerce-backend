import mongoose from 'mongoose';
import {
  Product,
  type IProduct,
  type IProductImage,
  type IProductVariant,
} from '../models/product.model.js';
import { Review } from '../models/review.model.js';
import { Category } from '../models/category.model.js';
import { uploadImages, deleteImage, deleteImages } from '../services/cloudinary.service.js';
import { AppError } from '../utils/AppError.js';
import type { PaginationResult } from '../@types/product.types.js';
import type {
  CreateProductInput,
  UpdateProductInput,
  ProductQueryInput,
  VariantInput,
} from '../validations/product.validation.js';

// ─── UTILS ───────────────────────────────────────────────────────────────────

// Lazy import to prevent circular dependency
const invalidateCache = () =>
  import('./search.service.js').then(m => m.invalidateSearchCache()).catch(() => {});

// ==========================================
// PRODUCT QUERIES
// ==========================================

/**
 * Retrieves a paginated list of products based on filters.
 */
export const getProducts = async (
  query: ProductQueryInput
): Promise<{ products: IProduct[]; pagination: PaginationResult }> => {
  const {
    page,
    limit,
    sort,
    order,
    keyword,
    category,
    brand,
    minPrice,
    maxPrice,
    status,
    isFeatured,
    tags,
    rating,
  } = query;

  const filter: mongoose.QueryFilter<IProduct> = {};

  if (keyword) filter.$text = { $search: keyword };
  if (category) {
    const categoryIds = await getDescendantCategoryIds(category);
    filter.category = { $in: categoryIds };
  }
  if (brand) filter.brand = new RegExp(brand, 'i');
  if (minPrice !== undefined || maxPrice !== undefined) {
    filter.minPrice = {};
    if (minPrice !== undefined) filter.minPrice.$gte = minPrice;
    if (maxPrice !== undefined) filter.minPrice.$lte = maxPrice;
  }

  filter.status = status || { $ne: 'archived' };

  if (isFeatured !== undefined) filter.isFeatured = isFeatured;
  if (tags) filter.tags = { $in: tags.split(',').map(t => t.trim()) };
  if (rating !== undefined) filter['rating.average'] = { $gte: rating };

  const skip = (page - 1) * limit;
  const sortOption: Record<string, 1 | -1> = { [sort]: order === 'asc' ? 1 : -1 };

  const [products, total] = await Promise.all([
    Product.find(filter)
      .populate('category', 'name slug')
      .select('-__v -description')
      .sort(sortOption)
      .skip(skip)
      .limit(limit)
      .lean(),
    Product.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    products: products as unknown as IProduct[],
    pagination: {
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
};

/**
 * Retrieves detailed information for a specific product.
 */
export const getProductById = async (idOrSlug: string): Promise<IProduct> => {
  const isObjectId = mongoose.Types.ObjectId.isValid(idOrSlug);
  const filter = isObjectId ? { _id: idOrSlug } : { slug: idOrSlug };

  const product = await Product.findOne(filter)
    .populate('category', 'name slug ancestors')
    .populate('createdBy', 'name email');

  if (!product) throw new AppError('Product not found', 404);

  // Increment view count (fire-and-forget)
  Product.findByIdAndUpdate(product._id, { $inc: { viewCount: 1 } }).exec();

  return product;
};

// ==========================================
// PRODUCT MANAGEMENT
// ==========================================

/**
 * Creates a new product and handles initial image uploads.
 */
export const createProduct = async (
  data: CreateProductInput,
  imageFiles: Express.Multer.File[],
  userId: string
): Promise<IProduct> => {
  const category = await Category.findById(data.category);
  if (!category) throw new AppError('Category not found', 404);
  if (!category.isActive) throw new AppError('Category is disabled', 400);

  const skus = data.variants.map(v => v.sku);
  const existingSkus = await checkDuplicateSkus(skus);
  if (existingSkus.length > 0) {
    throw new AppError(`SKU already exists: ${existingSkus.join(', ')}`, 400);
  }

  let images: IProductImage[] = [];
  if (imageFiles.length > 0) {
    const uploaded = await uploadImages(imageFiles, 'products');
    images = uploaded.map((r, idx) => ({
      url: r.secure_url,
      publicId: r.public_id,
      alt: data.name,
      isPrimary: idx === 0,
      sortOrder: idx,
    }));
  }

  const product = await Product.create({
    ...data,
    images,
    createdBy: userId,
    updatedBy: userId,
  } as any);

  invalidateCache();
  return product.populate('category', 'name slug');
};

/**
 * Updates basic product information.
 */
export const updateProduct = async (
  id: string,
  data: UpdateProductInput,
  userId: string
): Promise<IProduct> => {
  const product = await Product.findById(id);
  if (!product) throw new AppError('Product not found', 404);

  if (data.category) {
    const category = await Category.findById(data.category);
    if (!category) throw new AppError('Category not found', 404);
  }

  Object.assign(product, { ...data, updatedBy: userId });
  await product.save();

  invalidateCache();
  return product.populate('category', 'name slug');
};

/**
 * Archives a product (Soft Delete).
 */
export const deleteProduct = async (id: string): Promise<void> => {
  const product = await Product.findById(id);
  if (!product) throw new AppError('Product not found', 404);

  if (product.status === 'archived') {
    throw new AppError('Product is already archived', 400);
  }

  product.status = 'archived';
  await product.save();
  invalidateCache();
};

export const permanentlyDeleteProduct = async (id: string): Promise<void> => {
  const product = await Product.findById(id);
  if (!product) throw new AppError('Không tìm thấy sản phẩm', 404);

  if (product.status !== 'archived') {
    throw new AppError('Chỉ có thể xóa vĩnh viễn sản phẩm đã được lưu trữ', 400);
  }

  // 1. Xóa toàn bộ Review liên quan (kèm ảnh review trên Cloudinary nếu có)
  const relatedReviews = await Review.find({ product: id }).select('images');
  const reviewImagePublicIds = relatedReviews
    .flatMap(r => r.images.map(img => img.publicId))
    .filter(Boolean);

  if (reviewImagePublicIds.length > 0) {
    await deleteImages(reviewImagePublicIds).catch(() => {}); // không chặn nếu lỗi xóa ảnh Cloudinary
  }
  await Review.deleteMany({ product: id });

  // 2. Xóa ảnh Product (chung + variants) trên Cloudinary
  const allPublicIds = [
    ...product.images.map(img => img.publicId),
    ...product.variants.flatMap(v => v.images.map(img => img.publicId)),
  ].filter(Boolean);

  if (allPublicIds.length > 0) {
    await deleteImages(allPublicIds).catch(() => {});
  }

  // 3. Xóa Product
  await product.deleteOne();

  invalidateCache();
};

// ==========================================
// VARIANT MANAGEMENT
// ==========================================

export const addVariant = async (
  productId: string,
  data: VariantInput,
  imageFiles: Express.Multer.File[]
): Promise<IProduct> => {
  const product = await Product.findById(productId);
  if (!product) throw new AppError('Product not found', 404);

  const existing = await checkDuplicateSkus([data.sku]);
  if (existing.length > 0) throw new AppError(`SKU '${data.sku}' already exists`, 400);

  let images: IProductImage[] = [];
  if (imageFiles.length > 0) {
    const uploaded = await uploadImages(imageFiles, 'products/variants');
    images = uploaded.map((r, idx) => ({
      url: r.secure_url,
      publicId: r.public_id,
      isPrimary: idx === 0,
      sortOrder: idx,
    }));
  }

  product.variants.push({ ...data, images } as IProductVariant);
  await product.save();
  return product;
};

export const updateVariant = async (
  productId: string,
  variantId: string,
  data: Partial<VariantInput>
): Promise<IProduct> => {
  const product = await Product.findById(productId);
  if (!product) throw new AppError('Product not found', 404);

  const variant = (product.variants as any).id(variantId);
  if (!variant) throw new AppError('Variant not found', 404);

  if (data.sku && data.sku !== variant.sku) {
    const existing = await checkDuplicateSkus([data.sku], productId);
    if (existing.length > 0) throw new AppError(`SKU '${data.sku}' already exists`, 400);
  }

  Object.assign(variant, data);
  await product.save();
  return product;
};

export const deleteVariant = async (productId: string, variantId: string): Promise<IProduct> => {
  const product = await Product.findById(productId);
  if (!product) throw new AppError('Product not found', 404);

  if (product.variants.length <= 1) {
    throw new AppError('Product must have at least one variant', 400);
  }

  const variant = (product.variants as any).id(variantId);
  if (!variant) throw new AppError('Variant not found', 404);

  const publicIds = variant.images.map((img: IProductImage) => img.publicId).filter(Boolean);
  await deleteImages(publicIds);

  (product.variants as any).pull(variantId);
  await product.save();
  return product;
};

// ==========================================
// IMAGE MANAGEMENT
// ==========================================

export const addProductImages = async (
  productId: string,
  imageFiles: Express.Multer.File[]
): Promise<IProduct> => {
  const product = await Product.findById(productId);
  if (!product) throw new AppError('Product not found', 404);

  if (product.images.length + imageFiles.length > 10) {
    throw new AppError('Maximum of 10 images allowed', 400);
  }

  const uploaded = await uploadImages(imageFiles, 'products');
  const currentMaxOrder = product.images.reduce((max, img) => Math.max(max, img.sortOrder), -1);

  const newImages: IProductImage[] = uploaded.map((r, idx) => ({
    url: r.secure_url,
    publicId: r.public_id,
    alt: product.name,
    isPrimary: product.images.length === 0 && idx === 0,
    sortOrder: currentMaxOrder + idx + 1,
  }));

  product.images.push(...newImages);
  await product.save();
  return product;
};

export const deleteProductImage = async (
  productId: string,
  imagePublicId: string
): Promise<IProduct> => {
  const product = await Product.findById(productId);
  if (!product) throw new AppError('Product not found', 404);

  const imageIndex = product.images.findIndex(img => img.publicId === imagePublicId);
  if (imageIndex === -1) throw new AppError('Image not found', 404);

  const wasPrimary = product.images[imageIndex]?.isPrimary;
  await deleteImage(imagePublicId);
  product.images.splice(imageIndex, 1);

  if (wasPrimary && product.images.length > 0) {
    (product.images[0] as any).isPrimary = true;
  }

  await product.save();
  return product;
};

export const setPrimaryImage = async (
  productId: string,
  imagePublicId: string
): Promise<IProduct> => {
  const product = await Product.findById(productId);
  if (!product) throw new AppError('Product not found', 404);

  const image = product.images.find(img => img.publicId === imagePublicId);
  if (!image) throw new AppError('Image not found', 404);

  product.images.forEach(img => {
    img.isPrimary = false;
  });
  image.isPrimary = true;

  await product.save();
  return product;
};

export const reorderImages = async (
  productId: string,
  orderedPublicIds: string[]
): Promise<IProduct> => {
  const product = await Product.findById(productId);
  if (!product) throw new AppError('Product not found', 404);

  orderedPublicIds.forEach((publicId, idx) => {
    const img = product.images.find(i => i.publicId === publicId);
    if (img) img.sortOrder = idx;
  });

  product.images.sort((a, b) => a.sortOrder - b.sortOrder);
  await product.save();
  return product;
};

// ==========================================
// INTERNAL HELPERS
// ==========================================

const checkDuplicateSkus = async (skus: string[], excludeProductId?: string): Promise<string[]> => {
  const filter: mongoose.QueryFilter<IProduct> = { 'variants.sku': { $in: skus } };
  if (excludeProductId) filter._id = { $ne: excludeProductId };

  const products = await Product.find(filter).select('variants.sku');
  const existingSkus = products.flatMap(p =>
    p.variants.filter(v => skus.includes(v.sku)).map(v => v.sku)
  );
  return [...new Set(existingSkus)];
};

const getDescendantCategoryIds = async (categoryId: string): Promise<mongoose.Types.ObjectId[]> => {
  const categories = await Category.find({
    $or: [{ _id: categoryId }, { 'ancestors._id': categoryId }],
  }).select('_id');
  return categories.map(c => c._id);
};
