import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'ID không hợp lệ');

const categoryBaseSchema = z.object({
  name: z
    .string({ message: 'Tên danh mục là bắt buộc' })
    .min(2, 'Tên ít nhất 2 ký tự')
    .max(100, 'Tên không quá 100 ký tự')
    .trim(),
  description: z.string().max(500, 'Mô tả không quá 500 ký tự').optional(),
  parent: objectId.optional(),
  sortOrder: z.coerce.number().int().min(0).default(0),
  isActive: z.coerce.boolean().default(true),
});

export const createCategorySchema = categoryBaseSchema;
export const updateCategorySchema = categoryBaseSchema.partial();

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
