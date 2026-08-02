/**
 * USER SERVICE
 *
 * This service handles user profile management, media/avatar operations,
 * shipping address workflows, and administrative user controls.
 */

import mongoose from 'mongoose';
import { User, type IUser, type IAddress } from '../models/user.model.js';
import { uploadImage, deleteImage } from './cloudinary.service.js';
import { AppError } from '../utils/AppError.js';
import type { PaginationResult } from '../@types/product.types.js';
import type {
  UpdateProfileInput,
  AddressInput,
  UpdateAddressInput,
  AdminUpdateUserInput,
  AdminUserQueryInput,
} from '../validations/user.validation.js';

// ─── Profile Management ──────────────────────────────────────────────────────

/**
 * Retrieves the profile of the current user.
 */
export const getProfile = async (userId: string): Promise<IUser> => {
  const user = await User.findById(userId);
  if (!user) throw new AppError('No user found', 404);
  return user;
};

/**
 * Updates basic user information.
 */
export const updateProfile = async (userId: string, data: UpdateProfileInput): Promise<IUser> => {
  const user = await User.findById(userId);
  if (!user) throw new AppError('No user found', 404);

  Object.assign(user, data);
  await user.save();
  return user;
};

// ─── Avatar/Media Management ─────────────────────────────────────────────────

/**
 * Updates the user's avatar.
 * Workflow: Removes the previous image from Cloudinary if it exists,
 * then uploads the new one and updates the user record.
 */
export const updateAvatar = async (userId: string, file: Express.Multer.File): Promise<IUser> => {
  const user = await User.findById(userId);
  if (!user) throw new AppError('No user found', 404);

  if (user.avatar?.publicId) {
    // Attempt to delete old avatar, ignoring errors if image is already missing
    await deleteImage(user.avatar.publicId).catch(() => {});
  }

  const result = await uploadImage(file.buffer, 'avatars', { width: 400, height: 400 });

  user.avatar = { url: result.secure_url, publicId: result.public_id };
  await user.save();
  return user;
};

/**
 * Removes the user's avatar and clears the record.
 */
export const deleteAvatar = async (userId: string): Promise<IUser> => {
  const user = await User.findById(userId);
  if (!user) throw new AppError('No user found', 404);

  if (user.avatar?.publicId) {
    await deleteImage(user.avatar.publicId).catch(() => {});
  }

  user.set('avatar', undefined);
  await user.save();
  return user;
};

// ─── Address Management ──────────────────────────────────────────────────────

/**
 * Fetches all saved addresses for a user.
 */
export const getAddresses = async (userId: string): Promise<IAddress[]> => {
  const user = await User.findById(userId).select('addresses');
  if (!user) throw new AppError('No user found', 404);
  return user.addresses;
};

/**
 * Adds a new address to the user's profile.
 * Constraints:
 * 1. Limits addresses to 10.
 * 2. If the new address is marked default, it disables 'isDefault' for all others.
 */
export const addAddress = async (userId: string, data: AddressInput): Promise<IUser> => {
  const user = await User.findById(userId);
  if (!user) throw new AppError('No user found', 404);

  if (user.addresses.length >= 10) {
    throw new AppError('You can only save a maximum of 10 addresses', 400);
  }

  // Force first address as default
  const isFirstAddress = user.addresses.length === 0;
  const newAddress = { ...data, isDefault: isFirstAddress || data.isDefault };

  // If set to default, ensure no other address is marked as default
  if (newAddress.isDefault) {
    user.addresses.forEach(a => {
      a.isDefault = false;
    });
  }

  user.addresses.push(newAddress as IAddress);
  await user.save();
  return user;
};

/**
 * Updates an existing address.
 * If setting as default, ensures previous default address is unchecked.
 */
export const updateAddress = async (
  userId: string,
  addressId: string,
  data: UpdateAddressInput
): Promise<IUser> => {
  const user = await User.findById(userId);
  if (!user) throw new AppError('No user found', 404);

  const address = user.addresses.id(addressId);
  if (!address) throw new AppError('Address not found', 404);

  // If toggling 'isDefault' to true, unset all other defaults
  if (data.isDefault === true) {
    user.addresses.forEach(a => {
      a.isDefault = false;
    });
  }

  Object.assign(address, data);
  await user.save();
  return user;
};

/**
 * Removes an address.
 * If the deleted address was the default, automatically assigns the first available address as default.
 */
export const deleteAddress = async (userId: string, addressId: string): Promise<IUser> => {
  const user = await User.findById(userId);
  if (!user) throw new AppError('No user found', 404);

  const address = user.addresses.id(addressId);
  if (!address) throw new AppError('Address not found', 404);

  const wasDefault = address.isDefault;
  user.addresses.pull(addressId);

  // Fallback: If default was deleted, make the first remaining address the default
  if (wasDefault && user.addresses.length > 0) {
    user.addresses[0]!.isDefault = true;
  }

  await user.save();
  return user;
};

/**
 * Explicitly sets a specific address as the default one.
 */
export const setDefaultAddress = async (userId: string, addressId: string): Promise<IUser> => {
  const user = await User.findById(userId);
  if (!user) throw new AppError('No user found', 404);

  const address = user.addresses.id(addressId);
  if (!address) throw new AppError('Address not found', 404);

  user.addresses.forEach(a => {
    a.isDefault = false;
  });
  address.isDefault = true;

  await user.save();
  return user;
};

// ─── Admin Management ────────────────────────────────────────────────────────

/**
 * Retrieves a paginated list of users with optional filtering.
 */
export const getAllUsers = async (
  query: AdminUserQueryInput
): Promise<{ users: IUser[]; pagination: PaginationResult }> => {
  const { page, limit, sort, order, keyword, role, isActive } = query;

  const filter: mongoose.QueryFilter<IUser> = {};
  if (keyword) {
    filter.$or = [{ name: new RegExp(keyword, 'i') }, { email: new RegExp(keyword, 'i') }];
  }
  if (role) filter.role = role;
  if (isActive !== undefined) filter.isActive = isActive;

  const skip = (page - 1) * limit;
  const sortOption: Record<string, 1 | -1> = { [sort]: order === 'asc' ? 1 : -1 };

  const [users, total] = await Promise.all([
    User.find(filter).sort(sortOption).skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    users,
    pagination: {
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
};

/**
 * Fetches a specific user by ID for administrative review.
 */
export const adminGetUserById = async (id: string): Promise<IUser> => {
  const user = await User.findById(id);
  if (!user) throw new AppError('No user found', 404);
  return user;
};

/**
 * Updates a user account (Admin level).
 * Includes security checks to prevent admins from locking or demoting themselves.
 */
export const adminUpdateUser = async (
  id: string,
  data: AdminUpdateUserInput,
  currentAdminId: string
): Promise<IUser> => {
  // Security checks: Prevent self-demotion or self-lockout
  if (id === currentAdminId && data.role && data.role !== 'admin') {
    throw new AppError('You cannot demote yourself to admin privileges', 400);
  }
  if (id === currentAdminId && data.isActive === false) {
    throw new AppError('You cannot lock your own account', 400);
  }

  const user = await User.findById(id);
  if (!user) throw new AppError('No user found', 404);

  Object.assign(user, data);

  // If locking the account, revoke refresh tokens to clear active sessions
  if (data.isActive === false) {
    user.refreshTokens = [];
  }

  await user.save();
  return user;
};

/**
 * Permanently deletes a user account.
 * Prevents admins from deleting their own account.
 */
export const adminDeleteUser = async (id: string, currentAdminId: string): Promise<void> => {
  if (id === currentAdminId) {
    throw new AppError('You cannot delete your own account', 400);
  }

  const user = await User.findById(id);
  if (!user) throw new AppError('No user found', 404);

  if (user.avatar?.publicId) {
    await deleteImage(user.avatar.publicId).catch(() => {});
  }

  await user.deleteOne();
};
