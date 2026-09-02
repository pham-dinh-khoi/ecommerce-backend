import type { Request, Response, NextFunction } from 'express';
import type { AuthRequest } from '../@types/auth.types.js';
import { env } from '../config/env.config.js';

// ============================================================================
// 1. CUSTOM ERROR CLASS
// ============================================================================

/**
 * AppError
 * A custom error class that extends the standard JavaScript Error class.
 * It is used to create operational errors that include an HTTP status code,
 * making it easy to identify and respond to specific API failures.
 */
export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    // 'isOperational' flags this as a trusted error (e.g., validation)
    // rather than a programming bug (e.g., null pointer exception).
    this.isOperational = true;

    // Captures the stack trace, excluding the constructor call from the stack trace
    Error.captureStackTrace(this, this.constructor);
  }
}

// ============================================================================
// 2. HELPER UTILITIES
// ============================================================================

/**
 * catchAsync
 * A higher-order function that wraps async Express controllers.
 *
 * Instead of wrapping every controller in a try/catch block, this utility
 * automatically catches any promise rejection and passes the error to the
 * next() middleware, which triggers the Global Error Handler.
 */
export const catchAsync =
  (fn: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req as AuthRequest, res, next).catch(next);

// ============================================================================
// 3. MIDDLEWARE
// ============================================================================

/**
 * globalErrorHandler
 * The centralized error-handling middleware for the Express application.
 * It intercepts all errors passed to next(err) and formats the JSON response.
 */
export const globalErrorHandler = (
  err: AppError & { code?: number; keyValue?: Record<string, string> },
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  // Set default status code to 500 (Internal Server Error) if none is provided
  err.statusCode = err.statusCode || 500;

  // --- MongoDB Duplicate Key Error (Code 11000) ---
  // Triggered when a unique field (e.g., email) already exists in the DB.
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0];
    return res.status(400).json({
      success: false,
      message: `${field} đã tồn tại, vui lòng dùng giá trị khác`,
    });
  }

  // --- MongoDB Validation Error ---
  // Triggered when the request data fails model schema validation.
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Dữ liệu không hợp lệ',
      errors: err.message,
    });
  }

  // --- JWT Authentication Errors ---
  // Handle invalid signatures or expired tokens.
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ success: false, message: 'Token không hợp lệ' });
  }
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ success: false, message: 'Token đã hết hạn' });
  }

  // --- Generic Error Response ---
  // Sends a standard error response to the client.
  res.status(err.statusCode).json({
    success: false,
    message: err.message || 'Lỗi server, vui lòng thử lại',
    // Only expose the stack trace if the application is in 'development' mode
    // to prevent leaking internal logic in production.
    ...(env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};
