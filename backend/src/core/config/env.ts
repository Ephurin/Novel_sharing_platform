import 'dotenv/config';
import { z } from 'zod';

const booleanStringSchema = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  if (value.toLowerCase() === 'true') {
    return true;
  }

  if (value.toLowerCase() === 'false') {
    return false;
  }

  return value;
}, z.boolean());

const optionalUrlSchema = z.preprocess((value) => {
  if (value === '') {
    return undefined;
  }

  return value;
}, z.string().url().optional());

const optionalStringSchema = z.preprocess((value) => {
  if (value === '') {
    return undefined;
  }

  return value;
}, z.string().optional());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PRIVATE_COMMENTS_ENABLED: booleanStringSchema.default(false),
  MODERATOR_ENABLED: booleanStringSchema.default(true),
  NOVEL_SELECTION_ENABLED: booleanStringSchema.default(true),
  NOVEL_FEATURED_PLACEMENTS_ENABLED: booleanStringSchema.default(true),
  NOVEL_SELECTION_RECONSIDERATION_WRITES_ENABLED: booleanStringSchema.default(true),
  PORT: z.coerce.number().int().positive().default(4000),
  API_PREFIX: z.string().default('/api/v1'),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  DB_CONNECT_ON_START: booleanStringSchema.default(false),
  DATABASE_URL: z.string().min(1),
  MONGODB_URI: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_EXPIRES_SECONDS: z.coerce.number().int().positive().default(3600),
  JWT_REFRESH_EXPIRES_DAYS: z.coerce.number().int().positive().default(7),
  REFRESH_TOKEN_COOKIE_NAME: z.string().default('ephurin_refresh_token'),
  GOOGLE_OAUTH_CLIENT_ID: optionalStringSchema,
  AUTH_TRUSTED_PROXY_HOST: optionalStringSchema,
  SMTP_URL: optionalUrlSchema.refine((value) => !value || /^smtps?:\/\//.test(value), 'Use an SMTP or SMTPS URL'),
  SMTP_HOST: optionalStringSchema,
  SMTP_PORT: z.preprocess((value) => value === '' ? undefined : value, z.coerce.number().int().min(1).max(65535).optional()),
  SMTP_SECURE: z.preprocess((value) => value === '' ? undefined : value, booleanStringSchema.optional()),
  SMTP_USER: optionalStringSchema,
  SMTP_PASS: optionalStringSchema,
  SMTP_FROM: optionalStringSchema,
  AI_LLM_BASE_URL: optionalUrlSchema,
  AI_LLM_API_KEY: optionalStringSchema,
  AI_LLM_MODEL: z.string().default('local-model'),
  AI_LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  AI_LLM_MAX_TOKENS: z.coerce.number().int().positive().default(700),
  AI_LLM_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.7),
  AI_SERVICE_URL: z.string().default('http://localhost:8000'),
  // Incremental chapter analysis waits until the chapter's newest saved revision has been
  // unchanged this long, so one writing session is analysed once instead of on every save.
  ANALYSIS_QUIET_SECONDS: z.coerce.number().int().min(0).default(0),
  PAYMENT_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
  PAYMENT_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  // Coin top-ups go through the internal mock gateway or the VNPay sandbox. Both are demo-only:
  // the SRS scopes payments to an academic demo with no real money.
  PAYMENT_GATEWAY: z.enum(['mock', 'vnpay']).default('mock'),
  VNPAY_TMN_CODE: optionalStringSchema,
  VNPAY_HASH_SECRET: optionalStringSchema,
  VNPAY_PAYMENT_URL: z.string().url().default('https://sandbox.vnpayment.vn/paymentv2/vpcpay.html'),
  // Defaults to `${WEB_ORIGIN}/wallet/vnpay-return` when unset.
  VNPAY_RETURN_URL: optionalUrlSchema,
  VNPAY_SESSION_TTL_MINUTES: z.coerce.number().int().min(5).max(60).default(15),
  GIPHY_API_KEY: optionalStringSchema,
  GIPHY_PUBLIC_API_KEY: optionalStringSchema,
  PLATFORM_SERVICE_TOKEN: optionalStringSchema
}).superRefine((value, context) => {
  if (value.PAYMENT_GATEWAY !== 'vnpay') return;
  for (const key of ['VNPAY_TMN_CODE', 'VNPAY_HASH_SECRET'] as const) {
    if (!value[key]) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: `${key} is required when PAYMENT_GATEWAY=vnpay` });
    }
  }
});

export const env = envSchema.parse(process.env);
