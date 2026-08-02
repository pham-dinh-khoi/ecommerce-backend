/**
 * CART SERVICE
 * 
 * This service manages session-based shopping carts using Redis for fast, 
 * ephemeral storage. It performs real-time validation against MongoDB to ensure 
 * cart data (prices, stock, product status) remains consistent with the database.
 */

import { Product } from '../models/product.model.js';
import { AppError } from '../utils/AppError.js';
import { redisGet, redisSet, redisDel, redisExpire } from '../utils/redis.client.js';

// Types and Interfaces
import {
  type ISessionCart,
  type ISessionCartItem,
  SESSION_CART_PREFIX,
  SESSION_CART_TTL,
  type CartResult,
} from '../@types/cart.types.js';
import type { AddToCartInput, UpdateCartItemInput } from '../validations/cart.validation.js';

// ─── Internal Helper Functions ──────────────────────────────────────────────

/**
 * Constructs a unique Redis key for a guest user using a predefined prefix.
 */
const makeKey = (guestId: string) => `${SESSION_CART_PREFIX}${guestId}`;

/**
 * Returns a default empty cart object. 
 * Used as a fallback when a user has no active cart session.
 */
const emptyCart = (): ISessionCart => ({
  items: [],
  totalItems: 0,
  totalAmount: 0,
  updatedAt: new Date().toISOString(),
});

/**
 * Recalculates cart totals.
 * Iterates through items to compute the sum of quantities and price totals.
 */
const recalcTotals = (cart: ISessionCart): ISessionCart => ({
  ...cart,
  totalItems: cart.items.reduce((s, i) => s + i.quantity, 0),
  totalAmount: cart.items.reduce((s, i) => s + i.price * i.quantity, 0),
  updatedAt: new Date().toISOString(),
});

/**
 * Persists the cart state into Redis with a Time-To-Live (TTL).
 * This keeps the cart alive for the configured session duration.
 */
const saveCart = async (guestId: string, cart: ISessionCart): Promise<void> => {
  await redisSet(makeKey(guestId), JSON.stringify(cart), SESSION_CART_TTL);
};

/**
 * Retrieves the cart from Redis.
 * If the retrieval fails or the cart data is malformed, returns an empty cart.
 */
export const getSessionCart = async (guestId: string): Promise<ISessionCart> => {
  const raw = await redisGet(makeKey(guestId));
  if (!raw) return emptyCart();
  try {
    return JSON.parse(raw) as ISessionCart;
  } catch {
    return emptyCart();
  }
};

// ─── Data Transformation ────────────────────────────────────────────────────

/**
 * Transforms the internal Redis cart structure into a clean response object.
 * Strips technical metadata and ensures clean field presentation for the frontend.
 */
export const formatSessionCart = (cart: ISessionCart): CartResult => ({
  items: cart.items.map(item => ({
    productId: item.productId,
    variantId: item.variantId,
    sku: item.sku,
    name: item.name,
    // Use conditional spread: 'image' is omitted if it is undefined
    ...(item.image !== undefined && { image: item.image }),
    price: item.price,
    quantity: item.quantity,
    stock: item.stock,
    subtotal: item.price * item.quantity,
    isAvailable: item.stock > 0,
    addedAt: item.addedAt,
  })),
  totalItems: cart.totalItems,
  totalAmount: cart.totalAmount,
  updatedAt: cart.updatedAt,
});

// ─── Service Operations ─────────────────────────────────────────────────────

/**
 * Adds a product to the session cart.
 * Performs deep validation:
 * 1. Checks product status.
 * 2. Validates variant availability.
 * 3. Enforces inventory constraints.
 * 4. Merges quantities if the item already exists.
 */
export const sessionAddItem = async (
  guestId: string,
  input: AddToCartInput
): Promise<ISessionCart> => {
  const product = await Product.findById(input.productId);
  if (!product || product.status !== 'active') {
    throw new AppError('Product is not found or inactive', 404);
  }

  const variant = product.variants.find(v => v._id?.toString() === input.variantId);
  if (!variant || !variant.isActive) {
    throw new AppError('Product variant is not available', 404);
  }

  if (variant.stock < input.quantity) {
    throw new AppError(`Only ${variant.stock} items remaining in stock`, 400);
  }

  const cart = await getSessionCart(guestId);

  // Enforce a maximum of 50 unique items to prevent excessively large Redis payloads
  if (
    cart.items.length >= 50 &&
    !cart.items.some(i => i.productId === input.productId && i.variantId === input.variantId)
  ) {
    throw new AppError('Cart reached maximum capacity (50 items)', 400);
  }

  const existingItem = cart.items.find(
    i => i.productId === input.productId && i.variantId === input.variantId
  );

  if (existingItem) {
    const newQty = existingItem.quantity + input.quantity;
    if (newQty > variant.stock) {
      throw new AppError(
        `Insufficient stock. You have ${existingItem.quantity} in cart, total requested exceeds inventory.`,
        400
      );
    }
    existingItem.quantity = newQty;
    existingItem.price = variant.price; 
    existingItem.stock = variant.stock;
  } else {
    // Select image: Priority to primary variant image, then product image
    const image =
      variant.images.find(img => img.isPrimary)?.url ||
      variant.images[0]?.url ||
      product.images.find(img => img.isPrimary)?.url ||
      product.images[0]?.url;

    const newItem: ISessionCartItem = {
      productId: input.productId,
      variantId: input.variantId,
      sku: variant.sku,
      name: product.name,
      ...(image !== undefined && { image }),
      price: variant.price,
      quantity: input.quantity,
      stock: variant.stock,
      addedAt: new Date().toISOString(),
    };
    cart.items.push(newItem);
  }

  const updated = recalcTotals(cart);
  await saveCart(guestId, updated);
  return updated;
};

/**
 * Updates the quantity of a specific item in the cart.
 * Re-validates stock levels against the database to ensure accuracy.
 */
export const sessionUpdateItem = async (
  guestId: string,
  variantId: string,
  input: UpdateCartItemInput
): Promise<ISessionCart> => {
  const cart = await getSessionCart(guestId);
  const item = cart.items.find(i => i.variantId === variantId);
  if (!item) throw new AppError('Item not found in cart', 404);

  const product = await Product.findById(item.productId);
  const variant = product?.variants.find(v => v._id?.toString() === variantId);
  const currentStock = variant?.stock ?? item.stock;

  if (input.quantity > currentStock) {
    throw new AppError(`Only ${currentStock} items remaining in stock`, 400);
  }

  item.quantity = input.quantity;
  item.stock = currentStock;
  if (variant) item.price = variant.price;

  const updated = recalcTotals(cart);
  await saveCart(guestId, updated);
  return updated;
};

/**
 * Removes a specific item from the cart.
 */
export const sessionRemoveItem = async (
  guestId: string,
  variantId: string
): Promise<ISessionCart> => {
  const cart = await getSessionCart(guestId);
  const beforeCount = cart.items.length;
  
  cart.items = cart.items.filter(i => i.variantId !== variantId);
  if (cart.items.length === beforeCount) {
    throw new AppError('Item not found in cart', 404);
  }

  const updated = recalcTotals(cart);
  await saveCart(guestId, updated);
  return updated;
};

/**
 * Completely clears the user's cart session.
 */
export const sessionClearCart = async (guestId: string): Promise<void> => {
  await redisDel(makeKey(guestId));
};

/**
 * Extends the cart session lifespan (TTL) in Redis.
 * Useful for keeping the cart active as long as the user is browsing.
 */
export const sessionRefreshTTL = async (guestId: string): Promise<void> => {
  await redisExpire(makeKey(guestId), SESSION_CART_TTL);
};