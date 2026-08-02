import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { ZodError } from 'zod';

// --- Middleware & Config Imports ---
import { globalLimiter } from './middleware/ratelimiter.middleware.js';
import { env } from './config/env.config.js';
import { sanitizeInput } from './middleware/sanitize.middleware.js';
import { globalErrorHandler, AppError } from './utils/AppError.js';

// --- Route Imports ---
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import categoryRoutes from './routes/category.routes.js';
import productRoutes from './routes/product.routes.js';
import cartRoutes from './routes/cart.routes.js';
import wishlistRoutes from './routes/wishlist.routes.js';
import couponRoutes from './routes/coupon.routes.js';
import orderRoutes from './routes/order.routes.js';
import searchRoutes from './routes/search.routes.js';
import reviewRoutes from './routes/review.routes.js';
import paymentRoutes from './routes/payment.routes.js';

const app = express();

/**
 * 1. Proxy & Trust Configuration
 * 'trust proxy' is essential when deploying behind reverse proxies (Render, Railway, Nginx).
 * It ensures Express correctly reads the client's real IP address from headers
 * (like x-forwarded-for), which is required for accurate rate limiting.
 */
app.set('trust proxy', 1);

/**
 * 2. Security Middleware
 * Helmet: Sets secure HTTP headers to protect against common web vulnerabilities.
 * CORS: Configures Cross-Origin Resource Sharing.
 * Cookie-parser: Parses the Cookie header and populates req.cookies.
 * globalLimiter: Prevents brute-force/DDoS attacks on the API.
 */
app.use(helmet());
app.use(cors({ origin: env.CLIENT_URL, credentials: true }));
app.use(cookieParser());
app.use('/api', globalLimiter);

/**
 * 3. Parsing & Sanitization
 * express.json/urlencoded: Limits payload size to '10kb' to mitigate DoS attacks
 * where an attacker sends massive payloads to consume server memory.
 * sanitizeInput: A custom middleware to strip malicious scripts/characters (XSS/NoSQL Injection).
 */
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(sanitizeInput);

/**
 * 4. Health Check
 * A lightweight endpoint used by cloud platforms for uptime monitoring and liveness probes.
 */
app.get('/api/health', (_req, res) => {
  res.status(200).json({ success: true, message: 'OK', timestamp: new Date().toISOString() });
});

/**
 * 5. API Routes
 */
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/payments', paymentRoutes);

/**
 * 6. 404 Handler
 * Catch-all middleware for routes that don't match the defined API endpoints.
 */
app.use((req, _res, next) => {
  next(new AppError(`Cannot find route: ${req.originalUrl}`, 404));
});

/**
 * 7. Error Handling
 */

// Handle Zod Validation Errors
// This intercepts Zod schema errors and converts them into a clean, client-friendly JSON response.
app.use((err: Error, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof ZodError) {
    const errors: Record<string, string> = {};
    err.issues.forEach(e => {
      errors[e.path.join('.')] = e.message;
    });
    return res.status(400).json({ success: false, message: 'Validation failed', errors });
  }
  // If it's not a Zod error, pass it to the final global error handler
  next(err);
});

// Final Global Error Handler
app.use(globalErrorHandler);

export default app;
