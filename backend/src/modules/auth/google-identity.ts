import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import { z } from 'zod';
import { AppError } from '../../core/errors/app-error.js';

const google = new OAuth2Client();
const identitySchema = z.object({
  sub: z.string().min(1).max(255),
  email: z.string().email().max(255),
  email_verified: z.literal(true),
  name: z.string().optional()
});

export async function verifyGoogleIdentity(credential: string, clientId: string, nonce: string) {
  let payload: (TokenPayload & { nonce?: string }) | undefined;
  try {
    payload = (await google.verifyIdToken({ idToken: credential, audience: clientId })).getPayload();
  } catch {
    throw new AppError(401, 'AUTH_GOOGLE_CREDENTIAL', 'Google không xác minh được thông tin đăng nhập. Hãy thử lại.');
  }

  if (payload?.nonce !== nonce) {
    throw new AppError(401, 'AUTH_GOOGLE_CHALLENGE', 'Phiên đăng nhập Google đã hết hạn. Hãy thử lại.');
  }
  const identity = identitySchema.safeParse(payload);
  if (!identity.success) {
    throw new AppError(401, 'AUTH_GOOGLE_EMAIL', 'Hãy sử dụng tài khoản Google có địa chỉ email đã xác minh.');
  }

  return {
    subject: identity.data.sub,
    email: identity.data.email.toLowerCase(),
    displayName: identity.data.name?.trim().slice(0, 100)
  };
}
