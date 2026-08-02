import multer, { type FileFilterCallback } from 'multer';
import type { Request } from 'express';
import { AppError } from '../utils/AppError.js';

// Use memory storage — buffers will be streamed directly to Cloud/Storage service
const storage = multer.memoryStorage();

// Restrict uploads to specific image formats
const fileFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
  const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError('Only JPEG, PNG, and WebP formats are allowed', 400));
  }
};

// ==========================================
// UPLOAD INSTANCES
// ==========================================

/**
 * Product Images
 * Max 10 files, 5MB limit each
 */
export const uploadProductImages = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
    files: 10,
  },
}).array('images', 10);

/**
 * Category Image
 * Single file, 2MB limit
 */
export const uploadCategoryImage = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2 MB
    files: 1,
  },
}).single('image');

/**
 * Variant Images
 * Max 5 files, 5MB limit each
 */
export const uploadVariantImages = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
    files: 5,
  },
}).array('images', 5);

/**
 * User Avatar
 * Single file, 2MB limit
 */
export const uploadAvatar = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2 MB
    files: 1,
  },
}).single('avatar');