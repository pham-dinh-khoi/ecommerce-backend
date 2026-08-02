import type { Request } from 'express';

export type UserRole = 'admin' | 'seller' | 'user';

// ─── JWT Payloads ───────────────────────────────────────────────────────────

export interface IAccessTokenPayload {
  userId: string;
  role: UserRole;
  iat?: number; // Issued at (in seconds) — used to compare with passwordChangedAt
  exp?: number;
}

export interface IRefreshTokenPayload {
  userId: string;
  tokenId: string; // Random ID used to revoke individual tokens (multi-device support)
  iat?: number;
  exp?: number;
}

export interface AuthRequest extends Request {
  user?: IAccessTokenPayload;
}

// ─── DTOs (Data Transfer Objects) ───────────────────────────────────────────

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}