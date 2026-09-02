import type { Request, Response } from 'express';
import { catchAsync, AppError } from '../utils/AppError.js';
import type { AuthRequest } from '../@types/auth.types.js';
import * as sessionCartService from '../services/session-cart.service.js';
import * as persistentCartService from '../services/persistent-cart.service.js';
import { addToCartSchema, updateCartItemSchema } from '../validations/cart.validation.js';

// ─── Helper: Retrieve guestId from Headers or Query ─────────────────────────
// The client (browser/app) generates a random guestId, persists it in localStorage/cookies,
// and sends it with every request via the X-Guest-Id header

const getGuestId = (req: Request): string | undefined => {
  return (req.headers['x-guest-id'] as string) || undefined;
};

// ─── GET /cart ────────────────────────────────────────────────────────────────

export const getCart = catchAsync(async (req: AuthRequest, res: Response) => {
  if (req.user) {
    const cart = await persistentCartService.syncCartPrices(req.user.userId);
    res.json({ success: true, message: 'OK', data: cart });
    return;
  }

  const guestId = getGuestId(req);
  if (!guestId) {
    res.json({
      success: true,
      message: 'OK',
      data: { items: [], totalItems: 0, totalAmount: 0, updatedAt: new Date().toISOString() },
    });
    return;
  }

  const cart = await sessionCartService.getSessionCart(guestId);
  await sessionCartService.sessionRefreshTTL(guestId);
  res.json({ success: true, message: 'OK', data: sessionCartService.formatSessionCart(cart) });
});

// ─── POST /cart/items ─────────────────────────────────────────────────────────

export const addItem = catchAsync(async (req: AuthRequest, res: Response) => {
  const input = addToCartSchema.parse(req.body);

  if (req.user) {
    const cart = await persistentCartService.addItem(req.user.userId, input);
    res.status(201).json({ success: true, message: 'Item added to cart successfully', data: cart });
    return;
  }

  const guestId = getGuestId(req);
  if (!guestId) throw new AppError('Missing X-Guest-Id header', 400);

  const cart = await sessionCartService.sessionAddItem(guestId, input);
  res.status(201).json({
    success: true,
    message: 'Item added to cart successfully',
    data: sessionCartService.formatSessionCart(cart),
  });
});

// ─── PATCH /cart/items/:variantId ─────────────────────────────────────────────

export const updateItem = catchAsync(async (req: AuthRequest, res: Response) => {
  const variantId = req.params.variantId as string;
  const input = updateCartItemSchema.parse(req.body);

  if (req.user) {
    const cart = await persistentCartService.updateItem(req.user.userId, variantId, input);
    res.json({ success: true, message: 'Cart updated successfully', data: cart });
    return;
  }

  const guestId = getGuestId(req);
  if (!guestId) throw new AppError('Missing X-Guest-Id header', 400);

  const cart = await sessionCartService.sessionUpdateItem(guestId, variantId, input);
  res.json({
    success: true,
    message: 'Cart updated successfully',
    data: sessionCartService.formatSessionCart(cart),
  });
});

// ─── DELETE /cart/items/:variantId ────────────────────────────────────────────

export const removeItem = catchAsync(async (req: AuthRequest, res: Response) => {
  const variantId = req.params.variantId as string;

  if (req.user) {
    const cart = await persistentCartService.removeItem(req.user.userId, variantId);
    res.json({ success: true, message: 'Item removed from cart successfully', data: cart });
    return;
  }

  const guestId = getGuestId(req);
  if (!guestId) throw new AppError('Missing X-Guest-Id header', 400);

  const cart = await sessionCartService.sessionRemoveItem(guestId, variantId);
  res.json({
    success: true,
    message: 'Item removed from cart successfully',
    data: sessionCartService.formatSessionCart(cart),
  });
});

// ─── DELETE /cart ─────────────────────────────────────────────────────────────

export const clearCart = catchAsync(async (req: AuthRequest, res: Response) => {
  if (req.user) {
    await persistentCartService.clearCart(req.user.userId);
    res.json({ success: true, message: 'Cart cleared successfully' });
    return;
  }

  const guestId = getGuestId(req);
  if (guestId) await sessionCartService.sessionClearCart(guestId);

  res.json({ success: true, message: 'Cart cleared successfully' });
});
