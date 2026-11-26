import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { RequestHandler } from 'express';
import { env } from '../../core/config/env.js';
import { rateLimit } from '../../core/security/rate-limit.js';
import { appealGoogleRateLimitError, consumeAppealGoogleRateLimit } from '../../core/security/appeal-google-rate-limit.js';

const normalizeIp = (address: string) => address.replace(/^::ffff:/i, '');
let proxyAddresses: { host: string; expiresAt: number; addresses: Promise<Set<string>> } | undefined;

function resolveProxyAddresses(host: string) {
  if (isIP(host)) return Promise.resolve(new Set([normalizeIp(host)]));
  const now = Date.now();
  if (proxyAddresses?.host === host && proxyAddresses.expiresAt > now) return proxyAddresses.addresses;

  // Docker can assign the nginx container a new address after a restart.
  const addresses = lookup(host, { all: true }).then(
    (results) => new Set(results.map(({ address }) => normalizeIp(address))),
    () => new Set<string>()
  );
  proxyAddresses = { host, expiresAt: now + 5_000, addresses };
  return addresses;
}

function withAuthRateLimitIp(limit: RequestHandler): RequestHandler {
  return async (request, response, next) => {
    const peer = normalizeIp(request.socket.remoteAddress ?? '');
    const forwarded = request.get('X-Real-IP');
    const proxyHost = env.AUTH_TRUSTED_PROXY_HOST;
    // The bundled nginx overwrites X-Real-IP. Ignore client-supplied headers on direct API connections.
    response.locals.authRateLimitIp = proxyHost && forwarded && isIP(forwarded)
      && (await resolveProxyAddresses(proxyHost)).has(peer) ? normalizeIp(forwarded) : peer || 'unknown';
    return limit(request, response, next);
  };
}

export function authRateLimit(options: Omit<Parameters<typeof rateLimit>[0], 'key'>): RequestHandler {
  return withAuthRateLimitIp(rateLimit({
    ...options,
    key: (request) => `ip:${request.res?.locals.authRateLimitIp ?? 'unknown'}`
  }));
}

export function appealGoogleIpRateLimit(scope: 'appeal-google-challenge' | 'appeal-google-exchange'): RequestHandler {
  return withAuthRateLimitIp(async (_request, response, next) => {
    try {
      const retryAfterSeconds = await consumeAppealGoogleRateLimit(scope, `ip:${response.locals.authRateLimitIp}`);
      if (retryAfterSeconds !== null) {
        response.setHeader('Retry-After', String(retryAfterSeconds));
        return next(appealGoogleRateLimitError(scope, retryAfterSeconds));
      }
      next();
    } catch (error) {
      next(error);
    }
  });
}
