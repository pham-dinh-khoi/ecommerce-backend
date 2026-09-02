/**
 * WISHLIST SERVICE
 *
 * This service manages user wishlists, including retrieval with product details,
 * toggling items (add/remove), and cleanup operations.
 */

import { Wishlist, type IWishlist } from '../models/wishlist.model.js';
import { Product } from '../models/product.model.js';
import { AppError } from '../utils/AppError.js';
import type { PaginationResult } from '../@types/product.types.js';

// ─── Private Helpers ─────────────────────────────────────────────────────────

/**
 * Retrieves the user's wishlist or creates a new one if it doesn't exist.
 * Ensures the service always returns a valid wishlist document.
 */
const getOrCreate = async (userId: string): Promise<IWishlist> => {
  let wishlist = await Wishlist.findOne({ user: userId });
  if (!wishlist) {
    wishlist = await Wishlist.create({ user: userId, items: [] });
  }
  return wishlist;
};

// ─── Core Service Methods ────────────────────────────────────────────────────

/**
 * Retrieves the wishlist for a user with pagination.
 *
 * Note: Since items are stored as an array within the document, we manually
 * slice the array for pagination before populating product details from the
 * Product collection.
 */
export const getWishlist = async (
  userId: string,
  page = 1,
  limit = 20
): Promise<{ items: any[]; pagination: PaginationResult }> => {
  const wishlist = await getOrCreate(userId);
  const total = wishlist.items.length;
  const totalPages = Math.ceil(total / limit);
  const skip = (page - 1) * limit;

  // Sort items by date added (newest first) and apply pagination
  const pagedItems = wishlist.items
    .sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime())
    .slice(skip, skip + limit);

  // Fetch full product details for the current page only
  const productIds = pagedItems.map(i => i.product);
  const products = await Product.find({ _id: { $in: productIds } })
    .select('name slug images minPrice maxPrice rating status totalStock variants soldCount')
    .lean();

  // Create a map for efficient lookups when joining products with wishlist items
  const productMap = new Map(products.map((p: any) => [p._id.toString(), p]));

  const items = pagedItems.map(item => ({
    wishlistItemId: item._id,
    addedAt: item.addedAt,
    product: productMap.get(item.product.toString()) || null,
  }));

  return {
    items,
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
 * Toggles a product in the wishlist.
 * - If the product exists: Removes it (Toggle Off).
 * - If the product is missing: Adds it (Toggle On).
 * Includes a hard limit of 200 items to prevent document bloat.
 */
export const toggleWishlist = async (
  userId: string,
  productId: string
): Promise<{ added: boolean; totalItems: number }> => {
  const product = await Product.findById(productId).select('_id');
  if (!product) throw new AppError('Product does not exist', 404);

  const wishlist = await getOrCreate(userId);
  const idx = wishlist.items.findIndex(i => i.product.toString() === productId);

  let added: boolean;
  if (idx >= 0) {
    // Remove item if already present
    wishlist.items.splice(idx, 1);
    added = false;
  } else {
    // Add item if not present, with a safety limit of 200
    if (wishlist.items.length >= 200) {
      throw new AppError('Wishlist limited to 200 items', 400);
    }
    wishlist.items.push({ product: product._id, addedAt: new Date() } as any);
    added = true;
  }

  await wishlist.save();
  return { added, totalItems: wishlist.items.length };
};

/**
 * Checks if a specific product exists in the user's wishlist.
 */
export const isInWishlist = async (userId: string, productId: string): Promise<boolean> => {
  const wishlist = await Wishlist.findOne({ user: userId, 'items.product': productId });
  return !!wishlist;
};

/**
 * Removes a specific product from the wishlist.
 */
export const removeFromWishlist = async (userId: string, productId: string): Promise<void> => {
  await Wishlist.findOneAndUpdate({ user: userId }, { $pull: { items: { product: productId } } });
};

/**
 * Completely clears all items from the user's wishlist.
 */
export const clearWishlist = async (userId: string): Promise<void> => {
  await Wishlist.findOneAndUpdate({ user: userId }, { $set: { items: [] } });
};
