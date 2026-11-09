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
  AI_LLM_BASE_URL: optionalUrlSchema,
  AI_LLM_API_KEY: optionalStringSchema,
  AI_LLM_MODEL: z.string().default('local-model'),
  AI_LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  AI_LLM_MAX_TOKENS: z.coerce.number().int().positive().default(700),
  AI_LLM_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.7),
  AI_SERVICE_URL: z.string().default('http://localhost:8000'),
  PAYMENT_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
  PAYMENT_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  GIPHY_API_KEY: optionalStringSchema,
  PLATFORM_SERVICE_TOKEN: optionalStringSchema
});

export const env = envSchema.parse(process.env);
