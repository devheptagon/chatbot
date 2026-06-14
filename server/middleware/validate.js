import { z } from 'zod';
import { config } from '../config.js';

const historyPartSchema = z.object({
  text: z.string().min(1).max(config.maxMessageChars),
});

const historyTurnSchema = z.object({
  role: z.enum(['user', 'model']),
  parts: z.array(historyPartSchema).min(1),
});

const chatRequestSchema = z.object({
  message: z.string().min(1).max(config.maxMessageChars),
  'client-app': z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9._-]+$/, 'Use only letters, numbers, dot, underscore, or dash')
    .optional(),
  history: z.array(historyTurnSchema).max(config.maxHistoryTurns).optional(),
});

export function validateChatRequest(req, res, next) {
  const result = chatRequestSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Invalid request body',
      errors: result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  req.validatedChat = {
    message: result.data.message.trim(),
    clientApp: result.data['client-app'],
    history: result.data.history ?? [],
  };
  return next();
}
