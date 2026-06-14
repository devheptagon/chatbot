import express from 'express';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { corsMiddleware } from './middleware/cors.js';
import { globalRateLimit } from './middleware/rateLimit.js';
import healthRouter from './routes/health.js';
import chatRouter from './routes/chat.js';
import clientConfigRouter from './routes/clientConfig.js';
import clientDemoRouter from './routes/clientDemo.js';
import { syncRagIndex } from './services/ragIndexer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.join(__dirname, '../client');

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);

  const connectSrc = ["'self'"];
  if (config.apiDomain) {
    connectSrc.push(`https://${config.apiDomain}`);
  }
  if (Array.isArray(config.allowedOrigins)) {
    for (const origin of config.allowedOrigins) {
      if (origin.startsWith('http://') || origin.startsWith('https://')) {
        connectSrc.push(origin);
      }
    }
  }

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          'connect-src': [...new Set(connectSrc)],
        },
      },
    }),
  );
  app.use(corsMiddleware);
  app.use(
    express.json({
      limit: config.maxBodyBytes,
    }),
  );
  app.use(globalRateLimit);
  app.use(healthRouter);
  app.use(clientConfigRouter);
  app.use(chatRouter);
  app.use(clientDemoRouter);

  if (config.nodeEnv !== 'test') {
    app.use('/chatbot', express.static(clientDir));
    app.use(express.static(clientDir));
  }

  app.use((_req, res) => {
    res.status(404).json({
      statusCode: 404,
      message: 'Not Found',
    });
  });

  app.use((err, req, res, _next) => {
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({
        statusCode: 413,
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request body too large',
      });
    }

    if (err?.message === 'Not allowed by CORS') {
      return res.status(403).json({
        statusCode: 403,
        code: 'CORS_FORBIDDEN',
        message: 'Origin not allowed',
      });
    }

    const statusCode = err?.statusCode ?? 500;
    const message =
      statusCode >= 500 ? 'Internal server error' : err?.message ?? 'Request failed';

    if (statusCode >= 500) {
      console.error('[chatbot]', err);
    }

    return res.status(statusCode).json({
      statusCode,
      code: statusCode === 502 ? 'UPSTREAM_ERROR' : 'REQUEST_FAILED',
      message,
    });
  });

  return app;
}

const app = createApp();

if (config.nodeEnv !== 'test') {
  app.listen(config.port, () => {
    console.log(`Chatbot API listening on port ${config.port}`);

    if (config.ragEnabled && config.ragSyncOnStartup) {
      syncRagIndex()
        .then((result) => {
          console.log(`[rag] startup sync complete: ${JSON.stringify(result)}`);
        })
        .catch((error) => {
          console.error('[rag] startup sync failed:', error);
        });
    }
  });
}

export default app;
