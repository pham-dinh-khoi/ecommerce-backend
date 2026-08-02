import mongoose from 'mongoose';
import type { Request, Response } from 'express';
import { catchAsync } from '../utils/AppError.js';
import * as searchService from '../services/search.service.js';
import { searchQuerySchema } from '../validations/search.validation.js';
import type { SearchQuery } from '../@types/search.types.js';

// ─── GET /api/search ──────────────────────────────────────────────────────────

export const search = catchAsync(async (req: Request, res: Response) => {
  const parsed = searchQuerySchema.parse(req.query);

  const query: SearchQuery = {
    ...(parsed.q && { keyword: parsed.q }),
    ...(parsed.category && { categoryIds: [parsed.category] }),
    ...(parsed.brand && { brands: parsed.brand }),
    ...(parsed.minPrice !== undefined && { minPrice: parsed.minPrice }),
    ...(parsed.maxPrice !== undefined && { maxPrice: parsed.maxPrice }),
    ...(parsed.minRating !== undefined && { minRating: parsed.minRating }),
    ...(parsed.tags && { tags: parsed.tags }),
    ...(parsed.inStock !== undefined && { inStock: parsed.inStock }),
    ...(parsed.isFeatured !== undefined && { isFeatured: parsed.isFeatured }),
    sort: parsed.sort,
    page: parsed.page,
    limit: parsed.limit,
    includeFacets: parsed.facets,
  };

  const result = await searchService.searchProducts(query);

  res.json({
    success: true,
    message: 'OK',
    ...result,
  });
});

// ─── GET /api/search/autocomplete?q=iph ──────────────────────────────────────

export const autocomplete = catchAsync(async (req: Request, res: Response) => {
  const q = String(req.query.q || '').trim();
  const limit = Math.min(Number(req.query.limit) || 8, 20);

  if (q.length < 2) {
    res.json({ success: true, message: 'OK', data: [] });
    return;
  }

  const suggestions = await searchService.autocomplete(q, limit);
  res.json({ success: true, message: 'OK', data: suggestions });
});
// ─── GET /api/search/trending ─────────────────────────────────────────────────

export const trending = catchAsync(async (_req: Request, res: Response) => {
  // Sản phẩm trending = bán nhiều nhất trong 30 ngày
  const { Product } = await import('../models/product.model.js');

  const products = await Product.find({ status: 'active', totalStock: { $gt: 0 } })
    .sort({ soldCount: -1, 'rating.average': -1 })
    .limit(10)
    .select('name slug images minPrice maxPrice rating soldCount brand totalStock')
    .populate('category', 'name slug')
    .lean();

  res.json({ success: true, message: 'OK', data: products });
});

// ─── GET /api/search/similar/:productId ──────────────────────────────────────
// Sản phẩm tương tự: cùng danh mục, brand, hoặc tags

export const similarProducts = catchAsync(async (req: Request, res: Response) => {
  const { Product } = await import('../models/product.model.js');
  const productId = req.params.productId as string; // ← cast type

  const product = await Product.findById(productId).select('category brand tags minPrice');
  if (!product) {
    res.json({ success: true, message: 'OK', data: [] });
    return;
  }

  const orConditions: mongoose.QueryFilter<any>[] = [
    { category: product.category },
    ...(product.brand ? [{ brand: product.brand }] : []),
    ...(product.tags?.length ? [{ tags: { $in: product.tags } }] : []),
  ];

  const similar = await Product.find({
    _id: { $ne: new mongoose.Types.ObjectId(productId) },
    status: 'active',
    $or: orConditions,
  })
    .sort({ soldCount: -1, 'rating.average': -1 })
    .limit(12)
    .select('name slug images minPrice maxPrice rating soldCount brand')
    .populate('category', 'name slug')
    .lean();

  res.json({ success: true, message: 'OK', data: similar });
});
