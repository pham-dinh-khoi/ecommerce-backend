import type { Response } from 'express';
import { catchAsync } from '../utils/AppError.js';
import type { AuthRequest } from '../@types/auth.types.js';
import * as userService from '../services/user.service.js';
import {
  updateProfileSchema,
  addressSchema,
  updateAddressSchema,
  adminUpdateUserSchema,
  adminUserQuerySchema,
} from '../validations/user.validation.js';

// ==========================================
// USER PROFILE MANAGEMENT
// ==========================================

export const getProfile = catchAsync(async (req: AuthRequest, res: Response) => {
  const user = await userService.getProfile(req.user!.userId);
  res.json({ success: true, message: 'OK', data: user });
});

export const updateProfile = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = updateProfileSchema.parse(req.body);
  const user = await userService.updateProfile(req.user!.userId, data);
  res.json({ success: true, message: 'Profile updated successfully', data: user });
});

// ==========================================
// AVATAR MANAGEMENT
// ==========================================

export const updateAvatar = catchAsync(async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    res.status(400).json({ success: false, message: 'Please select an avatar image' });
    return;
  }
  const user = await userService.updateAvatar(req.user!.userId, req.file);
  res.json({ success: true, message: 'Avatar updated successfully', data: user });
});

export const deleteAvatar = catchAsync(async (req: AuthRequest, res: Response) => {
  const user = await userService.deleteAvatar(req.user!.userId);
  res.json({ success: true, message: 'Avatar deleted successfully', data: user });
});

// ==========================================
// ADDRESS MANAGEMENT
// ==========================================

export const getAddresses = catchAsync(async (req: AuthRequest, res: Response) => {
  const addresses = await userService.getAddresses(req.user!.userId);
  res.json({ success: true, message: 'OK', data: addresses });
});

export const addAddress = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = addressSchema.parse(req.body);
  const user = await userService.addAddress(req.user!.userId, data);
  res
    .status(201)
    .json({ success: true, message: 'Address added successfully', data: user.addresses });
});

export const updateAddress = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = updateAddressSchema.parse(req.body);
  const rawId = req.params.addressId;
  const addressId = Array.isArray(rawId) ? rawId[0] : rawId;

  if (!addressId) {
    res.status(400).json({ success: false, message: 'Missing addressId in the path' });
    return;
  }
  const user = await userService.updateAddress(req.user!.userId, addressId, data);
  res.json({ success: true, message: 'Address updated successfully', data: user.addresses });
});

export const deleteAddress = catchAsync(async (req: AuthRequest, res: Response) => {
  const rawId = req.params.addressId;
  const addressId = Array.isArray(rawId) ? rawId[0] : rawId;

  if (!addressId) {
    res.status(400).json({ success: false, message: 'Missing addressId in the path' });
    return;
  }

  const user = await userService.deleteAddress(req.user!.userId, addressId);
  res.json({ success: true, message: 'Address deleted successfully', data: user.addresses });
});

export const setDefaultAddress = catchAsync(async (req: AuthRequest, res: Response) => {
  const rawId = req.params.addressId;
  const addressId = Array.isArray(rawId) ? rawId[0] : rawId;

  if (!addressId) {
    res.status(400).json({ success: false, message: 'Missing addressId in the path' });
    return;
  }
  const user = await userService.setDefaultAddress(req.user!.userId, addressId);
  res.json({ success: true, message: 'Default address set successfully', data: user.addresses });
});

// ==========================================
// ADMIN USER MANAGEMENT
// ==========================================

export const adminGetUsers = catchAsync(async (req: AuthRequest, res: Response) => {
  const query = adminUserQuerySchema.parse(req.query);
  const result = await userService.getAllUsers(query);
  res.json({ success: true, message: 'OK', ...result });
});

export const adminGetUserById = catchAsync(async (req: AuthRequest, res: Response) => {
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;

  if (!id) {
    res.status(400).json({ success: false, message: 'Missing ID in the path' });
    return;
  }
  const user = await userService.adminGetUserById(id);
  res.json({ success: true, message: 'OK', data: user });
});

export const adminUpdateUser = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = adminUpdateUserSchema.parse(req.body);
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;

  if (!id) {
    res.status(400).json({ success: false, message: 'Missing ID in the path' });
    return;
  }

  const user = await userService.adminUpdateUser(id, data, req.user!.userId);
  res.json({ success: true, message: 'User updated successfully', data: user });
});

export const adminDeleteUser = catchAsync(async (req: AuthRequest, res: Response) => {
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;

  if (!id) {
    res.status(400).json({ success: false, message: 'Missing ID in the path' });
    return;
  }

  await userService.adminDeleteUser(id, req.user!.userId);
  res.json({ success: true, message: 'User deleted successfully' });
});
