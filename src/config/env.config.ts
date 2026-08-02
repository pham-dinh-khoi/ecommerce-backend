import dotenv from 'dotenv';
import type { SignOptions } from 'jsonwebtoken';
import { z } from 'zod';

dotenv.config();

// ─── Environment Schema Validation ──────────────────────────────────────────

const envSchema = z.object({
  // Application Configuration
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(5000),
  CLIENT_URL: z.string().url().default('http://localhost:5000'),

  // Database Configuration
  MONGO_URI: z
    .string()
    .min(1, { message: 'MONGO_URI cannot be left blank!' })
    .regex(/^mongodb(\+srv)?:\/\//, {
      message: 'MONGO_URI must start with "mongodb://" or "mongodb+srv://"',
    }),

  // JWT Configuration
  JWT_SECRET: z
    .string()
    .min(32, { message: 'JWT_SECRET must be at least 32 characters long for security!' }),
  JWT_ACCESS_SECRET: z
    .string()
    .min(30, { message: 'JWT_ACCESS_SECRET must be at least 30 characters long for security!' }),
  JWT_REFRESH_SECRET: z
    .string()
    .min(30, { message: 'JWT_REFRESH_SECRET must be at least 30 characters long for security!' }),
  JWT_ACCESS_EXPIRES: z.custom<NonNullable<SignOptions['expiresIn']>>(
    val => typeof val === 'string' || typeof val === 'number',
    { message: 'JWT_ACCESS_EXPIRES must be a valid time string (e.g., "7d", "2h") or a number.' }
  ),
  JWT_REFRESH_EXPIRES: z.custom<NonNullable<SignOptions['expiresIn']>>(
    val => typeof val === 'string' || typeof val === 'number',
    { message: 'JWT_REFRESH_EXPIRES must be a valid time string (e.g., "7d", "2h") or a number.' }
  ),
  JWT_EXPIRES_IN: z.custom<NonNullable<SignOptions['expiresIn']>>(
    val => typeof val === 'string' || typeof val === 'number',
    { message: 'JWT_EXPIRES_IN must be a valid time string (e.g., "7d", "2h") or a number.' }
  ),

  // Cloudinary Configuration
  CLOUDINARY_CLOUD_NAME: z.string().min(1, { message: 'Cloud Service Name is required' }),
  CLOUDINARY_API_KEY: z.string().min(1, { message: 'Cloud API Key is required' }),
  CLOUDINARY_API_SECRET: z.string().min(1, { message: 'Cloud API Secret is required' }),

  // SMTP Email Configuration
  SMTP_HOST: z.string().min(1, { message: 'SMTP_HOST is required for email services!' }),
  SMTP_PORT: z.coerce.number().default(587), // Automatically coerces string to number, defaults to 587
  SMTP_USER: z.string().min(1, { message: 'SMTP_USER is required!' }),
  SMTP_PASS: z.string().min(1, { message: 'SMTP_PASS is required!' }),
  SMTP_FROM: z.string().min(1, { message: 'SMTP_FROM email address is required!' }),

  // Redis Configuration
  REDIS_URL: z.string().url().optional().default('redis://localhost:6379'),

  // PayPal Payment Configuration
  PAYPAL_CLIENT_ID: z.string().min(1, { message: 'PAYPAL_CLIENT_ID is required' }),
  PAYPAL_CLIENT_SECRET: z.string().min(1, { message: 'PAYPAL_CLIENT_SECRET is required' }),
  PAYPAL_MODE: z.enum(['sandbox', 'live']).default('sandbox'),
  PAYPAL_API_BASE: z.string().url().default('https://api-m.sandbox.paypal.com'),
  PAYPAL_RETURN_URL: z.string().url({ message: 'PAYPAL_RETURN_URL must be a valid URL' }),
  PAYPAL_CANCEL_URL: z.string().url({ message: 'PAYPAL_CANCEL_URL must be a valid URL' }),
  PAYPAL_WEBHOOK_ID: z.string().min(1, { message: 'PAYPAL_WEBHOOK_ID is required' }),
});

// ─── Execution and Validation ────────────────────────────────────────────────

const envParse = envSchema.safeParse(process.env);

if (!envParse.success) {
  console.error('Invalid environment configuration (.env)');
  console.error(JSON.stringify(envParse.error.format(), null, 2));
  process.exit(1);
}

export const env = envParse.data;
