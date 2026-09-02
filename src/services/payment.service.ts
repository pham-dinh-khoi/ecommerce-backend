import { Order } from '../models/order.model.js';
import { AppError } from '../utils/AppError.js';
import type {
  PaymentProvider,
  PaymentUrlResult,
  StripePaymentIntentResult,
  RefundResult,
} from '../@types/payment.types.js';
import * as paypalService from './paypal.service.js';
import { sendPaymentConfirmEmail } from './email.service.js';

// ==========================================
// PAYMENT INITIATION
// ==========================================

/**
 * Initiates the payment process by generating a payment URL or Intent
 * depending on the chosen provider.
 *
 * @param {string} orderId - The target order's ID.
 * @param {PaymentProvider} provider - The payment gateway (e.g., 'vnpay', 'stripe').
 * @param {string} clientIp - The client's IP address (often required by VNPay).
 * @param {string} [customerEmail] - Optional email for providers like Stripe.
 * @returns {Promise<PaymentUrlResult | StripePaymentIntentResult>}
 */
export const initiatePayment = async (
  orderId: string,
  provider: PaymentProvider,
  _clientIp: string,
  _customerEmail?: string
): Promise<PaymentUrlResult | StripePaymentIntentResult> => {
  const order = await Order.findById(orderId);
  if (!order) throw new AppError('Order not found', 404);

  if (order.payment.status === 'paid') {
    throw new AppError('This order has already been paid', 400);
  }
  if (order.status === 'cancelled') {
    throw new AppError('This order has been cancelled', 400);
  }

  const orderInfo = `Payment for order ${order.orderCode}`;

  switch (provider) {
    case 'paypal':
      return paypalService.createPaymentUrl(order._id.toString(), order.totalAmount, orderInfo);

    case 'cod':
      // Cash on Delivery requires no external redirect
      return { paymentUrl: '', orderId: order._id.toString(), amount: order.totalAmount };

    default:
      throw new AppError(`Payment provider "${provider}" is not supported`, 400);
  }
};

// ==========================================
// PAYMENT STATUS MANAGEMENT (WEBHOOKS)
// ==========================================

/**
 * Updates the order payment status. This function is designed to be
 * **idempotent**, making it safe for handling multiple webhook calls for
 * the same transaction.
 *
 * @param {string} orderId - The order ID to update.
 * @param {boolean} isPaid - Whether the transaction was successful.
 * @param {string} transactionId - The ID provided by the payment gateway.
 * @param {number} [amount] - The amount actually received (used to validate against order total).
 * @param {string} [failureReason] - Reason for failure, if any.
 */
export const updatePaymentStatus = async (
  orderId: string,
  isPaid: boolean,
  transactionId: string,
  amount?: number,
  failureReason?: string
): Promise<void> => {
  const order = await Order.findById(orderId);
  if (!order) {
    console.error(`updatePaymentStatus: Order ${orderId} not found`);
    return;
  }

  // Idempotency check: ignore if already marked as paid
  if (order.payment.status === 'paid' && isPaid) {
    console.log(`Order ${orderId} is already marked as paid — skipping`);
    return;
  }

  if (isPaid) {
    order.payment.status = 'paid';
    order.payment.paidAt = new Date();
    order.payment.transactionId = transactionId;

    // Fraud/Logic check: verify received amount against expected amount (tolerance: 1000)
    if (amount && Math.abs(amount - order.totalAmount) > 1000) {
      console.error(
        `Amount mismatch: expected ${order.totalAmount}, got ${amount} for order ${orderId}`
      );
      order.payment.status = 'failed';
      await order.save();
      return;
    }

    // Auto-confirm order if currently pending
    if (['pending'].includes(order.status)) {
      order.status = 'confirmed';
      order.timeline.push({
        status: 'confirmed',
        timestamp: new Date(),
        note: `Payment successful via ${order.payment.method} — txn: ${transactionId}`,
      });
    }

    await order.save();

    // Trigger notification email (non-blocking)
    sendPaymentConfirmEmail(order).catch(e =>
      console.error('Failed to send payment confirmation email:', e)
    );
  } else {
    order.payment.status = 'failed';
    await order.save();
    console.log(`Payment failed for order ${orderId}: ${failureReason}`);
  }
};

// ==========================================
// REFUND OPERATIONS
// ==========================================

/**
 * Processes a refund for a paid order.
 * Delegates to the specific provider service and updates the local order record.
 *
 * @param {string} orderId - The ID of the order to be refunded.
 * @returns {Promise<RefundResult>} The outcome of the refund operation.
 */
export const processRefund = async (orderId: string): Promise<RefundResult> => {
  const order = await Order.findById(orderId);
  if (!order) throw new AppError('Order not found', 404);

  if (order.payment.status !== 'paid') {
    return { success: true, amount: 0, message: 'Refund not required (order not paid)' };
  }

  const transactionId = order.payment.transactionId || '';
  const amount = order.payment.amount;

  let result: RefundResult;

  switch (order.payment.method) {
    case 'paypal': {
      result = await paypalService.refund(transactionId, amount);
      break;
    }

    case 'cod': {
      result = {
        success: true,
        amount,
        message: 'Manual refund required — please process outside the system',
      };
      break;
    }

    default:
      throw new AppError('Refund not supported for this payment method', 400);
  }

  if (result.success) {
    order.payment.status = 'refunded';
    order.payment.refundedAt = new Date();
    order.payment.refundAmount = amount;
    await order.save();
  }

  return result;
};

// Xóa hẳn hàm formatVNPayDate ở cuối file — không còn dùng
