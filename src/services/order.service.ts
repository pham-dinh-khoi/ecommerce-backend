import mongoose from 'mongoose';
import { Order, type IOrder, type OrderStatus, VALID_TRANSITIONS } from '../models/order.model.js';
import { Cart } from '../models/cart.model.js';
import { Product } from '../models/product.model.js';
import { User } from '../models/user.model.js';
import { AppError } from '../utils/AppError.js';
import { type PaginationResult } from '../@types/product.types.js';
import * as couponService from './coupon.service.js';
import type {
  PlaceOrderInput,
  UpdateStatusInput,
  CancelOrderInput,
  UserOrderQueryInput,
  AdminOrderQueryInput,
} from '../validations/order.validation.js';

// ==========================================
// CONSTANTS & HELPERS
// ==========================================

const SHIPPING_FEE_DEFAULT = 30_000;

/**
 * Validates if an order can transition from its current status to a new status
 * based on the state machine definition.
 */
const canTransition = (from: OrderStatus, to: OrderStatus): boolean =>
  VALID_TRANSITIONS[from].includes(to);

// ==========================================
// CORE BUSINESS OPERATIONS
// ==========================================

/**
 * Handles the order placement process.
 * 1. Validates cart.
 * 2. Resolves shipping address.
 * 3. Atomic transaction: Stock validation, price calculation, and discount application.
 * 4. Creates order and clears the cart.
 */
export const placeOrder = async (userId: string, input: PlaceOrderInput): Promise<IOrder> => {
  const cart = await Cart.findOne({ user: userId });
  if (!cart || cart.items.length === 0) {
    throw new AppError('Cart is empty. Please add items before placing an order.', 400);
  }

  let shippingAddress;
  if (input.addressId) {
    const user = await User.findById(userId);
    const addr = user?.addresses.id(input.addressId);
    if (!addr) throw new AppError('Shipping address not found', 404);
    shippingAddress = addr;
  } else {
    shippingAddress = input.newAddress!;
  }

  // Use a session to maintain atomicity and prevent race conditions (overselling)
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const productIds = cart.items.map(i => i.product);
    const products = await Product.find({ _id: { $in: productIds } }).session(session);
    const productMap = new Map(products.map(p => [p._id.toString(), p]));

    const orderItems = [];
    let subtotal = 0;

    // Validate stock and prepare order items
    for (const cartItem of cart.items) {
      const product = productMap.get(cartItem.product.toString());
      if (!product || product.status !== 'active') {
        throw new AppError(`Product "${cartItem.name}" is no longer available`, 400);
      }

      const variant = product.variants.find(v => v._id?.toString() === cartItem.variant.toString());
      if (!variant || !variant.isActive) {
        throw new AppError(`Product variant "${cartItem.sku}" is no longer available`, 400);
      }
      if (variant.stock < cartItem.quantity) {
        throw new AppError(
          `"${cartItem.name}" (${cartItem.sku}) only has ${variant.stock} units left`,
          400
        );
      }

      // Deduct stock immediately
      variant.stock -= cartItem.quantity;
      if (variant.stock === 0) variant.isActive = false;

      const itemSubtotal = variant.price * cartItem.quantity;
      subtotal += itemSubtotal;

      const image =
        variant.images.find(img => img.isPrimary)?.url ||
        variant.images[0]?.url ||
        product.images.find(img => img.isPrimary)?.url ||
        product.images[0]?.url;

      orderItems.push({
        product: product._id,
        variant: variant._id!,
        sku: variant.sku,
        name: product.name,
        ...(image && { image }),
        price: variant.price,
        quantity: cartItem.quantity,
        subtotal: itemSubtotal,
      });

      // Update product aggregate statistics
      product.totalStock = product.variants.reduce((sum, v) => sum + (v.isActive ? v.stock : 0), 0);
      const activePrices = product.variants.filter(v => v.isActive).map(v => v.price);
      if (activePrices.length > 0) {
        product.minPrice = Math.min(...activePrices);
        product.maxPrice = Math.max(...activePrices);
      }

      await product.save({ session });
    }

    const shippingFee = SHIPPING_FEE_DEFAULT;
    let discountAmount = 0;
    let couponCode: string | undefined;

    const orderSummaryForCoupon = {
      subtotal,
      shippingFee,
      items: orderItems.map(i => ({
        productId: i.product.toString(),
        quantity: i.quantity,
        price: i.price,
      })),
      paymentMethod: input.paymentMethod,
    };

    // Apply Coupon validation
    let couponResult: couponService.CouponApplyResult | undefined;
    if (input.couponCode) {
      try {
        const user = await User.findById(userId).select('role');
        couponResult = await couponService.previewCoupon(
          input.couponCode,
          userId,
          user?.role || 'user'
        );
        discountAmount = couponResult.discountAmount;
        couponCode = input.couponCode;
      } catch (err) {
        await session.abortTransaction();
        throw err;
      }
    }

    const totalAmount = Math.max(0, subtotal + shippingFee - discountAmount);

    // Create Order Record
    const orders = (await Order.create(
      [
        {
          user: userId,
          items: orderItems,
          shipping: {
            recipientName: shippingAddress.recipientName,
            recipientPhone: shippingAddress.recipientPhone,
            province: shippingAddress.province,
            district: shippingAddress.district,
            ward: shippingAddress.ward,
            streetAddress: shippingAddress.streetAddress,
          },
          payment: {
            method: input.paymentMethod,
            status: 'pending',
            amount: totalAmount,
          },
          subtotal,
          shippingFee,
          discountAmount,
          totalAmount,
          ...(couponCode && { couponCode }),
          ...(input.note && { note: input.note }),
        },
      ],
      { session }
    )) as unknown as IOrder[];

    const order = orders[0];

    // Finalize Coupon usage
    if (couponResult && couponCode) {
      const user = await User.findById(userId).select('role');
      await couponService
        .applyCoupon(
          couponCode,
          userId,
          user?.role || 'user',
          order!._id.toString(),
          orderSummaryForCoupon
        )
        .catch(async err => {
          await session.abortTransaction();
          throw err;
        });
    }

    // Clean up cart
    await Cart.findOneAndUpdate(
      { user: userId },
      { $set: { items: [], totalItems: 0, totalAmount: 0 } },
      { session }
    );

    await session.commitTransaction();
    return order!;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

// ==========================================
// QUERYING OPERATIONS
// ==========================================

/**
 * Retrieves the paginated list of orders for a specific user.
 */
export const getUserOrders = async (
  userId: string,
  query: UserOrderQueryInput
): Promise<{ orders: IOrder[]; pagination: PaginationResult }> => {
  const { page, limit, status } = query;
  const filter: mongoose.QueryFilter<IOrder> = { user: userId };
  if (status) filter.status = status;

  const skip = (page - 1) * limit;
  const [orders, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).select('-timeline').lean(),
    Order.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(total / limit);
  return {
    orders: orders as unknown as IOrder[],
    pagination: { total, page, limit, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
  };
};

/**
 * Retrieves a single order by ID or orderCode.
 */
export const getOrderById = async (orderId: string, userId?: string): Promise<IOrder> => {
  const filter: mongoose.QueryFilter<IOrder> = {};

  if (mongoose.Types.ObjectId.isValid(orderId)) {
    filter._id = orderId;
  } else {
    filter.orderCode = orderId.toUpperCase();
  }

  const order = await Order.findOne(filter).populate('user', 'name email phone');
  if (!order) throw new AppError('Order not found', 404);

  if (userId && order.user._id.toString() !== userId) {
    throw new AppError('You do not have permission to view this order', 403);
  }

  return order;
};

/**
 * Admin view: Paginated list of orders with filters.
 */
export const adminGetOrders = async (
  query: AdminOrderQueryInput
): Promise<{ orders: IOrder[]; pagination: PaginationResult }> => {
  const { page, limit, status, userId, keyword, paymentMethod, fromDate, toDate, sort, order } =
    query;

  const filter: mongoose.QueryFilter<IOrder> = {};
  if (status) filter.status = status;
  if (userId) filter.user = userId;
  if (keyword) filter.orderCode = new RegExp(keyword, 'i');
  if (paymentMethod) filter['payment.method'] = paymentMethod;
  if (fromDate || toDate) {
    filter.createdAt = {};
    if (fromDate) filter.createdAt.$gte = new Date(fromDate);
    if (toDate) filter.createdAt.$lte = new Date(toDate);
  }

  const skip = (page - 1) * limit;
  const sortOption: Record<string, 1 | -1> = { [sort]: order === 'asc' ? 1 : -1 };

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .sort(sortOption)
      .skip(skip)
      .limit(limit)
      .populate('user', 'name email phone')
      .select('-timeline')
      .lean(),
    Order.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(total / limit);
  return {
    orders: orders as unknown as IOrder[],
    pagination: { total, page, limit, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
  };
};

/**
 * Admin analytics: Returns aggregated order statistics.
 */
export const getOrderStats = async () => {
  const [statusCounts, revenueResult] = await Promise.all([
    Order.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Order.aggregate([
      { $match: { status: 'delivered' } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$totalAmount' },
          totalOrders: { $sum: 1 },
          avgOrderValue: { $avg: '$totalAmount' },
        },
      },
    ]),
  ]);

  const counts = Object.fromEntries(statusCounts.map(s => [s._id, s.count]));
  const revenue = revenueResult[0] || { totalRevenue: 0, totalOrders: 0, avgOrderValue: 0 };

  return {
    byStatus: counts,
    revenue: {
      total: revenue.totalRevenue,
      deliveredOrders: revenue.totalOrders,
      avgOrderValue: Math.round(revenue.avgOrderValue),
    },
  };
};

// ==========================================
// STATE MANAGEMENT OPERATIONS
// ==========================================

/**
 * User request to cancel an order.
 */
export const cancelOrderByUser = async (
  orderId: string,
  userId: string,
  input: CancelOrderInput
): Promise<IOrder> => {
  const order = await Order.findOne({ _id: orderId, user: userId });
  if (!order) throw new AppError('Order not found', 404);

  if (!['pending', 'confirmed'].includes(order.status)) {
    throw new AppError(
      `Cannot cancel an order with status "${order.status}". Cancellation is only allowed for pending/confirmed orders.`,
      400
    );
  }

  return performCancellation(order, input.reason, 'user', userId);
};

/**
 * Admin request to update order status.
 */
export const updateOrderStatus = async (
  orderId: string,
  input: UpdateStatusInput,
  adminId: string
): Promise<IOrder> => {
  const order = await Order.findById(orderId);
  if (!order) throw new AppError('Order not found', 404);

  const { status, note, carrier, trackingCode, estimatedDelivery } = input;

  if (!canTransition(order.status, status)) {
    throw new AppError(`Cannot transition from "${order.status}" to "${status}"`, 400);
  }

  if (status === 'cancelled') {
    return performCancellation(order, note || 'Admin cancelled the order', 'admin', adminId);
  }

  if (status === 'shipped') {
    if (carrier !== undefined) order.shipping.carrier = carrier;
    if (trackingCode !== undefined) order.shipping.trackingCode = trackingCode;
    order.shipping.shippedAt = new Date();
    if (estimatedDelivery) {
      order.shipping.estimatedDelivery = new Date(estimatedDelivery);
    }
  }

  if (status === 'delivered') {
    order.shipping.deliveredAt = new Date();

    if (order.payment.method === 'cod') {
      order.payment.status = 'paid';
      order.payment.paidAt = new Date();
    }

    updateSoldCount(order).catch(e => console.error('updateSoldCount error:', e));
  }

  order.status = status;
  order.timeline.push({
    status,
    timestamp: new Date(),
    ...(note !== undefined && { note }),
    updatedBy: new mongoose.Types.ObjectId(adminId),
  });

  await order.save();
  return order;
};

// ==========================================
// PRIVATE HELPER METHODS
// ==========================================

/**
 * Performs order cancellation, including stock restoration and coupon rollback.
 */
const performCancellation = async (
  order: IOrder,
  reason: string,
  cancelledBy: 'user' | 'admin' | 'system',
  actorId: string
): Promise<IOrder> => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    for (const item of order.items) {
      await Product.findOneAndUpdate(
        { _id: item.product, 'variants._id': item.variant },
        {
          $inc: {
            'variants.$.stock': item.quantity,
            totalStock: item.quantity,
          },
          $set: { 'variants.$.isActive': true },
        },
        { session }
      );
    }

    order.status = 'cancelled';
    order.cancellation = {
      reason,
      cancelledBy,
      cancelledAt: new Date(),
      userId: new mongoose.Types.ObjectId(actorId),
    };
    order.timeline.push({
      status: 'cancelled',
      timestamp: new Date(),
      note: reason,
      updatedBy: new mongoose.Types.ObjectId(actorId),
    });

    if (order.couponCode) {
      await couponService
        .rollbackCoupon(order.couponCode, order.user.toString(), order._id.toString())
        .catch(e => console.error('Coupon rollback error:', e));
    }

    if (order.payment.status === 'paid') {
      order.payment.status = 'refunded';
      order.payment.refundedAt = new Date();
      order.payment.refundAmount = order.payment.amount;
    }

    await order.save({ session });
    await session.commitTransaction();
    return order;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

/**
 * Updates the sold count statistics for products after delivery.
 */
const updateSoldCount = async (order: IOrder): Promise<void> => {
  for (const item of order.items) {
    await Product.findByIdAndUpdate(item.product, {
      $inc: { soldCount: item.quantity },
    });
  }
};

export const cancelOrderBySystem = async (orderId: string, reason: string): Promise<void> => {
  const order = await Order.findById(orderId);
  if (!order) return; 

  if (!['pending'].includes(order.status)) return;

  await performCancellation(order, reason, 'system', order.user.toString());
};
