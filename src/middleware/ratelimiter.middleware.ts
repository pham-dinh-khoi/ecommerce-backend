import rateLimit from 'express-rate-limit';
import { env } from '../config/env.config.js';

// ==========================================
// GLOBAL LIMITER — Ultimate safety net for the entire /api
// Production: stricter. Development: relaxed completely to avoid hindering testing.
// ==========================================

export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.NODE_ENV === 'production' ? 300 : 2000,
  message: {
    success: false,
    message: 'Too many requests, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ==========================================
// LOGIN LIMITER
// Limits brute force attacks by restricting attempts to 10 per 15 minutes per IP.
// Strategy: Complements account-level lockout mechanisms (5 attempts/30 mins per email)
// implemented in auth.service.ts for a two-layered defense strategy.
// ==========================================

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    message: 'Too many login attempts, please try again after 15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ==========================================
// REGISTRATION LIMITER
// Prevents spam and mass bot-driven account creation by restricting
// registration attempts to 5 per hour.
// ==========================================

export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    message: 'Too many registration attempts from this address, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ==========================================
// PASSWORD FORGOT LIMITER
// Protects against email spam/harassment by restricting
// password reset requests to 3 per hour.
// ==========================================

export const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: {
    success: false,
    message: 'Too many password reset requests, please try again after 1 hour',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ==========================================
// PAYMENT INITIATE LIMITER
// Financial transactions — doesn't need to be as strict as login, but still needs to block spam
// of continuous payment URL generation (each call costs a real request to the external payment gateway).
// ==========================================

export const paymentInitiateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: {
    success: false,
    message: 'Too many payment attempts, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ==========================================
// COUPON PREVIEW LIMITER
// Prevents brute-forcing coupon codes in bulk (trying multiple codes sequentially to find a valid one).
// ==========================================

export const couponPreviewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: {
    success: false,
    message: 'Too many coupon attempts, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ==========================================
// REVIEW CREATE LIMITER
// Prevents bulk review submission spam.
// ==========================================

export const reviewCreateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: {
    success: false,
    message: 'Too many reviews submitted, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ==========================================
// SEARCH LIMITER
// Product search — natural frequency is quite high, but still needs to block web scraping bots.
// ==========================================

export const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { success: false, message: 'Too many search requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ==========================================
// AUTOCOMPLETE LIMITER
// Triggered on every keystroke — needs to be the loosest limit within the search group.
// ==========================================

export const autocompleteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { success: false, message: 'Too many requests' },
  standardHeaders: true,
  legacyHeaders: false,
});
