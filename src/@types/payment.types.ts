// ─── Payment Provider Enum ────────────────────────────────────────────────────

export type PaymentProvider = 'paypal' | 'cod';

// ─── Payment URL Generation Result (VNPay, MoMo) ─────────────────────────────

export interface PaymentUrlResult {
  paymentUrl: string; // URL to redirect the user to the payment gateway
  orderId: string;
  amount: number;
}

// ─── PaymentIntent Generation Result (Stripe) ────────────────────────────────

export interface StripePaymentIntentResult {
  clientSecret: string; // Returned to the client to confirm payment
  paymentIntentId: string;
  orderId: string;
  amount: number;
}

// ─── Verification Result after Webhook / IPN ─────────────────────────────────

export interface PaymentVerifyResult {
  isValid: boolean;
  isPaid: boolean;
  orderId: string;
  amount: number;
  transactionId: string | undefined;
  rawData?: Record<string, string>;
  failureReason?: string;
}

// ─── Refund Result ────────────────────────────────────────────────────────────

export interface RefundResult {
  success: boolean;
  refundId?: string;
  amount: number;
  message: string;
}

// ─── Environment Configurations — Loaded from .env ───────────────────────────

export interface VNPayConfig {
  tmnCode: string;
  hashSecret: string;
  url: string; // e.g., https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
  returnUrl: string; // e.g., https://yourapi.com/api/payments/vnpay/return
  ipnUrl: string; // e.g., https://yourapi.com/api/payments/vnpay/ipn
}

export interface StripeConfig {
  secretKey: string;
  webhookSecret: string;
  currency: string; // e.g., 'vnd' or 'usd'
}

export interface MoMoConfig {
  partnerCode: string;
  accessKey: string;
  secretKey: string;
  endpoint: string; // e.g., https://test-payment.momo.vn/v2/gateway/api/create
  redirectUrl: string;
  ipnUrl: string;
}

export interface PayPalConfig {
  clientId: string;
  clientSecret: string;
  apiBase: string;
  returnUrl: string;
  cancelUrl: string;
}
