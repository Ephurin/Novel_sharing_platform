
import { env } from './env.js';

export const verificationPath = env.WEB_EMIT_CANONICAL_LINKS ? '/xac-thuc-email' : '/verify-email';
export const paymentReturnPath = env.WEB_EMIT_CANONICAL_LINKS ? '/vi/ket-qua-thanh-toan' : '/wallet/vnpay-return';
export const appealsPath = env.WEB_EMIT_CANONICAL_LINKS ? '/khieu-nai' : '/appeals';
