/**
 * SEARCH SERVICE
 * 
 * This service handles high-performance product searching, filtering, and aggregation.
 * It integrates MongoDB for data storage and Redis for result caching to minimize 
 * database load.
 */

import mongoose from 'mongoose';
import { Product } from '../models/product.model.js';
import { Category } from '../models/category.model.js';
import { redisGet, redisSet } from '../utils/redis.client.js';

// Type definitions
import type {
  SearchQuery,
  SearchResponse,
  SearchResultItem,
  SearchFacets,
  SortField,
} from '../@types/search.types.js';
import type { PaginationResult } from '../@types/product.types.js';

// ─── Constants ───────────────────────────────────────────────────────────────

// Cache duration set to 5 minutes as search results are typically high-traffic 
// but don't require real-time freshness.
const CACHE_TTL = 60 * 5; 
const CACHE_PREFIX = 'search:';

// Defined fields to project, ensuring we only fetch necessary data for the frontend
// to keep the payload size optimized.
const PROJECT_FIELDS = {
  name: 1,
  slug: 1,
  brand: 1,
  images: { $filter: { input: '$images', as: 'img', cond: { $eq: ['$$img.isPrimary', true] } } },
  category: 1,
  minPrice: 1,
  maxPrice: 1,
  totalStock: 1,
  rating: 1,
  soldCount: 1,
  isFeatured: 1,
  status: 1,
  tags: 1,
  shortDescription: 1,
  createdAt: 1,
};

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Generates a deterministic Redis key based on all query parameters.
 * Ensures the cache is invalidated correctly when search criteria change.
 */
const buildCacheKey = (query: SearchQuery): string => {
  const parts = [
    query.keyword || '',
    (query.categoryIds || []).join(','),
    (query.brands || []).join(','),
    query.minPrice ?? '',
    query.maxPrice ?? '',
    query.minRating ?? '',
    (query.tags || []).join(','),
    query.inStock ?? '',
    query.isFeatured ?? '',
    query.sort,
    query.page,
    query.limit,
    query.includeFacets ? '1' : '0',
  ];
  return CACHE_PREFIX + parts.join('|');
};

/**
 * Builds the MongoDB $match stage.
 * We use individual filter logic here to leverage MongoDB indexes effectively.
 */
const buildMatchStage = (query: SearchQuery): mongoose.QueryFilter<any> => {
  const match: mongoose.QueryFilter<any> = { status: 'active' };

  // Use MongoDB text index for full-text search capability
  if (query.keyword) {
    match.$text = { $search: query.keyword, $caseSensitive: false };
  }

  // Handle category filtering by mapping strings to ObjectIds
  if (query.categoryIds?.length) {
    match.category = { $in: query.categoryIds.map(id => new mongoose.Types.ObjectId(id)) };
  }

  // Case-insensitive regex for brand filtering
  if (query.brands?.length) {
    match.brand = { $in: query.brands.map(b => new RegExp(`^${b}$`, 'i')) };
  }

  // Price range filtering on the 'minPrice' field
  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    match.minPrice = {};
    if (query.minPrice !== undefined) match.minPrice.$gte = query.minPrice;
    if (query.maxPrice !== undefined) match.minPrice.$lte = query.maxPrice;
  }

  // Rating filtering
  if (query.minRating !== undefined) {
    match['rating.average'] = { $gte: query.minRating };
  }

  // Tags use $all to ensure products contain ALL selected tags
  if (query.tags?.length) {
    match.tags = { $all: query.tags };
  }

  // Availability check
  if (query.inStock === true) {
    match.totalStock = { $gt: 0 };
  }

  if (query.isFeatured !== undefined) {
    match.isFeatured = query.isFeatured;
  }

  return match;
};

/**
 * Configures the sort stage for aggregation.
 * Includes conditional logic for text search relevance and calculated fields like discount.
 */
const buildSortStage = (
  sort: SortField,
  hasKeyword: boolean
): Record<string, 1 | -1 | { $meta: string }> => {
  switch (sort) {
    case 'relevance':
      // 'textScore' requires an existing $text index match
      return hasKeyword ? { score: { $meta: 'textScore' }, soldCount: -1 } : { soldCount: -1 };
    case 'price_asc': return { minPrice: 1, createdAt: -1 };
    case 'price_desc': return { minPrice: -1, createdAt: -1 };
    case 'rating': return { 'rating.average': -1, 'rating.count': -1 };
    case 'sold': return { soldCount: -1, 'rating.average': -1 };
    case 'newest': return { createdAt: -1 };
    case 'name_asc': return { name: 1 };
    case 'discount': return { discountPercent: -1, soldCount: -1 };
    default: return { createdAt: -1 };
  }
};

/**
 * Recursively resolves categories, including subcategories.
 * This is crucial for accurate filtering when a user selects a parent category.
 */
const resolveCategoryIds = async (categoryParam: string): Promise<string[]> => {
  let rootCategory;

  if (mongoose.Types.ObjectId.isValid(categoryParam)) {
    rootCategory = await Category.findById(categoryParam).select('_id');
  } else {
    rootCategory = await Category.findOne({ slug: categoryParam }).select('_id');
  }

  if (!rootCategory) return [];

  const rootId = rootCategory._id.toString();

  // Find all descendants using the materialized path ('ancestors') strategy
  const descendants = await Category.find({
    $or: [{ _id: rootId }, { 'ancestors._id': rootId }],
  }).select('_id');

  return descendants.map(c => c._id.toString());
};

const escapeRegex = (str: string): string => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ─── Main Service Methods ────────────────────────────────────────────────────

/**
 * Performs a search with aggregation.
 * Uses $facet to run multiple operations (data, count, and filter grouping) in a single DB trip.
 */
export const searchProducts = async (query: SearchQuery): Promise<SearchResponse> => {
  const startTime = Date.now();

  // 1. Check Redis Cache
  const cacheKey = buildCacheKey(query);
  try {
    const cached = await redisGet(cacheKey);
    if (cached) {
      const result = JSON.parse(cached) as SearchResponse;
      result.query.took = 0; 
      return result;
    }
  } catch { /* Fail gracefully if Redis is down */ }

  // 2. Resolve hierarchical category IDs
  let resolvedQuery = { ...query };
  if (query.categoryIds?.length === 1) {
    const categoryId = query.categoryIds[0];
    if (categoryId) {
      const ids = await resolveCategoryIds(categoryId);
      resolvedQuery.categoryIds = ids.length ? ids : ['000000000000000000000000'];
    }
  }

  // 3. Prepare pipeline stages
  const matchStage = buildMatchStage(resolvedQuery);
  const hasKeyword = !!resolvedQuery.keyword;
  const skip = (query.page - 1) * query.limit;

  const addFieldsStages: any[] = [];
  
  // Dynamic calculation for discount percentage if sorting by discount
  if (query.sort === 'discount') {
    addFieldsStages.push({
      $addFields: {
        discountPercent: {
          $cond: {
            if: { $and: [{ $gt: ['$comparePrice', 0] }, { $gt: ['$minPrice', 0] }] },
            then: {
              $multiply: [
                { $divide: [{ $subtract: ['$comparePrice', '$minPrice'] }, '$comparePrice'] },
                100,
              ],
            },
            else: 0,
          },
        },
      },
    });
  }

  if (hasKeyword) {
    addFieldsStages.push({ $addFields: { score: { $meta: 'textScore' } } });
  }

  const sortStage = buildSortStage(query.sort, hasKeyword);

  // 4. Construct Facet Pipeline
  const facetStages: Record<string, any[]> = {
    data: [
      ...addFieldsStages,
      { $sort: sortStage },
      { $skip: skip },
      { $limit: query.limit },
      {
        $lookup: {
          from: 'categories',
          localField: 'category',
          foreignField: '_id',
          as: 'category',
          pipeline: [{ $project: { name: 1, slug: 1 } }],
        },
      },
      { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          ...PROJECT_FIELDS,
          ...(hasKeyword ? { score: 1 } : {}),
          ...(query.sort === 'discount' ? { discountPercent: 1 } : {}),
        },
      },
    ],
    count: [{ $count: 'total' }],
  };

  // Add optional facets for sidebar filters
  if (query.includeFacets) {
    facetStages.brandFacets = [
      { $group: { _id: '$brand', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 50 },
      { $project: { brand: '$_id', count: 1, _id: 0 } },
    ];

    facetStages.priceFacets = [
      { $group: { _id: null, min: { $min: '$minPrice' }, max: { $max: '$minPrice' }, avg: { $avg: '$minPrice' } } },
    ];

    facetStages.ratingFacets = [
      { $bucket: { groupBy: '$rating.average', boundaries: [0, 1, 2, 3, 4, 5], default: 'other', output: { count: { $sum: 1 } } } },
    ];

    facetStages.stockCount = [{ $match: { totalStock: { $gt: 0 } } }, { $count: 'total' }];
  }

  // 5. Execute Pipeline
  const pipeline: any[] = [{ $match: matchStage }];
  pipeline.push({ $facet: facetStages });

  const [aggregationResult] = await Product.aggregate(pipeline).allowDiskUse(true);

  // 6. Normalize and structure result
  const products = aggregationResult.data as SearchResultItem[];
  const total = aggregationResult.count[0]?.total ?? 0;
  const totalPages = Math.ceil(total / query.limit);

  const pagination: PaginationResult = {
    total,
    page: query.page,
    limit: query.limit,
    totalPages,
    hasNext: query.page < totalPages,
    hasPrev: query.page > 1,
  };

  let facets: SearchFacets | undefined;
  if (query.includeFacets) {
    const brandFacets = (aggregationResult.brandFacets || []).filter((b: any) => b.brand);
    const priceData = aggregationResult.priceFacets?.[0];
    const ratingBuckets = aggregationResult.ratingFacets || [];
    const inStockTotal = aggregationResult.stockCount?.[0]?.total ?? 0;

    facets = {
      brands: brandFacets,
      priceRange: { min: priceData?.min ?? 0, max: priceData?.max ?? 0, avg: Math.round(priceData?.avg ?? 0) },
      ratings: ratingBuckets.map((b: any) => ({ rating: b._id, count: b.count })),
      totalInStock: inStockTotal,
    };
  }
  
  const result: SearchResponse = {
    products,
    pagination,
    ...(facets && { facets }),
    appliedFilters: {
      ...(query.keyword && { keyword: query.keyword }),
      ...(query.brands?.length && { brands: query.brands }),
      ...(query.minPrice !== undefined && { minPrice: query.minPrice }),
      ...(query.maxPrice !== undefined && { maxPrice: query.maxPrice }),
      ...(query.minRating !== undefined && { minRating: query.minRating }),
      ...(query.tags?.length && { tags: query.tags }),
      ...(query.inStock !== undefined && { inStock: query.inStock }),
      ...(query.isFeatured !== undefined && { isFeatured: query.isFeatured }),
    },
    query: {
      ...(query.keyword && { keyword: query.keyword }),
      sort: query.sort,
      took: Date.now() - startTime,
    },
  };

  // 7. Store in Cache
  try { await redisSet(cacheKey, JSON.stringify(result), CACHE_TTL); } catch { /* Ignore */ }

  return result;
};

/**
 * Autocomplete service. 
 * Uses basic prefix matching which is faster than full-text indexing for partial inputs.
 */
export const autocomplete = async (prefix: string, limit = 8): Promise<Array<{ _id: string; name: string; slug: string; type: 'product' | 'brand' | 'category' }>> => {
  if (!prefix || prefix.length < 2) return [];

  const regex = new RegExp(`^${escapeRegex(prefix)}`, 'i');

  const [products, brands, categories] = await Promise.all([
    Product.find({ name: regex, status: 'active' }).select('name slug').limit(Math.ceil(limit / 2)).lean(),
    Product.distinct('brand', { brand: regex, status: 'active' }),
    Category.find({ name: regex, isActive: true }).select('name slug').limit(3).lean(),
  ]);

  const results: any[] = [];
  products.forEach((p: any) => results.push({ _id: p._id.toString(), name: p.name, slug: p.slug, type: 'product' }));
  brands.slice(0, 3).forEach((b: string) => results.push({ _id: b, name: b, slug: b, type: 'brand' }));
  categories.forEach((c: any) => results.push({ _id: c._id.toString(), name: c.name, slug: c.slug, type: 'category' }));

  return results.slice(0, limit);
};

/**
 * Clears search-related cache.
 * Called whenever a product is created, updated, or deleted to ensure data consistency.
 */
export const invalidateSearchCache = async (): Promise<void> => {
  try {
    const { getRedisClient } = await import('../utils/redis.client.js');
    const client = await getRedisClient();
    // Using SCAN is preferred in production to avoid blocking the Redis event loop
    const keys = await client.keys(`${CACHE_PREFIX}*`);
    if (keys.length > 0) await client.del(keys);
  } catch { /* Redis unavailable */ }
};