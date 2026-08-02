import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'ID không hợp lệ');

export const initiatePaymentSchema = z.object({
  orderId: objectId,
  provider: z.enum(['cod', 'paypal'], {
    message: 'Phương thức thanh toán không hợp lệ',
  }),
});

export type InitiatePaymentInput = z.infer<typeof initiatePaymentSchema>;