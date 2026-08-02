import { Cart, type ICart, type ICartItem } from '../models/cart.model.js';
import { Product } from '../models/product.model.js';
import { AppError } from '../utils/AppError.js';
import type { CartResult } from '../@types/cart.types.js';
import type { AddToCartInput, UpdateCartItemInput } from '../validations/cart.validation.js';

// ==========================================
// HELPERS
// ==========================================

/**
 * Maps the MongoDB cart document into a standardized `CartResult` for the frontend.
 */
export const formatPersistentCart = (cart: ICart): CartResult => ({
  items: cart.items.map(item => ({
    productId: item.product.toString(),
    variantId: item.variant.toString(),
    sku: item.sku,
    name: item.name,
    ...(item.image && { image: item.image }),
    price: item.price,
    quantity: item.quantity,
    stock: item.stock,
    subtotal: item.price * item.quantity,
    isAvailable: item.stock > 0,
    addedAt: item.addedAt.toISOString(),
  })),
  totalItems: cart.totalItems,
  totalAmount: cart.totalAmount,
  updatedAt: cart.updatedAt.toISOString(),
});

/**
 * Retrieves the user's cart or creates an empty one if it doesn't exist (Upsert pattern).
 */
const getOrCreateCart = async (userId: string): Promise<ICart> => {
  let cart = await Cart.findOne({ user: userId });
  if (!cart) {
    cart = await Cart.create({ user: userId, items: [] });
  }
  return cart;
};

// ==========================================
// CART OPERATIONS
// ==========================================

/**
 * Retrieves the user's cart and formats it for response.
 */
export const getCart = async (userId: string): Promise<CartResult> => {
  const cart = await getOrCreateCart(userId);
  return formatPersistentCart(cart);
};

/**
 * Adds an item to the cart or increases the quantity if already present.
 */
export const addItem = async (userId: string, input: AddToCartInput): Promise<CartResult> => {
  // 1. Verify product existence and status
  const product = await Product.findById(input.productId);
  if (!product || product.status !== 'active') {
    throw new AppError('Product not found or currently unavailable', 404);
  }

  // 2. Verify variant existence and status
  const variant = product.variants.find(v => v._id?.toString() === input.variantId);
  if (!variant || !variant.isActive) {
    throw new AppError('Product variant not found', 404);
  }

  // 3. Verify stock availability
  if (variant.stock < input.quantity) {
    throw new AppError(`Only ${variant.stock} units left in stock`, 400);
  }

  // 4. Get current cart
  const cart = await getOrCreateCart(userId);

  // 5. Check cart capacity (limit to 50 unique items)
  if (cart.items.length >= 50 && !cart.items.some(i => i.variant.toString() === input.variantId)) {
    throw new AppError('Cart limit reached (50 unique items)', 400);
  }

  // 6. Check for existing item
  const existingItem = cart.items.find(
    i => i.product.toString() === input.productId && i.variant.toString() === input.variantId
  );

  if (existingItem) {
    const newQty = existingItem.quantity + input.quantity;
    if (newQty > variant.stock) {
      throw new AppError(
        `Only ${variant.stock} units left in stock; you already have ${existingItem.quantity} in your cart`,
        400
      );
    }
    existingItem.quantity = newQty;
    existingItem.price = variant.price;
    existingItem.stock = variant.stock;
  } else {
    // Select primary image or fallback to the first available image
    const image =
      variant.images.find(img => img.isPrimary)?.url ||
      variant.images[0]?.url ||
      product.images.find(img => img.isPrimary)?.url ||
      product.images[0]?.url;

    cart.items.push({
      product: product._id,
      variant: variant._id!,
      sku: variant.sku,
      name: product.name,
      image,
      price: variant.price,
      quantity: input.quantity,
      stock: variant.stock,
      addedAt: new Date(),
    } as ICartItem);
  }

  // 7. Save cart (Pre-save middleware recalculates totals)
  await cart.save();
  return formatPersistentCart(cart);
};

/**
 * Updates the quantity of a specific item in the cart.
 */
export const updateItem = async (
  userId: string,
  variantId: string,
  input: UpdateCartItemInput
): Promise<CartResult> => {
  const cart = await Cart.findOne({ user: userId });
  if (!cart) throw new AppError('Cart not found', 404);

  const item = cart.items.find(i => i.variant.toString() === variantId);
  if (!item) throw new AppError('Item not found in cart', 404);

  // Re-sync current stock from DB
  const product = await Product.findById(item.product);
  const variant = product?.variants.find(v => v._id?.toString() === variantId);
  const currentStock = variant?.stock ?? item.stock;

  if (input.quantity > currentStock) {
    throw new AppError(`Only ${currentStock} units available in stock`, 400);
  }

  item.quantity = input.quantity;
  item.stock = currentStock;
  if (variant) item.price = variant.price;

  await cart.save();
  return formatPersistentCart(cart);
};

/**
 * Removes a specific item from the cart.
 */
export const removeItem = async (userId: string, variantId: string): Promise<CartResult> => {
  const cart = await Cart.findOne({ user: userId });
  if (!cart) throw new AppError('Cart not found', 404);

  const before = cart.items.length;
  cart.items = cart.items.filter(i => i.variant.toString() !== variantId);
  if (cart.items.length === before) throw new AppError('Item not found in cart', 404);

  await cart.save();
  return formatPersistentCart(cart);
};

/**
 * Empties the user's cart.
 */
export const clearCart = async (userId: string): Promise<void> => {
  await Cart.findOneAndUpdate(
    { user: userId },
    { $set: { items: [], totalItems: 0, totalAmount: 0 } }
  );
};

/**
 * Synchronizes cart items with current product/variant data (prices, stock, availability).
 * Automatically removes products that are no longer active.
 */
export const syncCartPrices = async (userId: string): Promise<CartResult> => {
  const cart = await getOrCreateCart(userId);
  if (cart.items.length === 0) return formatPersistentCart(cart);

  const productIds = [...new Set(cart.items.map(i => i.product.toString()))];
  const products = await Product.find({ _id: { $in: productIds } });
  const productMap = new Map(products.map(p => [p._id.toString(), p]));

  let changed = false;

  cart.items = cart.items.filter(item => {
    const product = productMap.get(item.product.toString());
    // Filter out inactive products or deleted ones
    if (!product || product.status !== 'active') {
      changed = true;
      return false;
    }

    const variant = product.variants.find(v => v._id?.toString() === item.variant.toString());
    // Filter out inactive variants
    if (!variant || !variant.isActive) {
      changed = true;
      return false;
    }

    // Sync price and stock updates
    if (item.price !== variant.price || item.stock !== variant.stock) {
      item.price = variant.price;
      item.stock = variant.stock;
      item.name = product.name;
      changed = true;
    }

    return true;
  });

  if (changed) await cart.save();
  return formatPersistentCart(cart);
};
