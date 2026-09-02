import { z } from 'zod';

// ============================================================================
// 1. SHARED UTILITIES
// ============================================================================

/**
 * Standard MongoDB ObjectId validator.
 * Centralizing this ensures consistency across all category/product/variant schemas.
 */
const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'ID không hợp lệ');

// ============================================================================
// 2. CATEGORY VALIDATION
// ============================================================================

const categoryBaseSchema = z.object({
  name: z
    .string({ message: 'Tên danh mục là bắt buộc' })
    .min(2, 'Tên ít nhất 2 ký tự')
    .max(100, 'Tên không quá 100 ký tự')
    .trim(),
  description: z.string().max(500, 'Mô tả không quá 500 ký tự').optional(),
  parent: objectId.optional(),
  sortOrder: z.coerce.number().int().min(0).default(0),
  isActive: z.coerce.boolean().default(true),
});

export const createCategorySchema = categoryBaseSchema;
export const updateCategorySchema = categoryBaseSchema.partial();

// ============================================================================
// 3. VARIANT VALIDATION
// ============================================================================

const variantAttributeSchema = z.object({
  name: z.string().min(1, 'Tên thuộc tính không được rỗng').trim(),
  value: z.string().min(1, 'Giá trị thuộc tính không được rỗng').trim(),
});

/**
 * variantSchema
 * Defines the physical properties of a product (Stock Keeping Unit).
 * We enforce that 'price' must be positive and 'stock' cannot be negative.
 */
export const variantSchema = z.object({
  sku: z
    .string({ message: 'SKU là bắt buộc' })
    .min(2, 'SKU ít nhất 2 ký tự')
    .max(50, 'SKU không quá 50 ký tự')
    .trim()
    .toUpperCase(),
  attributes: z.array(variantAttributeSchema).min(1, 'Biến thể phải có ít nhất một thuộc tính'),
  price: z.coerce.number({ message: 'Giá là bắt buộc' }).positive('Giá phải lớn hơn 0'),
  comparePrice: z.coerce.number().positive().optional(),
  stock: z.coerce.number().int().min(0, 'Tồn kho không thể âm').default(0),
  weight: z.coerce.number().positive().optional(),
  barcode: z.string().trim().optional(),
  isActive: z.coerce.boolean().default(true),
});

// ============================================================================
// 4. PRODUCT VALIDATION
// ============================================================================

const productBaseFields = z.object({
  name: z
    .string({ message: 'Tên sản phẩm là bắt buộc' })
    .min(3, 'Tên ít nhất 3 ký tự')
    .max(200, 'Tên không quá 200 ký tự')
    .trim(),
  description: z.string({ message: 'Mô tả là bắt buộc' }).min(20, 'Mô tả ít nhất 20 ký tự'),
  shortDescription: z.string().max(300).optional(),
  category: objectId, // Reusing centralized objectId schema
  brand: z.string().max(100).trim().optional(),
  tags: z.array(z.string().trim().toLowerCase()).default([]),
  status: z.enum(['draft', 'active', 'inactive', 'archived']).default('draft'),
  isFeatured: z.coerce.boolean().default(false),
  metaTitle: z.string().max(70).optional(),
  metaDescription: z.string().max(160).optional(),
  variants: z.array(variantSchema).min(1, 'Sản phẩm phải có ít nhất một biến thể'),
});

/**
 * createProductSchema
 * Uses refinements to ensure data integrity before database insertion:
 * 1. SKU Uniqueness: Prevents conflicting inventory records.
 * 2. Pricing Logic: Ensures the 'comparePrice' (original price) is higher than the selling price.
 */
export const createProductSchema = productBaseFields
  .omit({ variants: true })
  .extend({ variants: z.array(variantSchema).optional().default([]) })
  .refine(
    data => {
      const skus = data.variants.map(v => v.sku);
      return new Set(skus).size === skus.length;
    },
    { message: 'SKU của các biến thể không được trùng nhau', path: ['variants'] }
  )
  .refine(
    data => {
      return data.variants.every(v => !v.comparePrice || v.comparePrice > v.price);
    },
    { message: 'Giá gốc phải lớn hơn giá bán', path: ['variants'] }
  );

// Partial allows updates to only specific fields (e.g., just description or status)
export const updateProductSchema = productBaseFields.omit({ variants: true }).partial();

export const updateVariantSchema = variantSchema.partial().extend({
  sku: variantSchema.shape.sku, // SKU acts as a key, so it remains mandatory for identification
});

// ============================================================================
// 5. QUERY PARAMETERS
// ============================================================================

/**
 * productQuerySchema
 * Defines strict filtering rules for product listing pages.
 * 'coerce' is critical here: Query params arrive as strings (e.g., "1"),
 * and this converts them to numbers automatically.
 */
export const productQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sort: z.enum(['createdAt', 'minPrice', 'rating', 'soldCount', 'name']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  keyword: z.string().trim().optional(),
  category: objectId.optional(),
  brand: z.string().trim().optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  status: z.enum(['draft', 'active', 'inactive', 'archived']).optional(),
  isFeatured: z.coerce.boolean().optional(),
  tags: z.string().optional(),
  rating: z.coerce.number().min(0).max(5).optional(),
});

// ============================================================================
// 6. TYPE EXPORTS
// ============================================================================

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ProductQueryInput = z.infer<typeof productQuerySchema>;
export type VariantInput = z.infer<typeof variantSchema>;
