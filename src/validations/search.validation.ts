import { z } from 'zod';

// ─── Reusable Schemas & Helpers ──────────────────────────────────────────────

/**
 * Validates a MongoDB ObjectId format.
 * Regex pattern: 24-character hexadecimal string.
 */
const objectId = z.string().regex(/^[a-f\d]{24}$/i);

// ─── Public Search Schemas ──────────────────────────────────────────────────

/**
 * searchQuerySchema:
 * Used for processing public-facing URL query parameters.
 * Note: Zod "coerce" is essential here because URL search params arrive as strings.
 */
export const searchQuerySchema = z
  .object({
    // Keyword Search
    q: z
      .string()
      .trim()
      .min(1)
      .max(200, 'Search term too long (max 200)')
      .transform(v => v.replace(/[<>]/g, '')) // Security: Sanitize basic HTML tags to prevent XSS
      .optional(),

    // Filtering
    category: z.string().trim().optional(), // Can accept ObjectId or slug
    brand: z
      .union([z.string(), z.array(z.string())])
      .transform(v => (Array.isArray(v) ? v : v.split(','))) // Normalize to array regardless of input format
      .optional(),

    minPrice: z.coerce.number().min(0, 'Price cannot be negative').optional(),
    maxPrice: z.coerce.number().min(0).optional(),
    minRating: z.coerce.number().min(0).max(5).optional(),

    tags: z
      .string()
      .transform(v =>
        v
          .split(',')
          .map(t => t.trim().toLowerCase())
          .filter(Boolean)
      )
      .optional(),

    // Boolean flags (Coerced from "true"/"false" strings)
    inStock: z
      .enum(['true', 'false'])
      .transform(v => v === 'true')
      .optional(),

    isFeatured: z
      .enum(['true', 'false'])
      .transform(v => v === 'true')
      .optional(),

    // Sorting
    sort: z
      .enum([
        'relevance',
        'price_asc',
        'price_desc',
        'rating',
        'sold',
        'newest',
        'name_asc',
        'discount',
      ])
      .default('newest'),

    // Pagination
    page: z.coerce.number().int().positive().max(1000).default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),

    // Facet search indicator
    facets: z
      .enum(['true', 'false'])
      .transform(v => v === 'true')
      .default(false),
  })
  // Cross-field validation to ensure logical price ranges
  .refine(d => !d.minPrice || !d.maxPrice || d.maxPrice >= d.minPrice, {
    message: 'maxPrice must be greater than or equal to minPrice',
    path: ['maxPrice'],
  })
  // Ensure "relevance" sorting is only valid if a keyword query exists
  .refine(d => d.sort !== 'relevance' || !!d.q, {
    message: 'sort=relevance requires a search keyword (q)',
    path: ['sort'],
  });

export type SearchQueryInput = z.infer<typeof searchQuerySchema>;

// ─── Admin Product Management Schemas ───────────────────────────────────────

/**
 * adminProductQuerySchema:
 * Distinct from public search, optimized for internal dashboard queries.
 */
export const adminProductQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  q: z.string().trim().optional(),
  status: z.enum(['draft', 'active', 'inactive', 'archived']).optional(),
  category: objectId.optional(),
  sort: z
    .enum(['createdAt', 'updatedAt', 'minPrice', 'soldCount', 'name'])
    .default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type AdminProductQueryInput = z.infer<typeof adminProductQuerySchema>;