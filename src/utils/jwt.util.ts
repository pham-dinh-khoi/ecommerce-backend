import jwt, { type SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import type { IAccessTokenPayload, IRefreshTokenPayload, TokenPair } from '../@types/auth.types.js';
import type { UserRole } from '../models/user.model.js';
import { env } from '../config/env.config.js';

// ============================================================================
// 1. CONFIGURATION
// ============================================================================

// Extract secrets and expiration settings from environment variables.
// The '!' (non-null assertion) indicates we assume these are present at runtime.
const ACCESS_SECRET = env.JWT_ACCESS_SECRET!;
const REFRESH_SECRET = env.JWT_REFRESH_SECRET!;
const ACCESS_EXPIRES = env.JWT_ACCESS_EXPIRES || '15m';
const REFRESH_EXPIRES = env.JWT_REFRESH_EXPIRES || '7d';

// ============================================================================
// 2. TOKEN SIGNING (GENERATION)
// ============================================================================

/**
 * signAccessToken
 * Generates a short-lived Access Token.
 * Used for authentication of API requests. Minimal payload prevents bloating.
 */
export const signAccessToken = (userId: string, role: UserRole): string => {
  const payload: IAccessTokenPayload = { userId, role };
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES } as SignOptions);
};

/**
 * signRefreshToken
 * Generates a long-lived Refresh Token.
 *
 * We include a random 'tokenId' (jti). This acts as a unique fingerprint,
 * allowing us to revoke specific sessions/devices without invalidating
 * all refresh tokens for a user.
 */
export const signRefreshToken = (userId: string): { token: string; tokenId: string } => {
  const tokenId = crypto.randomBytes(16).toString('hex');
  const payload: IRefreshTokenPayload = { userId, tokenId };
  const token = jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRES } as SignOptions);
  return { token, tokenId };
};

/**
 * signTokenPair
 * Convenience wrapper to generate both tokens simultaneously.
 * Useful for login or token-refresh flows.
 */
export const signTokenPair = (userId: string, role: UserRole): TokenPair & { tokenId: string } => {
  const accessToken = signAccessToken(userId, role);
  const { token: refreshToken, tokenId } = signRefreshToken(userId);
  return { accessToken, refreshToken, tokenId };
};

// ============================================================================
// 3. VERIFICATION
// ============================================================================

/**
 * verifyAccessToken
 * Validates the signature and expiration of an access token.
 * Note: jwt.verify will throw an error if the token is invalid/expired.
 */
export const verifyAccessToken = (token: string): IAccessTokenPayload => {
  return jwt.verify(token, ACCESS_SECRET) as IAccessTokenPayload;
};

/**
 * verifyRefreshToken
 * Validates the signature and expiration of a refresh token.
 */
export const verifyRefreshToken = (token: string): IRefreshTokenPayload => {
  return jwt.verify(token, REFRESH_SECRET) as IRefreshTokenPayload;
};

// ============================================================================
// 4. SECURITY UTILITIES
// ============================================================================

/**
 * hashToken
 * Hashes a token using SHA-256 before storage.
 *
 * DESIGN RATIONALE: We never store raw Refresh Tokens in the database.
 * If the database is compromised, an attacker cannot use the hashed values
 * to impersonate users. We verify by hashing the incoming token and comparing.
 */
export const hashToken = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

// ============================================================================
// 5. HELPER UTILITIES
// ============================================================================

/**
 * getRefreshTokenMaxAge
 * Calculates the expiration time in milliseconds for browser cookies.
 *
 * Since environment variables are strings (e.g., '7d', '1h'), this parses
 * the string and converts it to a numeric millisecond value used by
 * Express/Cookie-parser.
 */
export const getRefreshTokenMaxAge = (): number => {
  // If already a number, return as is.
  if (typeof REFRESH_EXPIRES === 'number') {
    return REFRESH_EXPIRES;
  }

  // Use Regex to separate the digit from the unit (d, h, m).
  const match = REFRESH_EXPIRES.match(/^(\d+)([dhm])$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000; // Default to 7 days if unparseable

  const num = match[1];
  const unit = match[2];

  if (!num || !unit) return 7 * 24 * 60 * 60 * 1000;

  // Conversion map for time units to milliseconds.
  const multipliers: Record<string, number> = {
    d: 86400000, // 1 day = 24 * 60 * 60 * 1000
    h: 3600000, // 1 hour = 60 * 60 * 1000
    m: 60000, // 1 minute = 60 * 1000
  };

  const multiplier = multipliers[unit] || 86400000;
  return Number(num) * multiplier;
};
