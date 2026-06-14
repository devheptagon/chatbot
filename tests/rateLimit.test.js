import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'fs/promises';
import path from 'path';

const usagePath = path.resolve('./data/test-rate-usage.json');
const routingPath = path.resolve('./data/test-rate-routing.json');

async function resetStores(filePath, routingFilePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.mkdir(path.dirname(routingFilePath), { recursive: true });
  await fs.writeFile(
    filePath,
    JSON.stringify({ date: new Date().toISOString().slice(0, 10), count: 0 }, null, 2),
  );
  await fs.writeFile(routingFilePath, JSON.stringify({ clients: {} }, null, 2));
}

describe('rate limiting and quota', () => {
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.resetModules();
    await resetStores(usagePath, routingPath);
  });

  afterEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      INFERENCE_URL:
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent',
      INFERENCE_TOKEN: 'test-gemini-token',
      FAST_INFERENCE_URL: 'https://api.cerebras.ai/v1/chat/completions',
      FAST_INFERENCE_TOKEN: 'test-cerebras-token',
    };
    vi.resetModules();
  });

  it('returns 429 when burst limit is exceeded', async () => {
    process.env.RATE_LIMIT_BURST_MAX = '2';
    process.env.RATE_LIMIT_CHAT_MAX = '1000';
    process.env.RATE_LIMIT_DAILY_PER_IP_MAX = '1000';
    process.env.DAILY_API_CALL_LIMIT = '1000';
    process.env.USAGE_STORE_PATH = usagePath;
    process.env.CLIENT_ROUTING_STORE_PATH = routingPath;

    vi.doMock('../server/services/inference.js', () => ({
      generateChatReply: vi.fn(async () => ({
        reply: 'ok',
        model: 'gemini-2.5-flash-lite',
        provider: 'gemini',
      })),
    }));

    const { createApp } = await import('../server/index.js');
    const app = createApp();

    await request(app).post('/chatbot').send({ message: 'one' }).expect(200);
    await request(app).post('/chatbot').send({ message: 'two' }).expect(200);

    const limited = await request(app)
      .post('/chatbot')
      .send({ message: 'three' })
      .expect(429);

    expect(limited.body.code).toBe('BURST_RATE_LIMITED');
  });

  it('returns 429 when client-app burst limit is exceeded', async () => {
    process.env.RATE_LIMIT_BURST_MAX = '1000';
    process.env.RATE_LIMIT_BURST_PER_APP_MAX = '2';
    process.env.RATE_LIMIT_CHAT_MAX = '1000';
    process.env.RATE_LIMIT_DAILY_PER_IP_MAX = '1000';
    process.env.RATE_LIMIT_DAILY_PER_APP_MAX = '1000';
    process.env.DAILY_API_CALL_LIMIT = '1000';
    process.env.USAGE_STORE_PATH = usagePath;
    process.env.CLIENT_ROUTING_STORE_PATH = routingPath;

    vi.doMock('../server/services/inference.js', () => ({
      generateChatReply: vi.fn(async () => ({
        reply: 'ok',
        model: 'gemini-2.5-flash-lite',
        provider: 'gemini',
      })),
    }));

    const { createApp } = await import('../server/index.js');
    const app = createApp();

    await request(app)
      .post('/chatbot')
      .send({ message: 'one', 'client-app': 'ios-app' })
      .expect(200);
    await request(app)
      .post('/chatbot')
      .send({ message: 'two', 'client-app': 'ios-app' })
      .expect(200);

    const limited = await request(app)
      .post('/chatbot')
      .send({ message: 'three', 'client-app': 'ios-app' })
      .expect(429);

    expect(limited.body.code).toBe('CLIENT_APP_BURST_RATE_LIMITED');
  });

  it('scopes client-app burst limits separately from other client-apps', async () => {
    process.env.RATE_LIMIT_BURST_MAX = '1000';
    process.env.RATE_LIMIT_BURST_PER_APP_MAX = '2';
    process.env.RATE_LIMIT_CHAT_MAX = '1000';
    process.env.RATE_LIMIT_DAILY_PER_IP_MAX = '1000';
    process.env.RATE_LIMIT_DAILY_PER_APP_MAX = '1000';
    process.env.DAILY_API_CALL_LIMIT = '1000';
    process.env.USAGE_STORE_PATH = usagePath;
    process.env.CLIENT_ROUTING_STORE_PATH = routingPath;

    vi.doMock('../server/services/inference.js', () => ({
      generateChatReply: vi.fn(async () => ({
        reply: 'ok',
        model: 'gemini-2.5-flash-lite',
        provider: 'gemini',
      })),
    }));

    const { createApp } = await import('../server/index.js');
    const app = createApp();

    await request(app)
      .post('/chatbot')
      .send({ message: 'one', 'client-app': 'ios-app' })
      .expect(200);
    await request(app)
      .post('/chatbot')
      .send({ message: 'two', 'client-app': 'ios-app' })
      .expect(200);

    await request(app)
      .post('/chatbot')
      .send({ message: 'first-android', 'client-app': 'android-app' })
      .expect(200);
  });

  it('returns 429 when daily total quota is exceeded', async () => {
    process.env.RATE_LIMIT_BURST_MAX = '1000';
    process.env.RATE_LIMIT_CHAT_MAX = '1000';
    process.env.RATE_LIMIT_DAILY_PER_IP_MAX = '1000';
    process.env.DAILY_API_CALL_LIMIT = '2';
    process.env.USAGE_STORE_PATH = usagePath;
    process.env.CLIENT_ROUTING_STORE_PATH = routingPath;

    vi.doMock('../server/services/inference.js', () => ({
      generateChatReply: vi.fn(async () => ({
        reply: 'ok',
        model: 'gemini-2.5-flash-lite',
        provider: 'gemini',
      })),
    }));

    const { createApp } = await import('../server/index.js');
    const app = createApp();

    await request(app).post('/chatbot').send({ message: 'one' }).expect(200);
    await request(app).post('/chatbot').send({ message: 'two' }).expect(200);

    const limited = await request(app)
      .post('/chatbot')
      .send({ message: 'three' })
      .expect(429);

    expect(limited.body.code).toBe('DAILY_QUOTA_EXCEEDED');
    expect(limited.body.message).toBe('Daily chat quota reached');
  });
});

describe('production config validation', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it('rejects wildcard origins in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.INFERENCE_URL =
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';
    process.env.INFERENCE_TOKEN = 'test-gemini-token';
    process.env.FAST_INFERENCE_URL = 'https://api.cerebras.ai/v1/chat/completions';
    process.env.FAST_INFERENCE_TOKEN = 'test-cerebras-token';
    process.env.ALLOWED_ORIGINS = '*';

    await expect(import('../server/config.js')).rejects.toThrow(
      /ALLOWED_ORIGINS must be explicit in production unless API_DOMAIN is set/i,
    );
  });

  it('uses API_DOMAIN for production origin and public API URL', async () => {
    process.env.NODE_ENV = 'production';
    process.env.INFERENCE_URL =
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';
    process.env.INFERENCE_TOKEN = 'test-gemini-token';
    process.env.FAST_INFERENCE_URL = 'https://api.cerebras.ai/v1/chat/completions';
    process.env.FAST_INFERENCE_TOKEN = 'test-cerebras-token';
    process.env.ALLOWED_ORIGINS = '*';
    process.env.API_DOMAIN = 'chatbot.heptagonsoft.com';
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/chatbot';
    delete process.env.PUBLIC_API_URL;

    const { config } = await import('../server/config.js');

    expect(config.allowedOrigins).toEqual(['https://chatbot.heptagonsoft.com']);
    expect(config.publicApiUrl).toBe('https://chatbot.heptagonsoft.com/chatbot');
  });

  it('requires DATABASE_URL in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.INFERENCE_URL =
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';
    process.env.INFERENCE_TOKEN = 'test-gemini-token';
    process.env.FAST_INFERENCE_URL = 'https://api.cerebras.ai/v1/chat/completions';
    process.env.FAST_INFERENCE_TOKEN = 'test-cerebras-token';
    process.env.ALLOWED_ORIGINS = '*';
    process.env.API_DOMAIN = 'chatbot.heptagonsoft.com';
    process.env.DATABASE_URL = '';

    await expect(import('../server/config.js')).rejects.toThrow(
      /DATABASE_URL is required in production/i,
    );
  });
});
