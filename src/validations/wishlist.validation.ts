import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'ID không hợp lệ');

export const productIdParamSchema = z.object({
  productId: objectId,
});

export const wishlistQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type ProductIdParamInput = z.infer<typeof productIdParamSchema>;
export type WishlistQueryInput = z.infer<typeof wishlistQuerySchema>;