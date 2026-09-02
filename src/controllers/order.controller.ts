import type { Response } from 'express';
import { catchAsync } from '../utils/AppError.js';
import type { AuthRequest } from '../@types/auth.types.js';
import * as orderService from '../services/order.service.js';
import {
  placeOrderSchema,
  updateStatusSchema,
  cancelOrderSchema,
  userOrderQuerySchema,
  adminOrderQuerySchema,
} from '../validations/order.validation.js';

// ─── USER: Place Order ────────────────────────────────────────────────────────

export const placeOrder = catchAsync(async (req: AuthRequest, res: Response) => {
  const input = placeOrderSchema.parse(req.body);
  const order = await orderService.placeOrder(req.user!.userId, input);
  res.status(201).json({
    success: true,
    message: 'Order placed successfully',
    data: order,
  });
});

// ─── USER: Get Order History ──────────────────────────────────────────────────

export const getMyOrders = catchAsync(async (req: AuthRequest, res: Response) => {
  const query = userOrderQuerySchema.parse(req.query);
  const result = await orderService.getUserOrders(req.user!.userId, query);
  res.json({ success: true, message: 'OK', ...result });
});

// ─── USER: Get Order Details by ID ───────────────────────────────────────────

export const getMyOrderById = catchAsync(async (req: AuthRequest, res: Response) => {
  const orderId = req.params.orderId as string;
  const order = await orderService.getOrderById(orderId, req.user!.userId);
  res.json({ success: true, message: 'OK', data: order });
});

// ─── USER: Cancel Order ───────────────────────────────────────────────────────

export const cancelMyOrder = catchAsync(async (req: AuthRequest, res: Response) => {
  const orderId = req.params.orderId as string;
  const input = cancelOrderSchema.parse(req.body);
  const order = await orderService.cancelOrderByUser(orderId, req.user!.userId, input);
  res.json({ success: true, message: 'Order cancelled successfully', data: order });
});

// ─── ADMIN: Get All Orders ────────────────────────────────────────────────────

export const adminGetOrders = catchAsync(async (req: AuthRequest, res: Response) => {
  const query = adminOrderQuerySchema.parse(req.query);
  const result = await orderService.adminGetOrders(query);
  res.json({ success: true, message: 'OK', ...result });
});

// ─── ADMIN: Get Order Details by ID ───────────────────────────────────────────

export const adminGetOrderById = catchAsync(async (req: AuthRequest, res: Response) => {
  const orderId = req.params.orderId as string;
  const order = await orderService.getOrderById(orderId); // Omit userId for admin mode
  res.json({ success: true, message: 'OK', data: order });
});

// ─── ADMIN: Update Order Status ───────────────────────────────────────────────

export const adminUpdateStatus = catchAsync(async (req: AuthRequest, res: Response) => {
  const orderId = req.params.orderId as string;
  const input = updateStatusSchema.parse(req.body);
  const order = await orderService.updateOrderStatus(orderId, input, req.user!.userId);
  res.json({
    success: true,
    message: `Order status updated to "${input.status}" successfully`,
    data: order,
  });
});

// ─── ADMIN: Get Order Statistics ──────────────────────────────────────────────

export const adminGetStats = catchAsync(async (_req: AuthRequest, res: Response) => {
  const stats = await orderService.getOrderStats();
  res.json({ success: true, message: 'OK', data: stats });
});
