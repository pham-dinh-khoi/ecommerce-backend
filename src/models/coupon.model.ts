import mongoose, { Document, Schema } from 'mongoose';

// ==========================================
// ENUMS
// ==========================================

export type DiscountType = 'percentage' | 'fixed' | 'free_shipping' | 'buy_x_get_y';

// ==========================================
// SUB-INTERFACES
// ==========================================

export interface IDiscountValue {
  type: DiscountType;
  amount: number; // % for percentage, amount for fixed, 0 for free_shipping
  maxDiscount?: number; // Cap for percentage discounts (e.g., 50% off but max 200k)
  // Fields for buy_x_get_y
  buyQuantity?: number; // Quantity to buy
  getQuantity?: number; // Quantity to get for free
  getProductId?: mongoose.Types.ObjectId; // Product to be gifted (null = gift the same product)
}

export interface IUsageConditions {
  minOrderAmount?: number; // Minimum order value required
  maxOrderAmount?: number; // Maximum order value allowed
  allowedProducts?: mongoose.Types.ObjectId[]; // Apply only to these products
  excludedProducts?: mongoose.Types.ObjectId[]; // Exclude these products
  allowedCategories?: mongoose.Types.ObjectId[]; // Apply only to these categories
  allowedUserRoles?: string[]; // Define target user groups (e.g., 'user', 'seller')
  firstOrderOnly?: boolean; // Restrict to user's first order
  allowedPaymentMethods?: string[]; // Apply only to specific payment methods
}

export interface IUsageLimits {
  maxUsageTotal?: number; // Total global usage limit (undefined = unlimited)
  maxUsagePerUser?: number; // Usage limit per user (undefined = unlimited)
  usedCount: number; // Current total usage count — updated atomically via $inc
}

// Log coupon usage for each user — used for auditing and enforcing per-user limits
export interface IUsageRecord {
  user: mongoose.Types.ObjectId;
  order: mongoose.Types.ObjectId;
  usedAt: Date;
  discountAmount: number;
}

export interface ICoupon extends Document {
  code: string; // Coupon code — UPPERCASE, unique
  description: string; // Description displayed to the user
  discount: IDiscountValue;
  conditions: IUsageConditions;
  limits: IUsageLimits;
  usageHistory: IUsageRecord[];
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// ==========================================
// SUB-SCHEMAS
// ==========================================

const DiscountValueSchema = new Schema<IDiscountValue>(
  {
    type: {
      type: String,
      enum: ['percentage', 'fixed', 'free_shipping', 'buy_x_get_y'],
      required: true,
    },
    amount: { type: Number, required: true, min: 0 },
    maxDiscount: { type: Number, min: 0 },
    buyQuantity: { type: Number, min: 1 },
    getQuantity: { type: Number, min: 1 },
    getProductId: { type: Schema.Types.ObjectId, ref: 'Product' },
  },
  { _id: false }
);

const UsageConditionsSchema = new Schema<IUsageConditions>(
  {
    minOrderAmount: { type: Number, min: 0 },
    maxOrderAmount: { type: Number, min: 0 },
    allowedProducts: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
    excludedProducts: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
    allowedCategories: [{ type: Schema.Types.ObjectId, ref: 'Category' }],
    allowedUserRoles: [String],
    firstOrderOnly: { type: Boolean, default: false },
    allowedPaymentMethods: [String],
  },
  { _id: false }
);

const UsageLimitsSchema = new Schema<IUsageLimits>(
  {
    maxUsageTotal: { type: Number, min: 1 },
    maxUsagePerUser: { type: Number, min: 1, default: 1 },
    usedCount: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const UsageRecordSchema = new Schema<IUsageRecord>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    order: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    usedAt: { type: Date, default: Date.now },
    discountAmount: { type: Number, required: true },
  },
  { _id: false }
);

// ==========================================
// MAIN SCHEMA
// ==========================================

const CouponSchema = new Schema<ICoupon>(
  {
    code: {
      type: String,
      required: [true, 'Coupon code is required'],
      unique: true,
      uppercase: true,
      trim: true,
      match: [/^[A-Z0-9_-]{3,20}$/, 'Code must contain uppercase letters, numbers, -, _, and be 3-20 chars long'],
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      maxlength: 200,
    },
    discount: { type: DiscountValueSchema, required: true },
    conditions: { type: UsageConditionsSchema, default: () => ({}) },
    limits: { type: UsageLimitsSchema, default: () => ({ usedCount: 0 }) },
    usageHistory: {
      type: [UsageRecordSchema],
      // No max length validation here — enforced by maxUsageTotal logic
    },
    startDate: { type: Date, required: true },
    endDate: {
      type: Date,
      required: true,
    },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

// ==========================================
// VIRTUALS
// ==========================================

// Returns true if the coupon has expired or has not yet started
CouponSchema.virtual('isExpired').get(function (this: ICoupon) {
  const now = new Date();
  return now < this.startDate || now > this.endDate;
});

// Returns true if the usage limit has been exhausted
CouponSchema.virtual('isExhausted').get(function (this: ICoupon) {
  if (!this.limits.maxUsageTotal) return false;
  return this.limits.usedCount >= this.limits.maxUsageTotal;
});

// ==========================================
// INDEXES
// ==========================================

// CouponSchema.index({ code: 1 }); // Lookup by code
CouponSchema.index({ isActive: 1, endDate: 1 }); // Index for listing active coupons for Admin
CouponSchema.index({ 'usageHistory.user': 1 }); // Index for checking per-user usage

export const Coupon = mongoose.model<ICoupon>('Coupon', CouponSchema);