import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/index.js';
import {
  mockGeminiSuccess,
  mockGeminiFailure,
  mockInferenceRouting,
} from './helpers.js';
import fs from 'fs/promises';
import path from 'path';

const usagePath = path.resolve(process.env.USAGE_STORE_PATH);
const routingPath = path.resolve(process.env.CLIENT_ROUTING_STORE_PATH);

async function resetStores() {
  await fs.writeFile(
    usagePath,
    JSON.stringify({ date: new Date().toISOString().slice(0, 10), count: 0 }, null, 2),
  );
  await fs.writeFile(routingPath, JSON.stringify({ clients: {} }, null, 2));
}

describe('POST /chatbot', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await resetStores();
  });

  it('routes the first 3 client requests to Cerebras and then Gemini', async () => {
    const fetchSpy = mockInferenceRouting({
      cerebrasReply: 'Fast reply',
      geminiReply: 'Gemini reply',
    });
    const app = createApp();

    for (let i = 0; i < 3; i += 1) {
      const response = await request(app)
        .post('/chatbot')
        .send({ message: `fast-${i + 1}` })
        .expect(200);

      expect(response.body.reply).toBe('Fast reply');
      expect(response.body.provider).toBe('cerebras');
    }

    const geminiResponse = await request(app)
      .post('/chatbot')
      .send({ message: 'switch-to-gemini' })
      .expect(200);

    expect(geminiResponse.body.reply).toBe('Gemini reply');
    expect(geminiResponse.body.provider).toBe('gemini');
    expect(fetchSpy).toHaveBeenCalledTimes(4);
    expect(fetchSpy.mock.calls[0][0]).toBe(process.env.FAST_INFERENCE_URL);
    expect(fetchSpy.mock.calls[3][0]).toBe(process.env.INFERENCE_URL);
  });

  it('scopes provider routing by client-app when provided', async () => {
    const fetchSpy = mockInferenceRouting({
      cerebrasReply: 'Fast reply',
      geminiReply: 'Gemini reply',
    });
    const app = createApp();

    for (let i = 0; i < 3; i += 1) {
      await request(app)
        .post('/chatbot')
        .send({ message: `app-a-${i + 1}`, 'client-app': 'app-a' })
        .expect(200);
    }

    const appBResponse = await request(app)
      .post('/chatbot')
      .send({ message: 'app-b-first', 'client-app': 'app-b' })
      .expect(200);
    const appAResponse = await request(app)
      .post('/chatbot')
      .send({ message: 'app-a-fourth', 'client-app': 'app-a' })
      .expect(200);

    expect(appBResponse.body.provider).toBe('cerebras');
    expect(appAResponse.body.provider).toBe('gemini');
    expect(fetchSpy.mock.calls[3][0]).toBe(process.env.FAST_INFERENCE_URL);
    expect(fetchSpy.mock.calls[4][0]).toBe(process.env.INFERENCE_URL);
  });

  it('returns a Gemini reply when only Gemini is called', async () => {
    mockGeminiSuccess('We are open Mon–Fri 9–5.');

    const routing = await fs.readFile(routingPath, 'utf8');
    const parsed = JSON.parse(routing);
    parsed.clients['::ffff:127.0.0.1'] = 3;
    await fs.writeFile(routingPath, JSON.stringify(parsed, null, 2));

    const app = createApp();
    const response = await request(app)
      .post('/chatbot')
      .send({ message: 'What are your hours?' })
      .expect(200);

    expect(response.body.reply).toBe('We are open Mon–Fri 9–5.');
    expect(response.body.provider).toBe('gemini');
    expect(response.body.model).toBe('gemini-2.5-flash-lite');
  });

  it('returns 400 for empty message', async () => {
    const fetchSpy = mockInferenceRouting();
    const app = createApp();

    const response = await request(app)
      .post('/chatbot')
      .send({ message: '' })
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns 502 when Gemini fails', async () => {
    mockGeminiFailure(500, 'Gemini unavailable');

    const routing = await fs.readFile(routingPath, 'utf8');
    const parsed = JSON.parse(routing);
    parsed.clients['::ffff:127.0.0.1'] = 3;
    await fs.writeFile(routingPath, JSON.stringify(parsed, null, 2));

    const app = createApp();
    const response = await request(app)
      .post('/chatbot')
      .send({ message: 'Hello' })
      .expect(502);

    expect(response.body.code).toBe('UPSTREAM_ERROR');
    expect(response.body.message).toBe('Internal server error');
  });

  it('logs inference with client-app, llm url, dates, and input/output', async () => {
    const logSpy = vi.fn().mockResolvedValue(undefined);
    vi.doMock('../server/services/inferenceLogStore.js', () => ({
      inferenceLogStore: { logInference: logSpy },
      createInferenceLogStore: vi.fn(),
    }));
    mockInferenceRouting({ cerebrasReply: 'Logged reply' });

    vi.resetModules();
    const { createApp } = await import('../server/index.js');
    const app = createApp();

    await request(app)
      .post('/chatbot')
      .send({ message: 'Hello', 'client-app': 'ios-app' })
      .expect(200);

    expect(logSpy).toHaveBeenCalledTimes(1);
    const payload = logSpy.mock.calls[0][0];
    expect(payload.clientApp).toBe('ios-app');
    expect(payload.llmUrl).toBe(process.env.FAST_INFERENCE_URL);
    expect(payload.inferenceInput).toEqual({ message: 'Hello', history: [] });
    expect(payload.inferenceOutput).toMatchObject({
      reply: 'Logged reply',
      provider: 'cerebras',
    });
    expect(payload.requestDate).toBeInstanceOf(Date);
    expect(payload.responseDate).toBeInstanceOf(Date);
    expect(payload.responseDate.getTime()).toBeGreaterThanOrEqual(
      payload.requestDate.getTime(),
    );

    vi.resetModules();
  });

  it('forwards conversation history to Gemini', async () => {
    const fetchSpy = mockGeminiSuccess('Sure, I can help.');

    const routing = await fs.readFile(routingPath, 'utf8');
    const parsed = JSON.parse(routing);
    parsed.clients['::ffff:127.0.0.1'] = 3;
    await fs.writeFile(routingPath, JSON.stringify(parsed, null, 2));

    const app = createApp();
    await request(app)
      .post('/chatbot')
      .send({
        message: 'Tell me more',
        history: [
          { role: 'user', parts: [{ text: 'Hi' }] },
          { role: 'model', parts: [{ text: 'Hello!' }] },
        ],
      })
      .expect(200);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, options] = fetchSpy.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.contents).toHaveLength(3);
    expect(body.contents[2].parts[0].text).toBe('Tell me more');
  });
});

describe('GET /health', () => {
  it('returns ok', async () => {
    const app = createApp();
    const response = await request(app).get('/health').expect(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});

describe('GET /chatbot', () => {
  it('serves the demo page', async () => {
    const app = createApp();
    const response = await request(app).get('/chatbot').expect(200);

    expect(response.headers['content-type']).toMatch(/html/);
    expect(response.text).toContain('Chatbot Demo');
  });
});

describe('GET /chatbot-config.js', () => {
  it('returns widget config from env', async () => {
    const app = createApp();
    const response = await request(app).get('/chatbot-config.js').expect(200);

    expect(response.headers['content-type']).toMatch(/javascript/);
    expect(response.text).toContain('window.CHATBOT_CONFIG');
    expect(response.text).toContain('"/chatbot"');
  });

  it('returns widget config under the /chatbot path prefix', async () => {
    const app = createApp();
    const response = await request(app).get('/chatbot/chatbot-config.js').expect(200);

    expect(response.headers['content-type']).toMatch(/javascript/);
    expect(response.text).toContain('window.CHATBOT_CONFIG');
  });

  it('uses a relative apiUrl when config is served from a proxy host', async () => {
    const previousApiDomain = process.env.API_DOMAIN;
    const previousPublicApiUrl = process.env.PUBLIC_API_URL;
    process.env.API_DOMAIN = 'chatbot.heptagonsoft.com';
    delete process.env.PUBLIC_API_URL;

    vi.resetModules();
    const { createApp: createConfiguredApp } = await import('../server/index.js');
    const app = createConfiguredApp();
    const response = await request(app)
      .get('/chatbot/chatbot-config.js')
      .set('Host', 'heptagonsoft.com')
      .expect(200);

    expect(response.text).toContain('"apiUrl": "/chatbot"');

    process.env.API_DOMAIN = previousApiDomain;
    if (previousPublicApiUrl === undefined) {
      delete process.env.PUBLIC_API_URL;
    } else {
      process.env.PUBLIC_API_URL = previousPublicApiUrl;
    }
    vi.resetModules();
  });
});
