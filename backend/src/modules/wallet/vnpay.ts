import { createHmac, timingSafeEqual } from 'node:crypto';

// Pure VNPay sandbox helpers (API version 2.1.0). No env or DB access, so they are unit-testable.
// Signing mirrors VNPay's Node.js sample: sort keys, encode each value with encodeURIComponent
// and spaces as '+', join as k=v&k=v, then HMAC-SHA512 with the merchant hash secret.

export const VNPAY_VERSION = '2.1.0';
const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;
const SIGNATURE_FIELDS = new Set(['vnp_SecureHash', 'vnp_SecureHashType']);

export type VnpayConfig = {
  tmnCode: string;
  hashSecret: string;
  paymentUrl: string;
  returnUrl: string;
};

export type BuildVnpayPaymentUrlInput = {
  config: VnpayConfig;
  txnRef: string;
  amountVnd: number;
  orderInfo: string;
  ipAddr: string;
  createdAt: Date;
  expiresAt: Date;
};

export type VnpayCallback =
  | { signatureValid: false }
  | {
      signatureValid: true;
      txnRef: string;
      amountVnd: number | null;
      responseCode: string;
      transactionStatus: string;
      transactionNo: string | null;
      paid: boolean;
      params: Record<string, string>;
    };

function encodeVnpayValue(value: string) {
  return encodeURIComponent(value).replace(/%20/g, '+');
}

export function buildVnpaySignData(params: Record<string, string>) {
  return Object.keys(params)
    .filter((key) => !SIGNATURE_FIELDS.has(key))
    .sort()
    .map((key) => `${encodeURIComponent(key)}=${encodeVnpayValue(params[key])}`)
    .join('&');
}

export function signVnpayParams(params: Record<string, string>, hashSecret: string) {
  return createHmac('sha512', hashSecret).update(Buffer.from(buildVnpaySignData(params), 'utf-8')).digest('hex');
}

/** yyyyMMddHHmmss in Vietnam time (GMT+7), as VNPay requires. */
export function formatVnpayDate(date: Date) {
  const shifted = new Date(date.getTime() + VIETNAM_OFFSET_MS);
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    String(shifted.getUTCFullYear()) +
    pad(shifted.getUTCMonth() + 1) +
    pad(shifted.getUTCDate()) +
    pad(shifted.getUTCHours()) +
    pad(shifted.getUTCMinutes()) +
    pad(shifted.getUTCSeconds())
  );
}

/** Deposit session UUID → vnp_TxnRef (32 hex chars, no hyphens). */
export function toVnpayTxnRef(depositSessionId: string) {
  return depositSessionId.replace(/-/g, '').toLowerCase();
}

/** vnp_TxnRef → deposit session UUID, or null when it is not one of ours. */
export function fromVnpayTxnRef(txnRef: string) {
  if (!/^[0-9a-f]{32}$/i.test(txnRef)) return null;
  const hex = txnRef.toLowerCase();
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** VNPay rejects diacritics and special characters in vnp_OrderInfo. */
export function toVnpayOrderInfo(text: string) {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 255);
}

/** VNPay expects an IPv4-style address; map IPv6 loopback and IPv4-mapped forms. */
export function toVnpayIpAddr(ip: string | undefined) {
  if (!ip || ip === '::1') return '127.0.0.1';
  return ip.startsWith('::ffff:') ? ip.slice('::ffff:'.length) : ip;
}

export function buildVnpayPaymentUrl(input: BuildVnpayPaymentUrlInput) {
  if (!Number.isInteger(input.amountVnd) || input.amountVnd <= 0) {
    throw new Error('amountVnd must be a positive integer');
  }
  const params: Record<string, string> = {
    vnp_Version: VNPAY_VERSION,
    vnp_Command: 'pay',
    vnp_TmnCode: input.config.tmnCode,
    vnp_Amount: String(input.amountVnd * 100),
    vnp_CurrCode: 'VND',
    // Card-only: skips VNPAY-QR, which real banking apps cannot pay in the sandbox.
    vnp_BankCode: 'VNBANK',
    vnp_TxnRef: input.txnRef,
    vnp_OrderInfo: toVnpayOrderInfo(input.orderInfo),
    vnp_OrderType: 'other',
    vnp_Locale: 'vn',
    vnp_ReturnUrl: input.config.returnUrl,
    vnp_IpAddr: toVnpayIpAddr(input.ipAddr),
    vnp_CreateDate: formatVnpayDate(input.createdAt),
    vnp_ExpireDate: formatVnpayDate(input.expiresAt)
  };
  const secureHash = signVnpayParams(params, input.config.hashSecret);
  return `${input.config.paymentUrl}?${buildVnpaySignData(params)}&vnp_SecureHash=${secureHash}`;
}

/**
 * Verifies a Return URL or IPN query (already URL-decoded, e.g. Express `request.query`).
 * Only `vnp_` fields take part in the signature; anything else is ignored.
 */
export function verifyVnpayCallback(query: Record<string, unknown>, hashSecret: string): VnpayCallback {
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    if (!key.startsWith('vnp_')) continue;
    if (typeof value !== 'string') return { signatureValid: false };
    params[key] = value;
  }

  const received = params.vnp_SecureHash;
  if (!received || !/^[0-9a-f]+$/i.test(received)) return { signatureValid: false };
  const expected = signVnpayParams(params, hashSecret);
  const receivedBuffer = Buffer.from(received.toLowerCase(), 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  if (receivedBuffer.length !== expectedBuffer.length || !timingSafeEqual(receivedBuffer, expectedBuffer)) {
    return { signatureValid: false };
  }

  const rawAmount = Number(params.vnp_Amount);
  const amountVnd = Number.isInteger(rawAmount) && rawAmount > 0 && rawAmount % 100 === 0 ? rawAmount / 100 : null;
  const responseCode = params.vnp_ResponseCode ?? '';
  const transactionStatus = params.vnp_TransactionStatus ?? '';
  return {
    signatureValid: true,
    txnRef: params.vnp_TxnRef ?? '',
    amountVnd,
    responseCode,
    transactionStatus,
    transactionNo: params.vnp_TransactionNo ?? null,
    paid: responseCode === '00' && transactionStatus === '00',
    params
  };
}
