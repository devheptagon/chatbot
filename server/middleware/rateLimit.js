import rateLimit from 'express-rate-limit';
import { config } from '../config.js';

export function getClientIp(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function createLimiter({ windowMs, max, code, message, keyGenerator, skip }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: keyGenerator ?? getClientIp,
    skip: skip ?? ((req) => req.path === '/health'),
    handler: (req, res, _next, options) => {
      const retryAfterSeconds = Math.ceil(options.windowMs / 1000);
      res.set('Retry-After', String(retryAfterSeconds));
      res.status(429).json({
        statusCode: 429,
        code,
        message,
        retryAfter: retryAfterSeconds,
      });
    },
  });
}

function getClientApp(req) {
  return req.validatedChat?.clientApp;
}

function skipWithoutClientApp(req) {
  return req.path === '/health' || !getClientApp(req);
}

function getClientAppKey(req) {
  return `app:${getClientApp(req)}`;
}

export const globalRateLimit = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: config.rateLimit.globalMax,
  code: 'GLOBAL_RATE_LIMITED',
  message: 'Too many requests. Please try again later.',
});

export const chatRateLimit = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: config.rateLimit.chatMax,
  code: 'CHAT_RATE_LIMITED',
  message: 'Too many chat requests. Please try again later.',
});

export const burstRateLimit = createLimiter({
  windowMs: 60 * 1000,
  max: config.rateLimit.burstMax,
  code: 'BURST_RATE_LIMITED',
  message: 'You are sending messages too quickly. Please slow down.',
});

export const dailyIpRateLimit = createLimiter({
  windowMs: 24 * 60 * 60 * 1000,
  max: config.rateLimit.dailyPerIpMax,
  code: 'DAILY_IP_RATE_LIMITED',
  message: 'Daily chat limit reached for your IP. Please try again tomorrow.',
});

export const chatClientAppRateLimit = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: config.rateLimit.chatPerAppMax,
  code: 'CLIENT_APP_RATE_LIMITED',
  message: 'Too many chat requests for this client-app. Please try again later.',
  keyGenerator: getClientAppKey,
  skip: skipWithoutClientApp,
});

export const burstClientAppRateLimit = createLimiter({
  windowMs: 60 * 1000,
  max: config.rateLimit.burstPerAppMax,
  code: 'CLIENT_APP_BURST_RATE_LIMITED',
  message: 'This client-app is sending messages too quickly. Please slow down.',
  keyGenerator: getClientAppKey,
  skip: skipWithoutClientApp,
});

export const dailyClientAppRateLimit = createLimiter({
  windowMs: 24 * 60 * 60 * 1000,
  max: config.rateLimit.dailyPerAppMax,
  code: 'DAILY_CLIENT_APP_RATE_LIMITED',
  message: 'Daily chat limit reached for this client-app. Please try again tomorrow.',
  keyGenerator: getClientAppKey,
  skip: skipWithoutClientApp,
});

export const chatRateLimits = [
  chatRateLimit,
  burstRateLimit,
  dailyIpRateLimit,
  chatClientAppRateLimit,
  burstClientAppRateLimit,
  dailyClientAppRateLimit,
];
