import type { Request, Response, NextFunction } from 'express';

/**
 * Recursively sanitizes objects to remove keys starting with "$" or containing ".".
 * These are MongoDB operators and field path delimiters that can be exploited
 * for NoSQL Injection attacks.
 */
const sanitizeObject = (obj: any): any => {
  // Handle Arrays
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }

  // Handle Objects
  if (obj !== null && typeof obj === 'object') {
    const cleaned: Record<string, any> = {};

    for (const key of Object.keys(obj)) {
      // Remove dangerous keys that could trigger MongoDB operators
      if (key.startsWith('$') || key.includes('.')) {
        continue;
      }
      cleaned[key] = sanitizeObject(obj[key]);
    }
    return cleaned;
  }

  return obj;
};

/**
 * Express middleware to sanitize request body and params.
 */
export const sanitizeInput = (req: Request, _res: Response, next: NextFunction) => {
  if (req.body) req.body = sanitizeObject(req.body);
  if (req.params) req.params = sanitizeObject(req.params);

  // NOTE: We intentionally skip 'req.query'.
  // 1. In Express 5, req.query is getter-only, so modifying it causes errors.
  // 2. We assume 'req.query' is already handled by Zod schema validation
  //    (e.g., productQuerySchema), which is a more robust way to handle input.

  next();
};
