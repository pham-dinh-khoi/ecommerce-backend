import { Cart } from '../models/cart.model.js';
import { Product } from '../models/product.model.js';
import { getSessionCart, sessionClearCart } from './session-cart.service.js';
import { getCart, formatPersistentCart, syncCartPrices } from './persistent-cart.service.js';
import type { CartResult, ISessionCartItem } from '../@types/cart.types.js';

export type MergeStrategy = 'add' | 'keep_max' | 'prefer_db';

/**
 * Merges a guest's temporary cart (Redis) into their permanent user cart (MongoDB)
 * upon successful login.
 *
 * @param userId ID of the logged-in user
 * @param guestId Temporary ID of the guest session (if any)
 * @param strategy Conflict resolution strategy (default: 'add')
 */
export const mergeCartsOnLogin = async (
  userId: string,
  guestId: string | undefined,
  strategy: MergeStrategy = 'add'
): Promise<CartResult> => {
  // 1. Skip merge if no guest ID exists or 'prefer_db' strategy is chosen
  if (!guestId || strategy === 'prefer_db') {
    return syncCartPrices(userId);
  }

  // 2. Fetch the temporary guest cart from Redis
  const sessionCart = await getSessionCart(guestId);

  // If session cart is empty, just sync the existing DB cart prices
  if (sessionCart.items.length === 0) {
    return syncCartPrices(userId);
  }

  // 3. Retrieve or create the user's permanent cart in MongoDB (Upsert Pattern)
  let dbCart = await Cart.findOne({ user: userId });
  if (!dbCart) {
    dbCart = await Cart.create({ user: userId, items: [] });
  }

  // 4. Performance optimization: Fetch all relevant products in one batch query
  const sessionProductIds = [...new Set(sessionCart.items.map(i => i.productId))];
  const products = await Product.find({
    _id: { $in: sessionProductIds },
    status: 'active',
  });
  const productMap = new Map(products.map(p => [p._id.toString(), p]));

  // 5. Iterate through session items and merge into the DB cart
  for (const sessionItem of sessionCart.items) {
    const product = productMap.get(sessionItem.productId);
    if (!product) continue; // Skip if product is missing or inactive

    const variant = product.variants.find(
      v => v._id?.toString() === sessionItem.variantId.toString()
    );

    if (!variant || !variant.isActive) continue; // Skip if variant is missing or inactive

    // Check if the item already exists in the persistent DB cart
    const existingDbItem = dbCart.items.find(i => i.variant.toString() === sessionItem.variantId);

    if (existingDbItem) {
      // CASE A: Item exists in both -> Resolve conflict via strategy
      let targetQty: number;

      switch (strategy) {
        case 'add':
          targetQty = existingDbItem.quantity + sessionItem.quantity;
          break;
        case 'keep_max':
          targetQty = Math.max(existingDbItem.quantity, sessionItem.quantity);
          break;
        default:
          targetQty = existingDbItem.quantity;
      }

      // Cap quantity to current stock levels
      existingDbItem.quantity = Math.min(targetQty, variant.stock);
      existingDbItem.price = variant.price; // Update to latest price
      existingDbItem.stock = variant.stock;
    } else {
      // CASE B: Item only in session cart -> Add to DB cart
      if (dbCart.items.length >= 50) break; // Cart limit enforcement (50 items max)

      // Ensure we don't add more than available stock
      const quantity = Math.min(sessionItem.quantity, variant.stock);
      if (quantity <= 0) continue;

      // Image fallback logic: Variant primary -> Variant first -> Product primary -> Product first
      const image =
        variant.images.find(img => img.isPrimary)?.url ||
        variant.images[0]?.url ||
        product.images.find(img => img.isPrimary)?.url ||
        product.images[0]?.url;

      // Add as a snapshot to the database cart
      dbCart.items.push({
        product: product._id,
        variant: variant._id!,
        sku: variant.sku,
        name: product.name,
        image,
        price: variant.price,
        quantity,
        stock: variant.stock,
        addedAt: new Date(sessionItem.addedAt),
      } as any);
    }
  }

  // 6. Persist changes (Mongoose pre-save hooks will recalculate total price/quantity)
  await dbCart.save();

  // 7. Cleanup: Delete the temporary guest cart from Redis to avoid duplicates
  await sessionClearCart(guestId);

  // 8. Return formatted persistent cart
  return formatPersistentCart(dbCart);
};
