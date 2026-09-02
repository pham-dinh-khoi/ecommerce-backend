import { env } from '../config/env.config.js';
import { Order } from '../models/order.model.js';
import type {
  PayPalConfig,
  PaymentVerifyResult,
  PaymentUrlResult,
  RefundResult,
} from '../@types/payment.types.js';

// ==========================================
// CONFIGURATION & CONSTANTS
// ==========================================

const EXCHANGE_RATE = 25_000;

const getConfig = (): PayPalConfig => ({
  clientId: env.PAYPAL_CLIENT_ID,
  clientSecret: env.PAYPAL_CLIENT_SECRET,
  apiBase: env.PAYPAL_API_BASE,
  returnUrl: env.PAYPAL_RETURN_URL,
  cancelUrl: env.PAYPAL_CANCEL_URL,
});

// ==========================================
// AUTHENTICATION
// ==========================================

/**
 * Retrieves an OAuth 2.0 Access Token from PayPal.
 * Tokens typically last ~9 hours.
 */
const getAccessToken = async (): Promise<string> => {
  const config = getConfig();
  const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');

  const response = await fetch(`${config.apiBase}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  const data = (await response.json()) as { access_token?: string; error?: string };

  if (!data.access_token) {
    throw new Error(`PayPal access token request failed: ${data.error ?? 'Unknown error'}`);
  }

  return data.access_token;
};

// ==========================================
// PAYMENT OPERATIONS
// ==========================================

/**
 * Creates a PayPal order (checkout session) and returns the approval URL.
 */
export const createPaymentUrl = async (
  orderId: string,
  amount: number,
  orderInfo: string
): Promise<PaymentUrlResult> => {
  const config = getConfig();
  const accessToken = await getAccessToken();

  // Convert VNĐ to USD
  const amountUSD = (amount / EXCHANGE_RATE).toFixed(2);

  const response = await fetch(`${config.apiBase}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: orderId,
          description: orderInfo,
          amount: {
            currency_code: 'USD',
            value: amountUSD,
          },
        },
      ],
      application_context: {
        return_url: `${config.returnUrl}?orderId=${orderId}`,
        cancel_url: `${config.cancelUrl}?orderId=${orderId}&status=cancelled`,
        brand_name: 'Ecommerce Store',
        user_action: 'PAY_NOW',
      },
    }),
  });

  const result = (await response.json()) as {
    id: string;
    status: string;
    links: Array<{ rel: string; href: string }>;
  };

  if (result.status !== 'CREATED') {
    throw new Error('Failed to create PayPal Order');
  }

  const approvalLink = result.links.find(l => l.rel === 'approve');
  if (!approvalLink) {
    throw new Error('PayPal did not return an approval URL');
  }

  // Update order with PayPal Order ID for tracking
  await Order.findByIdAndUpdate(orderId, {
    'payment.transactionId': result.id,
  });

  return { paymentUrl: approvalLink.href, orderId, amount };
};

/**
 * Captures funds for an authorized PayPal order.
 */
export const captureOrder = async (paypalOrderId: string): Promise<PaymentVerifyResult> => {
  const config = getConfig();
  const accessToken = await getAccessToken();

  const response = await fetch(`${config.apiBase}/v2/checkout/orders/${paypalOrderId}/capture`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  // Type definition for internal response handling
  const result = (await response.json()) as {
    status: string;
    purchase_units: Array<{
      reference_id: string;
      payments: { captures: Array<{ id: string; status: string; amount: { value: string } }> };
    }>;
  };

  const isPaid = result.status === 'COMPLETED';
  const unit = result.purchase_units[0];
  const capture = unit?.payments?.captures?.[0];

  return {
    isValid: true,
    isPaid,
    orderId: unit?.reference_id ?? '',
    amount: capture ? Number(capture.amount.value) * EXCHANGE_RATE : 0,
    transactionId: capture?.id ?? '',
    ...(!isPaid && { failureReason: `PayPal status: ${result.status}` }),
  };
};

/**
 * Verifies the signature of a webhook event sent by PayPal.
 */
export const verifyWebhookSignature = async (
  headers: Record<string, string>,
  body: unknown,
  webhookId: string
): Promise<boolean> => {
  const config = getConfig();
  const accessToken = await getAccessToken();

  const response = await fetch(`${config.apiBase}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      auth_algo: headers['paypal-auth-algo'],
      cert_url: headers['paypal-cert-url'],
      transmission_id: headers['paypal-transmission-id'],
      transmission_sig: headers['paypal-transmission-sig'],
      transmission_time: headers['paypal-transmission-time'],
      webhook_id: webhookId,
      webhook_event: body,
    }),
  });

  const result = (await response.json()) as { verification_status: string };
  return result.verification_status === 'SUCCESS';
};

/**
 * Refunds a captured PayPal payment.
 */
export const refund = async (transactionId: string, amount: number): Promise<RefundResult> => {
  const config = getConfig();
  const accessToken = await getAccessToken();

  const amountUSD = (amount / EXCHANGE_RATE).toFixed(2);

  const response = await fetch(`${config.apiBase}/v2/payments/captures/${transactionId}/refund`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: { value: amountUSD, currency_code: 'USD' },
    }),
  });

  const result = (await response.json()) as { id: string; status: string; message?: string };

  return {
    success: result.status === 'COMPLETED',
    refundId: result.id ?? '',
    amount,
    message:
      result.status === 'COMPLETED' ? 'Refund successful' : (result.message ?? 'Refund failed'),
  };
};
