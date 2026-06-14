import { Router } from 'express';
import { validateChatRequest } from '../middleware/validate.js';
import {
  chatRateLimits,
} from '../middleware/rateLimit.js';
import { dailyQuota } from '../middleware/quota.js';
import { getClientIp } from '../middleware/rateLimit.js';
import { generateChatReply } from '../services/inference.js';

const router = Router();

router.post(
  '/chatbot',
  validateChatRequest,
  ...chatRateLimits,
  dailyQuota,
  async (req, res, next) => {
    try {
      const { message, history, clientApp } = req.validatedChat;
      const clientIp = getClientIp(req);
      const clientKey = clientApp ? `app:${clientApp}:ip:${clientIp}` : clientIp;
      const result = await generateChatReply({
        message,
        history,
        clientKey,
        clientApp,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
