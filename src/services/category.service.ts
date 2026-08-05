import { Category, type ICategory } from '../models/category.model.js';
import { deleteImage, uploadImage } from './cloudinary.service.js';
import { AppError } from '../utils/AppError.js';
import type {
  CreateCategoryInput,
  UpdateCategoryInput,
} from '../validations/category.validation.js';
import { Product } from '../models/product.model.js';

// ==========================================
// QUERIES
// ==========================================

/**
 * Retrieves the category tree structure (up to 3 levels deep).
 * Uses .populate() with match/options to ensure only active items appear.
 */
export const getCategoryTree = async (): Promise<ICategory[]> => {
  const categories = await Category.find({ parent: null, isActive: true })
    .sort({ sortOrder: 1, name: 1 })
    .populate({
      path: 'children',
      match: { isActive: true },
      options: { sort: { sortOrder: 1 } },
      populate: {
        path: 'children',
        match: { isActive: true },
        options: { sort: { sortOrder: 1 } },
      },
    })
    .lean();

  return categories as unknown as ICategory[];
};

/**
 * Retrieves a flat list of all categories. Useful for Admin dashboards.
 */
export const getAllCategories = async (includeInactive = false) => {
  const filter = includeInactive ? {} : { isActive: true };
  return Category.find(filter).select('-__v').sort({ level: 1, sortOrder: 1, name: 1 }).lean();
};

export const getCategoryById = async (id: string) => {
  const category = await Category.findById(id).populate('children').lean();
  if (!category) throw new AppError('Category not found', 404);
  return category;
};

// ==========================================
// MUTATIONS
// ==========================================

export const createCategory = async (
  data: CreateCategoryInput,
  imageFile?: Express.Multer.File
): Promise<ICategory> => {
  // Validate parent hierarchy depth
  if (data.parent) {
    const parentExists = await Category.findById(data.parent);
    if (!parentExists) throw new AppError('Parent category does not exist', 404);
    if (parentExists.level >= 2) {
      throw new AppError('Categories only support up to 3 levels deep', 400);
    }
  }

  let image: { url: string; publicId: string } | undefined;
  if (imageFile) {
    const result = await uploadImage(imageFile.buffer, 'categories', {
      width: 600,
      height: 400,
    });
    image = { url: result.secure_url, publicId: result.public_id };
  }

  return await Category.create({ ...data, image } as any);
};

export const updateCategory = async (
  id: string,
  data: UpdateCategoryInput,
  imageFile?: Express.Multer.File
): Promise<ICategory> => {
  const category = await Category.findById(id);
  if (!category) throw new AppError('Category not found', 404);

  // Prevent cyclical or invalid parent assignments
  if (data.parent) {
    if (data.parent === id) throw new AppError('Category cannot be its own parent', 400);

    const parentExists = await Category.findById(data.parent);
    if (!parentExists) throw new AppError('Parent category does not exist', 404);

    // Ensure parent is not actually a child of this category
    const isDescendant = parentExists.ancestors.some(a => a._id.toString() === id);
    if (isDescendant) throw new AppError('Cannot set a descendant as the parent', 400);
  }

  // Handle Image Update: Delete old, Upload new
  if (imageFile) {
    if (category.image) {
      if (category.image?.publicId) {
        await deleteImage(category.image.publicId).catch(() => {});
      }
    }
    const result = await uploadImage(imageFile.buffer, 'categories', {
      width: 600,
      height: 400,
    });
    category.image = { url: result.secure_url, publicId: result.public_id };
  }

  // Save the OLD name/slug before overwriting, to ensure the change is genuine.
  const oldName = category.name;
  const oldSlug = category.slug;

  Object.assign(category, data);
  await category.save(); // pre('save') automatically generates a new slug if the name changes.

  // Nếu tên hoặc slug thực sự thay đổi, cascade cập nhật xuống toàn bộ con cháu
  if (category.name !== oldName || category.slug !== oldSlug) {
    await cascadeUpdateAncestors(category);
  }

  return category;
};

export const deleteCategory = async (id: string): Promise<void> => {
  const category = await Category.findById(id);
  if (!category) throw new AppError('Category not found', 404);

  // Protection: Prevent deletion if children exist
  const childCount = await Category.countDocuments({ parent: id });
  if (childCount > 0) {
    throw new AppError(
      `Category has ${childCount} sub-categories. Please delete children first.`,
      400
    );
  }

  // Protection: Prevent deletion if products are assigned
  // Note: We check even archived/inactive products to maintain integrity
  const productCount = await Product.countDocuments({ category: id });
  if (productCount > 0) {
    throw new AppError(`Category has ${productCount} products assigned. Move them first.`, 400);
  }

  if (category.image?.publicId) {
    await deleteImage(category.image.publicId).catch(() => {});
  }

  await category.deleteOne();
};

/**
 * Cascade update: When a Category changes its name/slug, update the corresponding element
 * in the "ancestors" array of ALL descendants (at all levels), so that
 * the breadcrumb always displays correctly and doesn't become "outdated".
 */
const cascadeUpdateAncestors = async (updatedCategory: ICategory): Promise<void> => {
  // Find all categories that contain updatedCategory in their "ancestors" (children, grandchildren, at all levels).
  const descendants = await Category.find({ 'ancestors._id': updatedCategory._id });

  for (const descendant of descendants) {
    // Update the ancestors element that matches the _id, keeping the other elements unchanged.
    descendant.ancestors = descendant.ancestors.map(a =>
      a._id.toString() === updatedCategory._id.toString()
        ? { _id: updatedCategory._id, name: updatedCategory.name, slug: updatedCategory.slug }
        : a
    );
    await descendant.save({ validateBeforeSave: false }); // tránh trigger lại pre('save') tính ancestors từ parent (không cần thiết ở đây)
  }
};
