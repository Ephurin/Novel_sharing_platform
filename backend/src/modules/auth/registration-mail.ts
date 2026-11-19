import nodemailer from 'nodemailer';
import { env } from '../../core/config/env.js';
import { AppError } from '../../core/errors/app-error.js';
import { logger } from '../../core/logger/logger.js';
import { createRegistrationEmail } from './registration-email-template.js';

let transporter: ReturnType<typeof nodemailer.createTransport> | undefined;
const timeouts = { connectionTimeout: 6000, greetingTimeout: 6000, socketTimeout: 10000 };

// Each admitted send can hold a transaction open. Leave the rest of the shared pool available.
const maxConcurrentRegistrationDeliveries = 2;
let activeRegistrationDeliveries = 0;

export async function withRegistrationDeliverySlot<T>(deliver: () => Promise<T>): Promise<T> {
  if (activeRegistrationDeliveries >= maxConcurrentRegistrationDeliveries) {
    throw new AppError(503, 'AUTH_EMAIL_BUSY', 'Hệ thống đang gửi nhiều email xác nhận. Hãy thử lại sau ít giây.');
  }
  activeRegistrationDeliveries++;
  try {
    return await deliver();
  } finally {
    activeRegistrationDeliveries--;
  }
}

function getRegistrationTransport() {
  if (transporter) return transporter;
  if (env.SMTP_URL) {
    const url = new URL(env.SMTP_URL);
    if (url.protocol === 'smtp:' && url.username) url.searchParams.set('requireTLS', 'true');
    for (const [key, value] of Object.entries(timeouts)) url.searchParams.set(key, String(value));
    transporter = nodemailer.createTransport(url.toString());
  } else if (env.SMTP_HOST && Boolean(env.SMTP_USER) === Boolean(env.SMTP_PASS)) {
    const secure = env.SMTP_SECURE ?? env.SMTP_PORT === 465;
    const auth = env.SMTP_USER && env.SMTP_PASS ? {
      user: env.SMTP_USER.trim(),
      pass: env.SMTP_HOST.toLowerCase() === 'smtp.gmail.com' ? env.SMTP_PASS.replace(/\s+/g, '') : env.SMTP_PASS
    } : undefined;
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure,
      requireTLS: Boolean(auth) && !secure,
      auth,
      ...timeouts
    });
  }
  return transporter;
}

export async function sendRegistrationEmail(email: string, code: string, confirmationUrl: string | null, expiresInMinutes: number, recoveryUrl: string) {
  const mail = getRegistrationTransport();
  if (!mail || !env.SMTP_FROM) {
    throw new AppError(503, 'AUTH_EMAIL_UNAVAILABLE', 'StoryCraft chưa thể gửi email xác nhận. Vui lòng thử lại sau.');
  }

  try {
    const receipt = await mail.sendMail({
      from: env.SMTP_FROM,
      to: email,
      ...createRegistrationEmail(code, confirmationUrl, expiresInMinutes, recoveryUrl)
    });
    if (!receipt.accepted.length) throw new Error('SMTP recipient not accepted');
  } catch (error) {
    const smtpError = error as { code?: string; responseCode?: number } | undefined;
    logger.warn({ smtpErrorCode: smtpError?.code, smtpResponseCode: smtpError?.responseCode }, 'Registration email delivery failed');
    throw new AppError(503, 'AUTH_EMAIL_UNAVAILABLE', 'Chưa gửi được email xác nhận. Vui lòng thử lại sau.');
  }
}
