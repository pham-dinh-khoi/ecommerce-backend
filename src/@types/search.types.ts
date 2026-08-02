import type { PaginationResult } from './product.types.js';

// ─── Sort Options ─────────────────────────────────────────────────────────────

export type SortField =
  | 'relevance' // Text search score relevance (applied only when a keyword is present)
  | 'price_asc' // Price: low to high
  | 'price_desc' // Price: high to low
  | 'rating' // Highest rating
  | 'sold' // Best sellers
  | 'newest' // Newest arrivals
  | 'name_asc' // Alphabetical: A to Z
  | 'discount'; // Highest discount percentage

// ─── Raw Query Parameters from URL ────────────────────────────────────────────

export interface SearchQueryRaw {
  // Free-text Search
  q?: string; // Free-text search keyword
  // Filters
  category?: string; // Category ObjectId or slug
  brand?: string | string[]; // Single or multiple brands
  minPrice?: string;
  maxPrice?: string;
  minRating?: string; // Range: 0–5
  tags?: string; // Comma-separated tags
  inStock?: string; // 'true' / 'false'
  isFeatured?: string;
  // Sort & Pagination
  sort?: SortField;
  page?: string;
  limit?: string;
  // Facets — requests a list of values to render sidebar filter options
  facets?: string; // Set to 'true' to enable facet aggregation
}

// ─── Parsed and Validated Query ───────────────────────────────────────────────

export interface SearchQuery {
  keyword?: string;
  categoryIds?: string[]; // Includes subcategories
  brands?: string[];
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  tags?: string[];
  inStock?: boolean;
  isFeatured?: boolean;
  sort: SortField;
  page: number;
  limit: number;
  includeFacets: boolean;
}

// ─── Facets — Sidebar Filter Data ─────────────────────────────────────────────

export interface BrandFacet {
  brand: string;
  count: number;
}

export interface PriceRangeFacet {
  min: number;
  max: number;
  avg: number;
}

export interface RatingFacet {
  rating: number; // Range: 1–5
  count: number;
}

export interface SearchFacets {
  brands: BrandFacet[];
  priceRange: PriceRangeFacet;
  ratings: RatingFacet[];
  totalInStock: number;
}

// ─── Search Results ───────────────────────────────────────────────────────────

export interface SearchResultItem {
  _id: string;
  name: string;
  slug: string;
  brand?: string;
  images: Array<{ url: string; isPrimary: boolean }>;
  category: { _id: string; name: string; slug: string };
  minPrice: number;
  maxPrice: number;
  totalStock: number;
  rating: { average: number; count: number };
  soldCount: number;
  isFeatured: boolean;
  status: string;
  tags: string[];
  textScore?: number; // Relevance score when searching by keyword
}

export interface SearchResponse {
  products: SearchResultItem[];
  pagination: PaginationResult;
  facets?: SearchFacets; // Included only when includeFacets = true
  appliedFilters: Partial<SearchQuery>;
  query: {
    keyword?: string;
    sort: SortField;
    took?: number; // Query execution time in milliseconds
  };
}
