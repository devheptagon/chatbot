import cors from 'cors';
import { config } from '../config.js';

function getAllowedOrigins() {
  if (config.allowedOrigins === '*') {
    return '*';
  }

  const origins = [...config.allowedOrigins];

  if (config.nodeEnv === 'development') {
    const localOrigins = [
      `http://localhost:${config.port}`,
      `http://127.0.0.1:${config.port}`,
    ];

    for (const origin of localOrigins) {
      if (!origins.includes(origin)) {
        origins.push(origin);
      }
    }
  }

  return origins;
}

const allowedOrigins = getAllowedOrigins();

export const corsMiddleware =
  allowedOrigins === '*'
    ? cors()
    : cors({
        origin(origin, callback) {
          if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
            return;
          }
          callback(new Error('Not allowed by CORS'));
        },
      });
