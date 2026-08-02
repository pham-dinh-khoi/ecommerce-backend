import type { Request, Response } from 'express';
import { catchAsync, AppError } from '../utils/AppError.js';
import type { AuthRequest } from '../@types/auth.types.js';
import * as paymentService from '../services/payment.service.js';
import * as paypalService from '../services/paypal.service.js';
import { Order } from '../models/order.model.js';
import * as orderService from '../services/order.service.js';
import { initiatePaymentSchema } from '../validations/payment.validation.js';

// ─── Initiate Payment ─────────────────────────────────────────────────────────

export const initiatePayment = catchAsync(async (req: AuthRequest, res: Response) => {
  const { orderId, provider } = initiatePaymentSchema.parse(req.body);

  const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '';
  const result = await paymentService.initiatePayment(
    orderId,
    provider,
    clientIp,
    req.user?.userId
  );

  res.json({ success: true, message: 'Payment initiated successfully', data: result });
});

// ─── PayPal: Return URL (User returns after approving payment) ───────────────
// Unlike VNPay/MoMo, PayPal requires an additional "Capture" step here to actually settle funds
// (VNPay/MoMo holds funds immediately upon user confirmation, whereas PayPal does not)

export const paypalReturn = catchAsync(async (req: Request, res: Response) => {
  const { token, orderId } = req.query as Record<string, string>;
  const clientUrl = process.env.CLIENT_URL!;

  if (!token || !orderId) {
    return res.redirect(`${clientUrl}/payment/result?status=invalid`);
  }

  try {
    const result = await paypalService.captureOrder(token);
    const finalOrderId = result.orderId || orderId; // Ensure a guaranteed string value

    if (result.isPaid) {
      await paymentService.updatePaymentStatus(
        finalOrderId,
        true,
        result.transactionId ?? '',
        result.amount
      );
    } else {
      await paymentService.updatePaymentStatus(finalOrderId, false, '', 0, result.failureReason);
    }

    const status = result.isPaid ? 'success' : 'failed';
    res.redirect(`${clientUrl}/payment/result?status=${status}&orderId=${finalOrderId}`);
  } catch (err) {
    console.error('PayPal capture error:', err);
    res.redirect(`${clientUrl}/payment/result?status=failed&orderId=${orderId}`);
  }
});

// ─── PayPal: Cancel URL (User clicks Cancel on the PayPal page) ──────────────

export const paypalCancel = catchAsync(async (req: Request, res: Response) => {
  const { orderId } = req.query as Record<string, string>;
  const clientUrl = process.env.CLIENT_URL!;

  if (orderId) {
    try {
      await orderService.cancelOrderBySystem(orderId, 'Người dùng hủy thanh toán tại PayPal');
    } catch (err) {
      console.error('Lỗi khi tự động hủy đơn sau khi Cancel PayPal:', err);
    }
  }

  res.redirect(`${clientUrl}/payment/result?status=cancelled&orderId=${orderId}`);
});

// ─── PayPal: Webhook (Server-to-Server, independent confirmation) ─────────────
// IMPORTANT: Requires WEBHOOK_ID obtained from the PayPal Dashboard after registering the Webhook URL

export const paypalWebhook = catchAsync(async (req: Request, res: Response) => {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID!;
  const isValid = await paypalService.verifyWebhookSignature(
    req.headers as Record<string, string>,
    req.body,
    webhookId
  );

  if (!isValid) {
    console.error('Invalid PayPal webhook signature');
    res.status(400).json({ error: 'Invalid signature' });
    return;
  }

  const event = req.body as {
    event_type: string;
    resource: {
      supplementary_data?: { related_ids?: { order_id?: string } };
      id: string;
      amount?: { value: string };
    };
  };

  // Only handle completed capture confirmation events — ignore others (CREATED, PENDING, etc.)
  if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
    const paypalOrderId = event.resource.supplementary_data?.related_ids?.order_id;
    if (paypalOrderId) {
      // Look up the actual order via paypalOrderId stored temporarily in payment.transactionId
      const order = await Order.findOne({ 'payment.transactionId': paypalOrderId });
      if (order) {
        await paymentService.updatePaymentStatus(
          order._id.toString(),
          true,
          event.resource.id,
          event.resource.amount ? Number(event.resource.amount.value) * 25000 : undefined
        );
      }
    }
  }

  res.status(200).json({ received: true });
});

// ─── Manual Payment Status Check (User polling when webhooks are unavailable) ─

export const checkPaymentStatus = catchAsync(async (req: AuthRequest, res: Response) => {
  const orderId = req.params.orderId as string;

  const order = await Order.findOne({
    _id: orderId,
    user: req.user!.userId,
  }).select('payment status orderCode');

  if (!order) throw new AppError('Order not found', 404);

  res.json({
    success: true,
    message: 'OK',
    data: {
      orderId: order._id,
      orderCode: order.orderCode,
      paymentStatus: order.payment.status,
      orderStatus: order.status,
      paidAt: order.payment.paidAt,
    },
  });
});
