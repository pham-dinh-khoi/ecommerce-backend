import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env.config.js';
import type { CloudinaryUploadResult } from '../@types/product.types.js';

// Configuration
cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME!,
  api_key: env.CLOUDINARY_API_KEY!,
  api_secret: env.CLOUDINARY_API_SECRET!,
});

// ==========================================
// UPLOAD OPERATIONS
// ==========================================

/**
 * Uploads an image buffer to Cloudinary using a stream.
 *
 * @param buffer - The image data
 * @param folder - The Cloudinary folder path
 * @param options - Optional width/height constraints
 */
export const uploadImage = (
  buffer: Buffer,
  folder: string,
  options: { width?: number; height?: number } = {}
): Promise<CloudinaryUploadResult> => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: `ecommerce/${folder}`,
        transformation: [
          {
            width: options.width || 1200,
            height: options.height || 1200,
            crop: 'limit', // Resize only if larger than dimensions, no cropping
            quality: 'auto:good', // Optimal balance of quality and file size
            fetch_format: 'auto', // Serves WebP/AVIF if browser supports it
          },
        ],
        resource_type: 'image',
      },
      (error, result) => {
        if (error || !result) return reject(error || new Error('Upload failed'));
        resolve(result as CloudinaryUploadResult);
      }
    );
    uploadStream.end(buffer);
  });
};

/**
 * Uploads multiple files concurrently using Promise.all.
 */
export const uploadImages = async (
  files: Express.Multer.File[],
  folder: string
): Promise<CloudinaryUploadResult[]> => {
  return Promise.all(files.map(file => uploadImage(file.buffer, folder)));
};

// ==========================================
// DELETE OPERATIONS
// ==========================================

/**
 * Deletes a single image by its public ID.
 */
export const deleteImage = async (publicId: string): Promise<void> => {
  await cloudinary.uploader.destroy(publicId);
};

/**
 * Deletes multiple images by an array of public IDs.
 */
export const deleteImages = async (publicIds: string[]): Promise<void> => {
  if (!publicIds.length) return;
  await Promise.all(publicIds.map(id => deleteImage(id)));
};

// ==========================================
// TRANSFORMATIONS & HELPERS
// ==========================================

/**
 * Generates an on-the-fly thumbnail URL.
 * Does not require storing a separate file on the server.
 */
export const getThumbnailUrl = (publicId: string, width = 300, height = 300): string => {
  return cloudinary.url(publicId, {
    width,
    height,
    crop: 'fill', // Fills area, cropping as necessary
    quality: 'auto',
    fetch_format: 'auto',
  });
};
