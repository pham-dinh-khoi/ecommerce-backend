import crypto from 'crypto';
import { User, type IUser } from '../models/user.model.js';
import { AppError } from '../utils/AppError.js';
import { signTokenPair, verifyRefreshToken, hashToken } from '../utils/jwt.util.js';
import { sendVerificationEmail, sendPasswordResetEmail } from './email.service.js';
import type { TokenPair } from '../@types/auth.types.js';
import type {
  RegisterInput,
  LoginInput,
  ChangePasswordInput,
  ForgotPasswordInput,
  ResetPasswordInput,
} from '../validations/auth.validation.js';

// Security configuration constants
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION = 30 * 60 * 1000; // 30 minutes
const MAX_REFRESH_TOKENS_PER_USER = 5; // Limits simultaneous active sessions per user

// ==========================================
// REGISTRATION & VERIFICATION
// ==========================================

export const register = async (
  data: RegisterInput
): Promise<{ user: IUser; verifyToken: string }> => {
  const existing = await User.findOne({ email: data.email });
  if (existing) throw new AppError('The email is already in use', 400);

  const user = new User({
    name: data.name,
    email: data.email,
    password: data.password,
    phone: data.phone,
  });

  const verifyToken = user.createEmailVerifyToken();
  await user.save();

  // Fire-and-forget email: Registration succeeds even if SMTP fails, preventing user friction
  sendVerificationEmail(user.email, user.name, verifyToken).catch(err =>
    console.error('Sending confirmation email failed:', err)
  );

  return { user, verifyToken };
};

export const verifyEmail = async (token: string): Promise<void> => {
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  const user = await User.findOne({
    emailVerifyToken: hashedToken,
    emailVerifyExpires: { $gt: new Date() },
  });

  if (!user) throw new AppError('The confirmation token is invalid or has expired', 400);

  user.isEmailVerified = true;
  user.emailVerifyToken = undefined;
  user.emailVerifyExpires = undefined;
  await user.save();
};

// ==========================================
// AUTHENTICATION & SESSION MANAGEMENT
// ==========================================

export const login = async (
  data: LoginInput,
  userAgent?: string
): Promise<{ user: IUser; tokens: TokenPair }> => {
  const user = await User.findOne({ email: data.email }).select('+password');

  // Security: Use generic error messages to prevent user enumeration attacks
  if (!user) throw new AppError('Incorrect email or password', 401);

  // Check account lockout status
  if (user.isLocked()) {
    const remainingMin = Math.ceil((user.lockUntil!.getTime() - Date.now()) / 60000);
    throw new AppError(`Account temporarily locked. Try again in ${remainingMin} minutes`, 423);
  }

  if (!user.isActive) {
    throw new AppError('Account disabled; please contact support', 403);
  }

  const isMatch = await user.comparePassword(data.password);

  if (!isMatch) {
    await handleFailedLogin(user);
    throw new AppError('Incorrect email or password', 401);
  }

  // Reset attempt counter on successful login
  if (user.loginAttempts > 0) {
    user.loginAttempts = 0;
    user.lockUntil = undefined;
  }

  const tokens = signTokenPair(user._id.toString(), user.role);
  await saveRefreshToken(user, tokens.refreshToken, tokens.tokenId, userAgent);

  return { user, tokens: { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken } };
};

// Internal: Increment fail count and lock if limit reached
const handleFailedLogin = async (user: IUser): Promise<void> => {
  user.loginAttempts += 1;
  if (user.loginAttempts >= MAX_LOGIN_ATTEMPTS) {
    user.lockUntil = new Date(Date.now() + LOCK_DURATION);
  }
  await user.save();
};

// Internal: Limit stored refresh tokens to prevent unlimited session accumulation
const saveRefreshToken = async (
  user: IUser,
  refreshToken: string,
  _tokenId: string,
  userAgent?: string
): Promise<void> => {
  user.refreshTokens.push({
    token: hashToken(refreshToken),
    createdAt: new Date(),
    userAgent,
  });

  // Keep only the N most recent sessions
  if (user.refreshTokens.length > MAX_REFRESH_TOKENS_PER_USER) {
    user.refreshTokens = user.refreshTokens.slice(-MAX_REFRESH_TOKENS_PER_USER);
  }

  await user.save();
};

// Implements Token Rotation: Issues new tokens while invalidating the old one
export const refreshAccessToken = async (refreshToken: string): Promise<TokenPair> => {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError('Refresh token is invalid or has expired', 401);
  }

  const user = await User.findById(payload.userId);
  if (!user) throw new AppError('The user does not exist', 401);

  const hashedIncoming = hashToken(refreshToken);
  const tokenExists = user.refreshTokens.some(rt => rt.token === hashedIncoming);

  // If token is not in DB, it may be a reuse attempt or an already revoked token
  if (!tokenExists) {
    throw new AppError('Invalid refresh token, please log in again', 401);
  }

  const tokens = signTokenPair(user._id.toString(), user.role);
  const newHashedToken = hashToken(tokens.refreshToken);

  // Atomic operation to prevent race conditions during refresh
  const result = await User.findOneAndUpdate(
    { _id: user._id, 'refreshTokens.token': hashedIncoming },
    { $pull: { refreshTokens: { token: hashedIncoming } } }
  );

  if (!result) {
    // If null, the token was already consumed by another concurrent request
    throw new AppError('Refresh token has already been used', 401);
  }

  await User.findByIdAndUpdate(user._id, {
    $push: { refreshTokens: { token: newHashedToken, createdAt: new Date() } },
  });

  return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
};

// ==========================================
// ACCOUNT MANAGEMENT & RECOVERY
// ==========================================

export const logout = async (userId: string, refreshToken: string): Promise<void> => {
  const hashed = hashToken(refreshToken);
  await User.findByIdAndUpdate(userId, {
    $pull: { refreshTokens: { token: hashed } },
  });
};

export const logoutAll = async (userId: string): Promise<void> => {
  await User.findByIdAndUpdate(userId, { $set: { refreshTokens: [] } });
};

export const changePassword = async (userId: string, data: ChangePasswordInput): Promise<void> => {
  const user = await User.findById(userId).select('+password');
  if (!user) throw new AppError('The user does not exist', 404);

  const isMatch = await user.comparePassword(data.currentPassword);
  if (!isMatch) throw new AppError('The current password is incorrect', 401);

  user.password = data.newPassword;
  // Security: Revoke all existing sessions on password change
  user.refreshTokens = [];
  await user.save();
};

export const forgotPassword = async (
  data: ForgotPasswordInput
): Promise<void> => {
  const user = await User.findOne({ email: data.email });

  // Do not reveal whether an account exists.
  if (!user) return;

  const resetToken = user.createPasswordResetToken();
  await user.save();

  try {
    await sendPasswordResetEmail(
      user.email,
      user.name,
      resetToken
    );
  } catch (error) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    console.error('Password reset email failed:', error);
  }
};

export const resetPassword = async (data: ResetPasswordInput): Promise<void> => {
  const hashedToken = crypto.createHash('sha256').update(data.token).digest('hex');

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: new Date() },
  });

  if (!user) throw new AppError('Reset token is invalid or expired', 400);

  user.password = data.newPassword;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  user.refreshTokens = []; // Revoke old sessions
  await user.save();
};

export const getCurrentUser = async (userId: string): Promise<IUser> => {
  const user = await User.findById(userId);
  if (!user) throw new AppError('The user does not exist', 404);
  return user;
};
