import { config } from '../config.js';
import { createUsageStore } from '../services/usageStore.js';

const usageStore = createUsageStore(config.usageStorePath);

function secondsUntilUtcMidnight() {
  const now = new Date();
  const midnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
  return Math.max(1, Math.ceil((midnight.getTime() - now.getTime()) / 1000));
}

export function createDailyQuotaMiddleware(store = usageStore) {
  return async function dailyQuota(req, res, next) {
    try {
      const reservation = await store.reserveCall(config.dailyApiCallLimit);

      if (!reservation.allowed) {
        const retryAfter = secondsUntilUtcMidnight();
        res.set('Retry-After', String(retryAfter));
        return res.status(429).json({
          statusCode: 429,
          code: 'DAILY_QUOTA_EXCEEDED',
          message: 'Daily chat quota reached',
          retryAfter,
          usage: {
            count: reservation.count,
            limit: reservation.limit,
          },
        });
      }

      req.dailyUsage = {
        count: reservation.count,
        limit: reservation.limit,
      };
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export const dailyQuota = createDailyQuotaMiddleware();

export { usageStore };
