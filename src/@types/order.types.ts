import type { OrderStatus, PaymentMethod } from '../models/order.model.js';

// ─── Query Parameters ─────────────────────────────────────────────────────────

export interface UserOrderQuery {
  page: number;
  limit: number;
  status?: OrderStatus;
}

export interface AdminOrderQuery {
  page: number;
  limit: number;
  status?: OrderStatus;
  userId?: string;
  keyword?: string; // Search by orderCode
  paymentMethod?: PaymentMethod;
  fromDate?: string;
  toDate?: string;
  sort: string;
  order: 'asc' | 'desc';
}

// ─── Place Order Payload ──────────────────────────────────────────────────────

export interface PlaceOrderPayload {
  addressId?: string; // Use a saved address or specify a newAddress
  newAddress?: {
    recipientName: string;
    recipientPhone: string;
    province: string;
    district: string;
    ward: string;
    streetAddress: string;
  };
  paymentMethod: PaymentMethod;
  couponCode?: string;
  note?: string;
}

// ─── Update Status Payload (Admin) ───────────────────────────────────────────

export interface UpdateStatusPayload {
  status: OrderStatus;
  note?: string;
  // Applicable only when transitioning to 'shipped'
  carrier?: string;
  trackingCode?: string;
  estimatedDelivery?: string;
}

// ─── Cancel Payload ───────────────────────────────────────────────────────────

export interface CancelOrderPayload {
  reason: string;
}