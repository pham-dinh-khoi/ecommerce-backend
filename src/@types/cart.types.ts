// ─── Session Cart Item (Stored in Redis, not MongoDB) ───────────────────────
// Keep it compact since Redis serializes structures into string key/value pairs

export interface ISessionCartItem {
  productId: string;
  variantId: string;
  sku: string;
  name: string;
  image?: string;
  price: number;
  quantity: number;
  stock: number;
  addedAt: string; // ISO string format since Redis does not natively support Date objects
}

export interface ISessionCart {
  items: ISessionCartItem[];
  totalItems: number;
  totalAmount: number;
  updatedAt: string;
}

// Key format: session_cart:{guestId}
// guestId is generated on the client side and persisted in localStorage/cookies
// Example: session_cart:abc123xyz
export const SESSION_CART_PREFIX = 'session_cart:';
export const SESSION_CART_TTL = 60 * 60 * 24 * 7; // 7 days in seconds

// ─── Shared Payloads for Session and Persistent Carts ───────────────────────

export interface AddToCartPayload {
  productId: string;
  variantId: string;
  quantity: number;
}

export interface UpdateCartItemPayload {
  quantity: number;
}

// ─── Unified Service Response Format ────────────────────────────────────────

export interface CartItemResult {
  productId: string;
  variantId: string;
  sku: string;
  name: string;
  image?: string;
  price: number;
  quantity: number;
  stock: number;
  subtotal: number;
  isAvailable: boolean; // False if the product is inactive or out of stock
  addedAt: string;
}

export interface CartResult {
  items: CartItemResult[];
  totalItems: number;
  totalAmount: number;
  updatedAt: string;
}