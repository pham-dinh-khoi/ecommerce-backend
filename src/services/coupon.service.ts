import mongoose from 'mongoose';
import { Coupon, type ICoupon, type IDiscountValue } from '../models/coupon.model.js';
import { Order } from '../models/order.model.js';
import { Cart } from '../models/cart.model.js';
import { AppError } from '../utils/AppError.js';
import type { PaginationResult } from '../@types/product.types.js';
import type {
  CreateCouponInput,
  UpdateCouponInput,
  ApplyCouponInput,
  CouponQueryInput,
} from '../validations/coupon.validation.js';

// ==========================================
// INTERFACES & TYPES
// ==========================================

export interface CouponApplyResult {
  couponId: string;
  code: string;
  discountType: string;
  discountAmount: number; // Actual reduction amount
  description: string;
  freeItems?: Array<{ productId: string; quantity: number }>;
}

export interface OrderSummary {
  subtotal: number;
  shippingFee: number;
  items: Array<{
    productId: string;
    categoryId?: string;
    quantity: number;
    price: number;
  }>;
  paymentMethod?: string;
}

// ==========================================
// INTERNAL VALIDATION UTILITIES
// ==========================================

/**
 * Ensures the coupon exists in the database and is currently active.
 */
const validateExists = async (code: string): Promise<ICoupon> => {
  const coupon = await Coupon.findOne({ code: code.toUpperCase() });
  if (!coupon) throw new AppError('Coupon does not exist', 404);
  if (!coupon.isActive) throw new AppError('Coupon has been deactivated', 400);
  return coupon;
};

/**
 * Checks if the current date is within the coupon's valid date range.
 */
const validateDateRange = (coupon: ICoupon): void => {
  const now = new Date();
  if (now < coupon.startDate) {
    throw new AppError(
      `Coupon is not yet active. Valid from ${coupon.startDate.toLocaleDateString('vi-VN')}`,
      400
    );
  }
  if (now > coupon.endDate) {
    throw new AppError(
      `Coupon expired on ${coupon.endDate.toLocaleDateString('vi-VN')}`,
      400
    );
  }
};

/**
 * Checks if the global usage limit of the coupon has been reached.
 */
const validateGlobalUsage = (coupon: ICoupon): void => {
  if (
    coupon.limits.maxUsageTotal !== undefined &&
    coupon.limits.usedCount >= coupon.limits.maxUsageTotal
  ) {
    throw new AppError('Coupon usage limit reached', 400);
  }
};

/**
 * Checks if the specific user has exceeded their personal usage limit for this coupon.
 */
const validatePerUserUsage = (coupon: ICoupon, userId: string): void => {
  if (!coupon.limits.maxUsagePerUser) return;

  const userUsageCount = coupon.usageHistory.filter(h => h.user.toString() === userId).length;

  if (userUsageCount >= coupon.limits.maxUsagePerUser) {
    throw new AppError(
      `You have already used this coupon ${userUsageCount} times (Max: ${coupon.limits.maxUsagePerUser})`,
      400
    );
  }
};

/**
 * Validates complex business rules (e.g., minimum/maximum order value, roles, products).
 */
const validateOrderConditions = async (
  coupon: ICoupon,
  order: OrderSummary,
  userId: string,
  userRole: string
): Promise<void> => {
  const cond = coupon.conditions;

  // Min Order Amount validation
  if (cond.minOrderAmount && order.subtotal < cond.minOrderAmount) {
    throw new AppError(
      `Minimum order value is ${cond.minOrderAmount.toLocaleString('vi-VN')}đ (Current: ${order.subtotal.toLocaleString('vi-VN')}đ)`,
      400
    );
  }

  // Max Order Amount validation
  if (cond.maxOrderAmount && order.subtotal > cond.maxOrderAmount) {
    throw new AppError(
      `This coupon only applies to orders under ${cond.maxOrderAmount.toLocaleString('vi-VN')}đ`,
      400
    );
  }

  // User Role validation
  if (cond.allowedUserRoles?.length && !cond.allowedUserRoles.includes(userRole)) {
    throw new AppError('Coupon not applicable for your account type', 400);
  }

  // Payment Method validation
  if (
    cond.allowedPaymentMethods?.length &&
    order.paymentMethod &&
    !cond.allowedPaymentMethods.includes(order.paymentMethod)
  ) {
    throw new AppError(`Coupon only applies to: ${cond.allowedPaymentMethods.join(', ')}`, 400);
  }

  // First Order Only validation
  if (cond.firstOrderOnly) {
    const previousOrderCount = await Order.countDocuments({
      user: userId,
      status: { $nin: ['cancelled'] },
    });
    if (previousOrderCount > 0) {
      throw new AppError('Coupon valid for the first order only', 400);
    }
  }

  // Product/Category inclusion validation
  if (cond.allowedProducts?.length || cond.allowedCategories?.length) {
    const allowedProductIds = (cond.allowedProducts || []).map(id => id.toString());
    const allowedCategoryIds = (cond.allowedCategories || []).map(id => id.toString());

    const hasEligibleItem = order.items.some(
      item =>
        allowedProductIds.includes(item.productId) ||
        (item.categoryId && allowedCategoryIds.includes(item.categoryId))
    );

    if (!hasEligibleItem) {
      throw new AppError('No eligible items in cart for this coupon', 400);
    }
  }

  // Product exclusion validation
  if (cond.excludedProducts?.length) {
    const excludedIds = cond.excludedProducts.map(id => id.toString());
    const allExcluded = order.items.every(item => excludedIds.includes(item.productId));
    if (allExcluded) {
      throw new AppError('All items in cart are excluded from this coupon', 400);
    }
  }
};

/**
 * Calculates discount amount based on discount type.
 */
const calculateDiscount = (
  discount: IDiscountValue,
  order: OrderSummary
): { discountAmount: number; freeItems?: CouponApplyResult['freeItems'] } => {
  switch (discount.type) {
    case 'percentage': {
      const raw = order.subtotal * (discount.amount / 100);
      const discountAmount = discount.maxDiscount ? Math.min(raw, discount.maxDiscount) : raw;
      return { discountAmount: Math.round(discountAmount) };
    }

    case 'fixed': {
      // Ensure discount doesn't exceed order subtotal
      return { discountAmount: Math.min(discount.amount, order.subtotal) };
    }

    case 'free_shipping': {
      return { discountAmount: order.shippingFee };
    }

    case 'buy_x_get_y': {
      // Find eligible items for the "Buy X Get Y" promotion
      const eligibleItems = order.items.filter(item => {
        if (discount.getProductId) {
          return item.productId === discount.getProductId.toString();
        }
        return true; 
      });

      const freeItems: CouponApplyResult['freeItems'] = [];
      let totalFreeValue = 0;

      for (const item of eligibleItems) {
        const setsOfBuy = Math.floor(item.quantity / (discount.buyQuantity || 1));
        const freeQty = Math.min(setsOfBuy * (discount.getQuantity || 1), item.quantity);

        if (freeQty > 0) {
          freeItems.push({ productId: item.productId, quantity: freeQty });
          totalFreeValue += freeQty * item.price;
        }
      }

      return { discountAmount: Math.round(totalFreeValue), freeItems };
    }

    default:
      return { discountAmount: 0 };
  }
};

// ==========================================
// BUSINESS SERVICES
// ==========================================

/**
 * Previews the coupon application without saving to the database.
 */
export const previewCoupon = async (
  code: string,
  userId: string,
  userRole: string
): Promise<CouponApplyResult & { orderSummary: OrderSummary }> => {
  const coupon = await validateExists(code);
  validateDateRange(coupon);
  validateGlobalUsage(coupon);
  validatePerUserUsage(coupon, userId);

  const cart = await Cart.findOne({ user: userId });
  if (!cart || cart.items.length === 0) {
    throw new AppError('Cart is empty', 400);
  }

  const SHIPPING_FEE = 30_000;
  const orderSummary: OrderSummary = {
    subtotal: cart.totalAmount,
    shippingFee: SHIPPING_FEE,
    items: cart.items.map(item => ({
      productId: item.product.toString(),
      quantity: item.quantity,
      price: item.price,
    })),
  };

  await validateOrderConditions(coupon, orderSummary, userId, userRole);

  const { discountAmount, freeItems } = calculateDiscount(coupon.discount, orderSummary);

  return {
    couponId: coupon._id.toString(),
    code: coupon.code,
    discountType: coupon.discount.type,
    discountAmount,
    description: coupon.description,
    ...(freeItems && { freeItems }),
    orderSummary,
  };
};

/**
 * Atomically applies a coupon to an order.
 */
export const applyCoupon = async (
  code: string,
  userId: string,
  userRole: string,
  orderId: string,
  orderSummary: OrderSummary
): Promise<CouponApplyResult> => {
  const coupon = await validateExists(code);
  validateDateRange(coupon);
  validateGlobalUsage(coupon);
  validatePerUserUsage(coupon, userId);
  await validateOrderConditions(coupon, orderSummary, userId, userRole);

  const { discountAmount, freeItems } = calculateDiscount(coupon.discount, orderSummary);

  // Atomic update to handle race conditions
  const updateFilter: mongoose.QueryFilter<ICoupon> = {
    _id: coupon._id,
    isActive: true,
    startDate: { $lte: new Date() },
    endDate: { $gte: new Date() },
  };

  if (coupon.limits.maxUsageTotal !== undefined) {
    updateFilter['limits.usedCount'] = { $lt: coupon.limits.maxUsageTotal };
  }

  const updated = await Coupon.findOneAndUpdate(
    updateFilter,
    {
      $inc: { 'limits.usedCount': 1 },
      $push: {
        usageHistory: {
          user: new mongoose.Types.ObjectId(userId),
          order: new mongoose.Types.ObjectId(orderId),
          usedAt: new Date(),
          discountAmount,
        },
      },
    },
    { new: true }
  );

  if (!updated) {
    throw new AppError('Coupon usage limit reached between validation and update', 400);
  }

  return {
    couponId: coupon._id.toString(),
    code: coupon.code,
    discountType: coupon.discount.type,
    discountAmount,
    description: coupon.description,
    ...(freeItems && { freeItems }),
  };
};

/**
 * Rolls back the coupon usage in case an order is cancelled.
 */
export const rollbackCoupon = async (
  code: string,
  userId: string,
  orderId: string
): Promise<void> => {
  await Coupon.findOneAndUpdate(
    { code: code.toUpperCase() },
    {
      $inc: { 'limits.usedCount': -1 },
      $pull: {
        usageHistory: {
          user: new mongoose.Types.ObjectId(userId),
          order: new mongoose.Types.ObjectId(orderId),
        },
      },
    }
  );
};

// ==========================================
// ADMIN OPERATIONS
// ==========================================

export const createCoupon = async (input: CreateCouponInput, adminId: string): Promise<ICoupon> => {
  const existing = await Coupon.findOne({ code: input.code });
  if (existing) throw new AppError(`Coupon code "${input.code}" already exists`, 400);

  const coupon = await Coupon.create({
    code: input.code,
    description: input.description,
    discount: {
      type: input.discountType,
      amount: input.discountAmount,
      ...(input.maxDiscount !== undefined && { maxDiscount: input.maxDiscount }),
      ...(input.buyQuantity !== undefined && { buyQuantity: input.buyQuantity }),
      ...(input.getQuantity !== undefined && { getQuantity: input.getQuantity }),
      ...(input.getProductId !== undefined && { getProductId: input.getProductId }),
    },
    conditions: {
      ...(input.minOrderAmount !== undefined && { minOrderAmount: input.minOrderAmount }),
      ...(input.maxOrderAmount !== undefined && { maxOrderAmount: input.maxOrderAmount }),
      ...(input.allowedProducts.length && { allowedProducts: input.allowedProducts }),
      ...(input.excludedProducts.length && { excludedProducts: input.excludedProducts }),
      ...(input.allowedCategories.length && { allowedCategories: input.allowedCategories }),
      ...(input.allowedUserRoles.length && { allowedUserRoles: input.allowedUserRoles }),
      ...(input.allowedPaymentMethods.length && {
        allowedPaymentMethods: input.allowedPaymentMethods,
      }),
      firstOrderOnly: input.firstOrderOnly,
    },
    limits: {
      ...(input.maxUsageTotal !== undefined && { maxUsageTotal: input.maxUsageTotal }),
      maxUsagePerUser: input.maxUsagePerUser,
      usedCount: 0,
    },
    startDate: input.startDate,
    endDate: input.endDate,
    isActive: input.isActive,
    createdBy: adminId,
  });

  return coupon;
};

export const getCoupons = async (
  query: CouponQueryInput
): Promise<{ coupons: ICoupon[]; pagination: PaginationResult }> => {
  const { page, limit, keyword, isActive, type, sort, order } = query;

  const filter: mongoose.QueryFilter<ICoupon> = {};
  if (keyword) filter.code = new RegExp(keyword, 'i');
  if (isActive !== undefined) filter.isActive = isActive;
  if (type) filter['discount.type'] = type;

  const skip = (page - 1) * limit;
  const sortDir = order === 'asc' ? 1 : (-1 as 1 | -1);

  const sortMap: Record<string, Record<string, 1 | -1>> = {
    createdAt: { createdAt: sortDir },
    endDate: { endDate: sortDir },
    usedCount: { 'limits.usedCount': sortDir },
  };

  const sortOpt = sortMap[sort] ?? { createdAt: -1 as const };

  const [coupons, total] = await Promise.all([
    Coupon.find(filter)
      .select('-usageHistory') 
      .sort(sortOpt)
      .skip(skip)
      .limit(limit)
      .lean(),
    Coupon.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(total / limit);
  return {
    coupons: coupons as unknown as ICoupon[],
    pagination: { total, page, limit, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
  };
};

export const getCouponById = async (id: string): Promise<ICoupon> => {
  const coupon = await Coupon.findById(id).populate('createdBy', 'name email');
  if (!coupon) throw new AppError('Coupon not found', 404);
  return coupon;
};

export const updateCoupon = async (id: string, input: UpdateCouponInput): Promise<ICoupon> => {
  const coupon = await Coupon.findById(id);
  if (!coupon) throw new AppError('Coupon not found', 404);
  
  // Prevent modification of discount values if the coupon has already been used
  if (coupon.limits.usedCount > 0 && input.discountAmount !== undefined) {
    throw new AppError('Cannot modify discount value for a coupon that has been used', 400);
  }

  if (input.description !== undefined) coupon.description = input.description;
  if (input.isActive !== undefined) coupon.isActive = input.isActive;
  if (input.startDate !== undefined) coupon.startDate = input.startDate;
  if (input.endDate !== undefined) coupon.endDate = input.endDate;
  if (input.maxUsageTotal !== undefined) coupon.limits.maxUsageTotal = input.maxUsageTotal;
  if (input.maxUsagePerUser !== undefined) coupon.limits.maxUsagePerUser = input.maxUsagePerUser;

  await coupon.save();
  return coupon;
};

export const deleteCoupon = async (id: string): Promise<void> => {
  const coupon = await Coupon.findById(id);
  if (!coupon) throw new AppError('Coupon not found', 404);
  
  if (coupon.limits.usedCount > 0) {
    // Soft delete if already used to maintain usage history
    coupon.isActive = false;
    await coupon.save();
  } else {
    await coupon.deleteOne();
  }
};

export const getCouponUsageHistory = async (
  id: string,
  page = 1,
  limit = 20
): Promise<{ history: ICoupon['usageHistory']; pagination: PaginationResult }> => {
  const coupon = await Coupon.findById(id)
    .select('usageHistory code limits')
    .populate('usageHistory.user', 'name email')
    .populate('usageHistory.order', 'orderCode totalAmount');

  if (!coupon) throw new AppError('Coupon not found', 404);

  const total = coupon.usageHistory.length;
  const totalPages = Math.ceil(total / limit);
  const skip = (page - 1) * limit;
  const history = coupon.usageHistory
    .sort((a, b) => new Date(b.usedAt).getTime() - new Date(a.usedAt).getTime())
    .slice(skip, skip + limit);

  return {
    history,
    pagination: { total, page, limit, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
  };
};