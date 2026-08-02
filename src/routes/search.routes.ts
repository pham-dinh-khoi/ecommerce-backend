import { Router } from 'express';
import * as searchController from '../controllers/search.controller.js';
// import rateLimit from 'express-rate-limit';
import { searchLimiter, autocompleteLimiter } from '../middleware/ratelimiter.middleware.js';

const router = Router();

// ==========================================
// SEARCH ENDPOINTS
// ==========================================

// Perform a full product search
router.get('/', searchLimiter, searchController.search);

// Get search suggestions based on partial input
router.get('/autocomplete', autocompleteLimiter, searchController.autocomplete);

// Get popular or trending search queries
router.get('/trending', searchController.trending);

// Find products similar to a specific product
router.get('/similar/:productId', searchController.similarProducts);

export default router;
