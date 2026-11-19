import nodemailer from 'nodemailer';
import { env } from '../../core/config/env.js';
import { AppError } from '../../core/errors/app-error.js';
import { logger } from '../../core/logger/logger.js';

let transporter: ReturnType<typeof nodemailer.createTransport> | undefined;

export async function sendRegistrationCode(email: string, code: string, expiresInMinutes: number) {
  if (!env.SMTP_URL || !env.SMTP_FROM) {
    throw new AppError(503, 'AUTH_EMAIL_UNAVAILABLE', 'StoryCraft chưa thể gửi email xác nhận. Vui lòng thử lại sau.');
  }

  if (!transporter) {
    const url = new URL(env.SMTP_URL);
    if (url.protocol === 'smtp:' && url.username) url.searchParams.set('requireTLS', 'true');
    url.searchParams.set('connectionTimeout', '6000');
    url.searchParams.set('greetingTimeout', '6000');
    url.searchParams.set('socketTimeout', '10000');
    transporter = nodemailer.createTransport(url.toString());
  }

  try {
    const receipt = await transporter.sendMail({
      from: env.SMTP_FROM,
      to: email,
      subject: 'Mã xác nhận tài khoản StoryCraft',
      text: `Mã xác nhận tài khoản StoryCraft của bạn là ${code}.\n\nMã có hiệu lực trong ${expiresInMinutes} phút. Hãy nhập mã trên trang đăng ký. Nếu bạn không yêu cầu tạo tài khoản, hãy bỏ qua email này.`
    });
    if (!receipt.accepted.length) throw new Error('SMTP recipient not accepted');
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? error.code : undefined;
    logger.warn({ smtpErrorCode: code }, 'Registration email delivery failed');
    throw new AppError(503, 'AUTH_EMAIL_UNAVAILABLE', 'Chưa gửi được email xác nhận. Vui lòng thử lại sau.');
  }
}
