import type { Request, Response } from 'express';
import { catchAsync } from '../utils/AppError.js';
import type { AuthRequest } from '../@types/auth.types.js';
import * as authService from '../services/auth.service.js';
import { mergeCartsOnLogin } from '../services/cart-merge.service.js';
import { getRefreshTokenMaxAge } from '../utils/jwt.util.js';
import {
  registerSchema,
  loginSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../validations/auth.validation.js';
import { env } from '../config/env.config.js';

// ─── Helper Functions ─────────────────────────────────────────────────────────

// Helper: Set refresh token in httpOnly cookie
// httpOnly → Prevents client-side JS from accessing the token (mitigates XSS)
// secure → Ensures the cookie is only sent over HTTPS in production
// sameSite: 'strict' → Mitigates CSRF by preventing the cookie from being sent in cross-site requests

const setRefreshTokenCookie = (res: Response, refreshToken: string) => {
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: getRefreshTokenMaxAge(),
    path: '/api/auth', // Cookies are restricted to the authentication route to reduce the attack surface
  });
};

const clearRefreshTokenCookie = (res: Response) => {
  res.clearCookie('refreshToken', { path: '/api/auth' });
};

// ─── Controller Methods ───────────────────────────────────────────────────────

// Register
export const register = catchAsync(async (req: Request, res: Response) => {
  const data = registerSchema.parse(req.body);
  const { user } = await authService.register(data);

  res.status(201).json({
    success: true,
    message: 'Registration successful. Please check your email to confirm your account',
    data: { id: user._id, name: user.name, email: user.email },
  });
});

// Confirm Email
export const verifyEmail = catchAsync(async (req: Request, res: Response) => {
  const { token } = req.params;

  if (!token || typeof token !== 'string') {
    res.status(400).json({ success: false, message: 'Invalid token' });
    return;
  }

  await authService.verifyEmail(token);
  res.json({ success: true, message: 'Email confirmation successful' });
});

// Log In
export const login = catchAsync(async (req: Request, res: Response) => {
  const data = loginSchema.parse(req.body);
  const userAgent = req.get('user-agent') || 'unknown'; // Always return a fallback string

  // Extract guestId from headers to merge the session cart upon login
  const guestId = req.headers['x-guest-id'] as string | undefined;

  const { user, tokens } = await authService.login(data, userAgent);

  setRefreshTokenCookie(res, tokens.refreshToken);

  // Merge the session cart into the persistent cart after successful login
  // Executed asynchronously without blocking the login response
  if (guestId) {
    mergeCartsOnLogin(user._id.toString(), guestId, 'add').catch(err =>
      console.error('Cart merge error:', err)
    );
  }

  res.json({
    success: true,
    message: 'Login successful',
    data: {
      accessToken: tokens.accessToken,
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    },
  });
});

// Refresh Access Token
export const refreshToken = catchAsync(async (req: Request, res: Response) => {
  // Prioritize secure cookie, fallback to body for cross-platform support (e.g., mobile apps)
  const token = req.cookies?.refreshToken || req.body?.refreshToken;

  if (!token) {
    res.status(401).json({ success: false, message: 'Refresh Token not found' });
    return;
  }

  const tokens = await authService.refreshAccessToken(token);
  setRefreshTokenCookie(res, tokens.refreshToken);

  res.json({
    success: true,
    message: 'Access token refreshed successfully',
    data: { accessToken: tokens.accessToken },
  });
});

// Log Out
export const logout = catchAsync(async (req: AuthRequest, res: Response) => {
  // Supports both Web (cookies) and Mobile (body) fallback
  const token = req.cookies?.refreshToken || req.body?.refreshToken;

  if (token && req.user) {
    // Revoke token from the database to fully prevent session reuse
    await authService.logout(req.user.userId, token);
  }

  clearRefreshTokenCookie(res);
  res.json({ success: true, message: 'Logged out successfully' });
});

export const logoutAll = catchAsync(async (req: AuthRequest, res: Response) => {
  await authService.logoutAll(req.user!.userId);
  clearRefreshTokenCookie(res);
  res.json({ success: true, message: 'Logged out of all devices' });
});

// Current Profile
export const getMe = catchAsync(async (req: AuthRequest, res: Response) => {
  const user = await authService.getCurrentUser(req.user!.userId);
  res.json({ success: true, message: 'OK', data: user });
});

// Change Password
export const changePassword = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = changePasswordSchema.parse(req.body);
  await authService.changePassword(req.user!.userId, data);

  clearRefreshTokenCookie(res); // Change password → revoke current session, prompt to log in again
  res.json({ success: true, message: 'Password changed successfully, please log in again' });
});

// Forgot / Reset Password
export const forgotPassword = catchAsync(async (req: Request, res: Response) => {
  const data = forgotPasswordSchema.parse(req.body);
  authService.forgotPassword(data);

  // Always send the same message regardless of whether the email address exists or not (avoids user enumeration)
  res.json({
    success: true,
    message: 'If the email exists, a password reset instruction has been sent',
  });
});

export const resetPassword = catchAsync(async (req: Request, res: Response) => {
  const data = resetPasswordSchema.parse(req.body);
  await authService.resetPassword(data);
  res.json({ success: true, message: 'Password reset successful, please log in' });
});
