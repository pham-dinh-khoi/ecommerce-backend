import type { Response, NextFunction } from 'express';
import type { AuthRequest, UserRole } from '../@types/auth.types.js';
import { AppError } from '../utils/AppError.js';
import { catchAsync } from '../utils/AppError.js';
import { verifyAccessToken } from '../utils/jwt.util.js';
import { User } from '../models/user.model.js';

// ==========================================
// AUTHENTICATION: MANDATORY
// ==========================================

/**
 * @desc Protects routes that require a valid logged-in user
 */
export const protect = catchAsync(async (req: AuthRequest, _res: Response, next: NextFunction) => {
  // 1. Get token from Authorization header or cookie
  let token: string | undefined;
  const auth = req.headers.authorization;

  if (auth?.startsWith('Bearer ')) {
    token = auth.split(' ')[1];
  } else if (req.cookies?.accessToken) {
    token = req.cookies.accessToken;
  }

  if (!token) {
    throw new AppError('Please log in to continue', 401);
  }

  // 2. Verify signature and expiration
  const decoded = verifyAccessToken(token);

  // 3. Verify user existence
  const user = await User.findById(decoded.userId);
  if (!user) {
    throw new AppError('The user no longer exists', 401);
  }

  // 4. Check if account is still active
  if (!user.isActive) {
    throw new AppError('The account has been disabled', 403);
  }

  // 5. Security check: Ensure token is not issued before a password change
  if (user.isPasswordChangedAfter(decoded.iat!)) {
    throw new AppError('The password has been changed, please log in again', 401);
  }

  // 6. Attach user info to request
  req.user = { userId: decoded.userId, role: decoded.role };
  next();
});

// ==========================================
// AUTHENTICATION: OPTIONAL
// ==========================================

/**
 * @desc Optional authentication - identifies user if logged in, otherwise treats as guest
 */
export const optionalAuth = catchAsync(
  async (req: AuthRequest, _res: Response, next: NextFunction) => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return next();

    try {
      const token = auth.split(' ')[1];
      if (!token) return next();

      const decoded = verifyAccessToken(token);
      const user = await User.findById(decoded.userId);

      // If user exists and is active, attach to request; otherwise continue as guest
      if (user && user.isActive) {
        req.user = { userId: decoded.userId, role: decoded.role };
      }
    } catch {
      // Ignore errors for optional auth (treat as anonymous)
    }
    next();
  }
);

// ==========================================
// AUTHORIZATION (RBAC)
// ==========================================

/**
 * @desc Restrict access based on user roles
 */
export const restrictTo =
  (...roles: UserRole[]) =>
  (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new AppError('You are not authorized to perform this action', 403));
    }
    next();
  };

/**
 * @desc Ensure the user is accessing their own data or is an Admin
 */
export const restrictToSelfOrAdmin = (req: AuthRequest, _res: Response, next: NextFunction) => {
  const targetId = req.params.id || req.params.userId;

  if (req.user?.role === 'admin' || req.user?.userId === targetId) {
    return next();
  }

  next(new AppError('You do not have permission to access this resource', 403));
};
