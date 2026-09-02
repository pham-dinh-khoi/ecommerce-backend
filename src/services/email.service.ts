import nodemailer from 'nodemailer';
import { env } from '../config/env.config.js';

// ==========================================
// CONFIGURATION
// ==========================================

/**
 * SMTP Transporter configuration for sending emails.
 * Uses environment variables for security credentials.
 */
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  family: 4,
} as nodemailer.TransportOptions);

// ==========================================
// INTERFACES
// ==========================================

/**
 * Structure for email payloads.
 */
interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

// ==========================================
// CORE EMAIL SERVICE
// ==========================================

/**
 * Generic function to dispatch emails via the configured transporter.
 *
 * @param {SendEmailOptions} options - The email details (recipient, subject, body).
 */
export const sendEmail = async ({ to, subject, html }: SendEmailOptions): Promise<void> => {
  await transporter.sendMail({
    from: `"E-commerce Shop" <${env.SMTP_FROM}>`,
    to,
    subject,
    html,
  });
};

// ==========================================
// BUSINESS SPECIFIC EMAILS
// ==========================================

/**
 * Sends a verification link to a newly registered user.
 *
 * @param {string} email - The recipient email address.
 * @param {string} name - The user's name for personalization.
 * @param {string} token - The secure verification token.
 */
export const sendVerificationEmail = async (email: string, name: string, token: string) => {
  const url = `${env.CLIENT_URL}/verify-email?token=${token}`;

  await sendEmail({
    to: email,
    subject: 'Confirm your email address',
    html: `
      <p>Hello ${name},</p>
      <p>Please click the link below to confirm your email (expires in 24 hours):</p>
      <a href="${url}">${url}</a>
    `,
  });
};

/**
 * Sends a password reset instruction email.
 *
 * @param {string} email - The user's registered email.
 * @param {string} name - The user's name.
 * @param {string} token - The reset token (valid for 10 minutes).
 */
export const sendPasswordResetEmail = async (email: string, name: string, token: string) => {
  const url = `${env.CLIENT_URL}/reset-password?token=${token}`;

  await sendEmail({
    to: email,
    subject: 'Reset password',
    html: `
      <p>Hello ${name},</p>
      <p>You have just requested a password reset. The link expires in 10 minutes:</p>
      <a href="${url}">${url}</a>
      <p>If this is not you, please disregard this email.</p>
    `,
  });
};

/**
 * Sends an invoice/payment confirmation email upon successful order completion.
 * Fetches user details dynamically to ensure the latest data is used.
 *
 * @param {any} order - The order object containing payment and user details.
 */
export const sendPaymentConfirmEmail = async (order: any) => {
  // Fetch user data via dynamic import to avoid circular dependency issues
  const user = await import('../models/user.model.js').then(m =>
    m.User.findById(order.user).select('name email')
  );

  if (!user?.email) return;

  // Map internal payment method codes to display-friendly labels
  const methodLabel: Record<string, string> = {
    paypal: 'paypal',
    vnpay: 'VNPay',
    stripe: 'Stripe',
    momo: 'MoMo',
    cod: 'COD',
    bank_transfer: 'Chuyển khoản',
  };

  await sendEmail({
    to: user.email,
    subject: `Thanh toán thành công - ${order.orderCode}`,
    html: `
      <p>Chào ${user.name},</p>
      <p>Đơn hàng <strong>${order.orderCode}</strong> đã được thanh toán thành công.</p>
      <table border="1" cellpadding="8" style="border-collapse:collapse">
        <tr><td>Phương thức</td><td>${methodLabel[order.payment.method] || order.payment.method}</td></tr>
        <tr><td>Số tiền</td><td>${order.totalAmount.toLocaleString('vi-VN')}đ</td></tr>
        <tr><td>Mã giao dịch</td><td>${order.payment.transactionId || 'N/A'}</td></tr>
        <tr><td>Thời gian</td><td>${new Date(order.payment.paidAt).toLocaleString('vi-VN')}</td></tr>
      </table>
      <p>Chúng tôi sẽ xử lý và giao hàng sớm nhất có thể.</p>
    `,
  });
};
