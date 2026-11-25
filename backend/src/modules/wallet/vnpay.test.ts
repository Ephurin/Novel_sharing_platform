import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  buildVnpayPaymentUrl,
  buildVnpaySignData,
  formatVnpayDate,
  fromVnpayTxnRef,
  signVnpayParams,
  toVnpayIpAddr,
  toVnpayOrderInfo,
  toVnpayTxnRef,
  verifyVnpayCallback,
  type VnpayConfig
} from './vnpay.js';

// Fake credentials: these tests never talk to VNPay.
const config: VnpayConfig = {
  tmnCode: 'TESTCODE',
  hashSecret: 'TEST_HASH_SECRET_NOT_REAL',
  paymentUrl: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
  returnUrl: 'http://localhost:5173/wallet/vnpay-return'
};
const sessionId = '3f1c2a9e-7b4d-4c1e-9a0f-1234567890ab';

function buildUrl(overrides: Partial<Parameters<typeof buildVnpayPaymentUrl>[0]> = {}) {
  return buildVnpayPaymentUrl({
    config,
    txnRef: toVnpayTxnRef(sessionId),
    amountVnd: 50_000,
    orderInfo: 'Nạp 500 Xu Ephurin',
    ipAddr: '::1',
    createdAt: new Date('2026-11-25T03:04:05Z'),
    expiresAt: new Date('2026-11-25T03:19:05Z'),
    ...overrides
  });
}

/** Simulates what VNPay sends back: our params plus its result fields, signed with the same secret. */
function signedCallback(fields: Record<string, string>, secret = config.hashSecret) {
  return { ...fields, vnp_SecureHashType: 'HmacSHA512', vnp_SecureHash: signVnpayParams(fields, secret) };
}

const paidFields = {
  vnp_Amount: '5000000',
  vnp_BankCode: 'NCB',
  vnp_OrderInfo: 'Nap 500 Xu Ephurin',
  vnp_ResponseCode: '00',
  vnp_TmnCode: 'TESTCODE',
  vnp_TransactionNo: '14123456',
  vnp_TransactionStatus: '00',
  vnp_TxnRef: toVnpayTxnRef(sessionId)
};

describe('VNPay signing', () => {
  test('sign data sorts keys and encodes values like the VNPay Node sample', () => {
    const data = buildVnpaySignData({
      vnp_ReturnUrl: 'http://localhost:5173/wallet/vnpay-return',
      vnp_OrderInfo: 'Nap 500 Xu',
      vnp_Amount: '5000000',
      vnp_SecureHash: 'ignored'
    });
    assert.equal(
      data,
      'vnp_Amount=5000000&vnp_OrderInfo=Nap+500+Xu&vnp_ReturnUrl=http%3A%2F%2Flocalhost%3A5173%2Fwallet%2Fvnpay-return'
    );
  });

  test('signature is HMAC-SHA512 hex of the sign data', () => {
    const params = { vnp_Amount: '5000000', vnp_TxnRef: 'abc' };
    const expected = createHmac('sha512', 'secret').update('vnp_Amount=5000000&vnp_TxnRef=abc').digest('hex');
    assert.equal(signVnpayParams(params, 'secret'), expected);
  });

  test('payment URL carries the required fields and a valid signature', () => {
    const url = new URL(buildUrl());
    const query = Object.fromEntries(url.searchParams);
    assert.equal(url.origin + url.pathname, config.paymentUrl);
    assert.equal(query.vnp_Version, '2.1.0');
    assert.equal(query.vnp_Command, 'pay');
    assert.equal(query.vnp_TmnCode, 'TESTCODE');
    assert.equal(query.vnp_Amount, '5000000');
    assert.equal(query.vnp_CurrCode, 'VND');
    assert.equal(query.vnp_BankCode, 'VNBANK');
    assert.equal(query.vnp_TxnRef, '3f1c2a9e7b4d4c1e9a0f1234567890ab');
    assert.equal(query.vnp_OrderInfo, 'Nap 500 Xu Ephurin');
    assert.equal(query.vnp_ReturnUrl, config.returnUrl);
    assert.equal(query.vnp_IpAddr, '127.0.0.1');
    assert.equal(query.vnp_CreateDate, '20261125100405');
    assert.equal(query.vnp_ExpireDate, '20261125101905');
    // URLSearchParams decodes '+' as a space, the same way Express parses the callback query.
    assert.equal(verifyVnpayCallback(query, config.hashSecret).signatureValid, true);
  });

  test('rejects non-positive or fractional amounts', () => {
    assert.throws(() => buildUrl({ amountVnd: 0 }));
    assert.throws(() => buildUrl({ amountVnd: 1000.5 }));
  });
});

describe('VNPay callback verification', () => {
  test('accepts a correctly signed paid callback', () => {
    const result = verifyVnpayCallback(signedCallback(paidFields), config.hashSecret);
    assert.equal(result.signatureValid, true);
    assert.ok(result.signatureValid);
    assert.equal(result.paid, true);
    assert.equal(result.amountVnd, 50_000);
    assert.equal(result.txnRef, '3f1c2a9e7b4d4c1e9a0f1234567890ab');
    assert.equal(result.transactionNo, '14123456');
  });

  test('rejects a callback whose amount was tampered with', () => {
    const callback = signedCallback(paidFields);
    assert.equal(verifyVnpayCallback({ ...callback, vnp_Amount: '500000000' }, config.hashSecret).signatureValid, false);
  });

  test('rejects a callback signed with another secret', () => {
    assert.equal(verifyVnpayCallback(signedCallback(paidFields, 'other-secret'), config.hashSecret).signatureValid, false);
  });

  test('rejects missing, malformed or duplicated signature fields', () => {
    assert.equal(verifyVnpayCallback(paidFields, config.hashSecret).signatureValid, false);
    assert.equal(verifyVnpayCallback({ ...paidFields, vnp_SecureHash: 'not-hex!' }, config.hashSecret).signatureValid, false);
    const callback = signedCallback(paidFields);
    assert.equal(verifyVnpayCallback({ ...callback, vnp_Amount: ['5000000', '1'] }, config.hashSecret).signatureValid, false);
  });

  test('ignores non-vnp query fields', () => {
    const result = verifyVnpayCallback({ ...signedCallback(paidFields), utm_source: 'x' }, config.hashSecret);
    assert.equal(result.signatureValid, true);
  });

  test('a cancelled payment is signed but not paid', () => {
    const result = verifyVnpayCallback(
      signedCallback({ ...paidFields, vnp_ResponseCode: '24', vnp_TransactionStatus: '02' }),
      config.hashSecret
    );
    assert.ok(result.signatureValid);
    assert.equal(result.paid, false);
    assert.equal(result.responseCode, '24');
  });
});

describe('VNPay field helpers', () => {
  test('formats dates in Vietnam time across a day boundary', () => {
    assert.equal(formatVnpayDate(new Date('2026-12-31T17:30:00Z')), '20270101003000');
  });

  test('round-trips deposit session ids through vnp_TxnRef', () => {
    assert.equal(fromVnpayTxnRef(toVnpayTxnRef(sessionId)), sessionId);
    assert.equal(fromVnpayTxnRef('not-ours'), null);
    assert.equal(fromVnpayTxnRef(`${toVnpayTxnRef(sessionId)}0`), null);
  });

  test('strips Vietnamese diacritics and special characters from order info', () => {
    assert.equal(toVnpayOrderInfo('Nạp 1.000 Xu — Đọc truyện!'), 'Nap 1 000 Xu Doc truyen');
  });

  test('normalizes client IPs', () => {
    assert.equal(toVnpayIpAddr(undefined), '127.0.0.1');
    assert.equal(toVnpayIpAddr('::ffff:10.0.0.5'), '10.0.0.5');
    assert.equal(toVnpayIpAddr('203.0.113.9'), '203.0.113.9');
  });
});
