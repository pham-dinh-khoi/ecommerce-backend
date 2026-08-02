import mongoose, { Document, Schema } from 'mongoose';
// ==========================================
// ENUMS & STATE MANAGEMENT
// ==========================================

export type OrderStatus =
  | 'pending' // Newly created, awaiting confirmation
  | 'confirmed' // Admin confirmed, preparing stock
  | 'processing' // Currently being packed
  | 'shipped' // Handed over to logistics carrier
  | 'delivered' // Received by customer
  | 'cancelled'; // Order cancelled

export type PaymentMethod = 'cod' | 'paypal';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';
export type CancelActor = 'user' | 'admin' | 'system';

/**
 * State Machine Transition Rules:
 * Defines allowed next-states based on the current order status.
 */
export const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered'], // Locked state: no cancellation after shipment
  delivered: [],
  cancelled: [],
};

// ==========================================
// SUB-INTERFACES
// ==========================================

export interface IOrderItem {
  product: mongoose.Types.ObjectId;
  variant: mongoose.Types.ObjectId;
  sku: string;
  name: string;
  image?: string;
  price: number; // Price snapshot at time of purchase (immutable)
  quantity: number;
  subtotal: number; // Price × Quantity
}

export interface IShippingInfo {
  recipientName: string;
  recipientPhone: string;
  province: string;
  district: string;
  ward: string;
  streetAddress: string;
  carrier?: string; // e.g., GHN, GHTK, ViettelPost
  trackingCode?: string;
  estimatedDelivery?: Date;
  shippedAt?: Date;
  deliveredAt?: Date;
}

export interface IPaymentInfo {
  method: PaymentMethod;
  status: PaymentStatus;
  amount: number;
  paidAt?: Date;
  transactionId?: string; // Payment gateway ID
  refundedAt?: Date;
  refundAmount?: number;
}

export interface ICancellationInfo {
  reason: string;
  cancelledBy: CancelActor;
  cancelledAt: Date;
  userId?: mongoose.Types.ObjectId; // ID of the admin who cancelled, if applicable
}

/**
 * Timeline Audit Log:
 * Every status change is recorded here for auditability and history.
 */
export interface IOrderTimeline {
  status: OrderStatus;
  timestamp: Date;
  note?: string;
  updatedBy?: mongoose.Types.ObjectId;
}

export interface IOrder extends Document {
  orderCode: string; // Format: ORD-YYYYMMDD-XXXX
  user: mongoose.Types.ObjectId;
  items: IOrderItem[];
  shipping: IShippingInfo;
  payment: IPaymentInfo;
  cancellation?: ICancellationInfo;
  timeline: IOrderTimeline[];
  status: OrderStatus;
  subtotal: number; // Total price of items
  shippingFee: number;
  discountAmount: number; // Coupon discount
  totalAmount: number; // Final amount paid
  couponCode?: string;
  note?: string; // Customer order note
  createdAt: Date;
  updatedAt: Date;
}

// ==========================================
// SUB-SCHEMAS (Embedded Documents)
// ==========================================

const OrderItemSchema = new Schema<IOrderItem>(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    variant: { type: Schema.Types.ObjectId, required: true },
    sku: { type: String, required: true },
    name: { type: String, required: true },
    image: String,
    price: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    subtotal: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const ShippingInfoSchema = new Schema<IShippingInfo>(
  {
    recipientName: { type: String, required: true },
    recipientPhone: { type: String, required: true },
    province: { type: String, required: true },
    district: { type: String, required: true },
    ward: { type: String, required: true },
    streetAddress: { type: String, required: true },
    carrier: String,
    trackingCode: String,
    estimatedDelivery: Date,
    shippedAt: Date,
    deliveredAt: Date,
  },
  { _id: false }
);

const PaymentInfoSchema = new Schema<IPaymentInfo>(
  {
    method: {
      type: String,
      enum: ['cod', 'bank_transfer', 'paypal', 'vnpay', 'momo', 'stripe'],
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending',
    },
    amount: { type: Number, required: true, min: 0 },
    paidAt: Date,
    transactionId: String,
    refundedAt: Date,
    refundAmount: Number,
  },
  { _id: false }
);

const TimelineSchema = new Schema<IOrderTimeline>(
  {
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'],
      required: true,
    },
    timestamp: { type: Date, default: Date.now },
    note: String,
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false }
);

// ==========================================
// MAIN SCHEMA
// ==========================================

const OrderSchema = new Schema<IOrder>(
  {
    orderCode: {
      type: String,
      unique: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    items: {
      type: [OrderItemSchema],
      validate: {
        validator: (items: IOrderItem[]) => items.length > 0,
        message: 'Đơn hàng phải có ít nhất 1 sản phẩm',
      },
    },
    shipping: { type: ShippingInfoSchema, required: true },
    payment: { type: PaymentInfoSchema, required: true },
    cancellation: {
      reason: String,
      cancelledBy: { type: String, enum: ['user', 'admin', 'system'] },
      cancelledAt: Date,
      userId: { type: Schema.Types.ObjectId, ref: 'User' },
    },
    timeline: [TimelineSchema],
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'],
      default: 'pending',
    },
    subtotal: { type: Number, required: true, min: 0 },
    shippingFee: { type: Number, default: 0, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    couponCode: { type: String, uppercase: true },
    note: { type: String, maxlength: 500 },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

// ==========================================
// MIDDLEWARE: Auto-generate unique order code
// ==========================================

OrderSchema.pre('save', function () {
  if (this.isNew && !this.orderCode) {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.floor(Math.random() * 0xffff)
      .toString(16)
      .toUpperCase()
      .padStart(4, '0');
    this.orderCode = `ORD-${dateStr}-${rand}`;

    // Initialize the timeline with the "pending" state
    this.timeline = [{ status: 'pending', timestamp: new Date() }];
  }
});

// ==========================================
// INDEXES: Optimize read queries
// ==========================================

OrderSchema.index({ user: 1, createdAt: -1 }); // For User Order History
OrderSchema.index({ status: 1, createdAt: -1 }); // For Admin Dashboard Filtering
OrderSchema.index({ 'payment.status': 1 }); // For Financial Reconciliation

export const Order = mongoose.model<IOrder>('Order', OrderSchema);
