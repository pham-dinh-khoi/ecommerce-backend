import type { Request, Response } from 'express';
import { catchAsync } from '../utils/AppError.js';
import * as categoryService from '../services/category.service.js';
import { createCategorySchema, updateCategorySchema } from '../validations/category.validation.js';

// ─── GET CATEGORY TREE ────────────────────────────────────────────────────────

export const getCategoryTree = catchAsync(async (_req: Request, res: Response) => {
  const categories = await categoryService.getCategoryTree();
  res.json({ success: true, message: 'OK', data: categories });
});

// ─── GET ALL CATEGORIES ───────────────────────────────────────────────────────

export const getAllCategories = catchAsync(async (req: Request, res: Response) => {
  const includeInactive = req.query.includeInactive === 'true';
  const categories = await categoryService.getAllCategories(includeInactive);
  res.json({ success: true, message: 'OK', data: categories });
});

// ─── GET CATEGORY BY ID ───────────────────────────────────────────────────────

export const getCategoryById = catchAsync(async (req: Request, res: Response) => {
  const category = await categoryService.getCategoryById(req.params.id as string);
  res.json({ success: true, message: 'OK', data: category });
});

// ─── CREATE CATEGORY ──────────────────────────────────────────────────────────

export const createCategory = catchAsync(async (req: Request, res: Response) => {
  const data = createCategorySchema.parse(req.body);
  const imageFile = req.file;
  const category = await categoryService.createCategory(data, imageFile);
  res.status(201).json({ success: true, message: 'Category created successfully', data: category });
});

// ─── UPDATE CATEGORY ──────────────────────────────────────────────────────────

export const updateCategory = catchAsync(async (req: Request, res: Response) => {
  const data = updateCategorySchema.parse(req.body);
  const imageFile = req.file;
  const category = await categoryService.updateCategory(req.params.id as string, data, imageFile);
  res.json({ success: true, message: 'Category updated successfully', data: category });
});

// ─── DELETE CATEGORY ──────────────────────────────────────────────────────────

export const deleteCategory = catchAsync(async (req: Request, res: Response) => {
  await categoryService.deleteCategory(req.params.id as string);
  res.json({ success: true, message: 'Category deleted successfully' });
});
