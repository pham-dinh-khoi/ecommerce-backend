// ─── Pagination ────────────────────────────────────────────────────────────

export interface PaginationQuery {
  page?: string;
  limit?: string;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface PaginationResult {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// ─── Product Queries ────────────────────────────────────────────────────────

export interface ProductQuery extends PaginationQuery {
  keyword?: string;
  category?: string;
  brand?: string;
  minPrice?: string;
  maxPrice?: string;
  status?: string;
  isFeatured?: string;
  tags?: string;
  rating?: string;
}

// ─── API Response Wrapper ───────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  pagination?: PaginationResult;
  errors?: Record<string, string>;
}

// ─── Cloudinary Upload Result ───────────────────────────────────────────────

export interface CloudinaryUploadResult {
  public_id: string;
  secure_url: string;
  width: number;
  height: number;
  format: string;
  bytes: number;
}