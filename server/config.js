import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z
  .object({
    PORT: z.coerce.number().int().positive({
      required_error: 'PORT is required — set it in .env',
    }),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    INFERENCE_URL: z.string().url('INFERENCE_URL must be a valid URL'),
    INFERENCE_TOKEN: z.string().min(1, 'INFERENCE_TOKEN is required'),
    FAST_INFERENCE_URL: z.string().url('FAST_INFERENCE_URL must be a valid URL'),
    FAST_INFERENCE_TOKEN: z.string().min(1, 'FAST_INFERENCE_TOKEN is required'),
    FAST_INFERENCE_MODEL: z.string().default('gpt-oss-120b'),
    FAST_REQUEST_LIMIT: z.coerce.number().int().positive().default(3),
    API_DOMAIN: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z
        .string()
        .trim()
        .regex(/^[A-Za-z0-9.-]+$/, 'API_DOMAIN must be a hostname without protocol')
        .optional(),
    ),
    GEMINI_MODEL: z.string().default('gemini-2.5-flash-lite'),
    SYSTEM_INSTRUCTION: z
      .string()
      .default('You are a helpful assistant for my website.'),
    GEMINI_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(1024),
    GEMINI_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.4),
    ALLOWED_ORIGINS: z.string().default('*'),
    MAX_BODY_BYTES: z.coerce.number().int().positive().default(32 * 1024),
    MAX_MESSAGE_CHARS: z.coerce.number().int().positive().default(2000),
    MAX_HISTORY_TURNS: z.coerce.number().int().positive().default(20),
    SUMMARIZE_ENABLED: z
      .preprocess((value) => {
        if (typeof value === 'string') {
          return value.trim().toLowerCase() !== 'false';
        }
        return value ?? true;
      }, z.boolean())
      .default(true),
    SUMMARIZE_EVERY_N_TURNS: z.coerce.number().int().positive().default(5),
    SUMMARIZE_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(512),
    RATE_LIMIT_GLOBAL_MAX: z.coerce.number().int().positive().default(100),
    RATE_LIMIT_CHAT_MAX: z.coerce.number().int().positive().default(30),
    RATE_LIMIT_BURST_MAX: z.coerce.number().int().positive().default(5),
    RATE_LIMIT_CHAT_PER_APP_MAX: z.coerce.number().int().positive().default(30),
    RATE_LIMIT_BURST_PER_APP_MAX: z.coerce.number().int().positive().default(5),
    RATE_LIMIT_DAILY_PER_IP_MAX: z.coerce.number().int().positive().default(100),
    RATE_LIMIT_DAILY_PER_APP_MAX: z.coerce.number().int().positive().default(100),
    DAILY_API_CALL_LIMIT: z.coerce.number().int().positive().default(500),
    USAGE_STORE_PATH: z.string().default('./data/usage.json'),
    CLIENT_ROUTING_STORE_PATH: z.string().default('./data/client-routing.json'),
    DATABASE_URL: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z.string().url('DATABASE_URL must be a valid URL').optional(),
    ),
    PUBLIC_API_URL: z.string().optional(),
    WIDGET_TITLE: z.string().default('Chat with us'),
    WIDGET_PLACEHOLDER: z.string().default('Type your message...'),
    WIDGET_PRIMARY_COLOR: z.string().default('#2563eb'),
    WIDGET_POSITION: z.enum(['bottom-right', 'bottom-left']).default('bottom-right'),
    WIDGET_CLIENT_APP: z
      .preprocess(
        (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
        z
          .string()
          .trim()
          .max(100)
          .regex(/^[A-Za-z0-9._-]+$/, 'Use only letters, numbers, dot, underscore, or dash')
          .optional(),
      ),
    RAG_ENABLED: z
      .preprocess((value) => {
        if (typeof value === 'string') {
          return value.trim().toLowerCase() !== 'false';
        }
        return value ?? true;
      }, z.boolean())
      .default(true),
    RAG_DOCS_PATH: z.string().default('./docs'),
    RAG_TOP_K: z.coerce.number().int().positive().default(3),
    RAG_MAX_CHUNK_CHARS: z.coerce.number().int().positive().default(1200),
    RAG_MIN_SCORE: z.coerce.number().min(0).max(1).default(0.55),
    RAG_EMBEDDING_URL: z
      .string()
      .url('RAG_EMBEDDING_URL must be a valid URL')
      .default('http://localhost:4445/v1/embeddings'),
    RAG_EMBEDDING_API_KEY: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z.string().min(1).optional(),
    ),
    RAG_EMBEDDING_MODEL: z.string().default('BAAI/bge-small-en-v1.5'),
    RAG_EMBEDDING_BATCH_SIZE: z.coerce.number().int().positive().default(32),
    RAG_SYNC_ON_STARTUP: z
      .preprocess((value) => {
        if (typeof value === 'string') {
          return value.trim().toLowerCase() === 'true';
        }
        return value ?? false;
      }, z.boolean())
      .default(false),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'production') {
      const origins = data.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
      if ((origins.length === 0 || origins.includes('*')) && !data.API_DOMAIN) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'ALLOWED_ORIGINS must be explicit in production unless API_DOMAIN is set',
          path: ['ALLOWED_ORIGINS'],
        });
      }
      if (!data.DATABASE_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'DATABASE_URL is required in production',
          path: ['DATABASE_URL'],
        });
      }
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const messages = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid configuration:\n${messages}`);
}

const raw = parsed.data;
const apiOrigin = raw.API_DOMAIN ? `https://${raw.API_DOMAIN}` : undefined;

const allowedOrigins =
  raw.ALLOWED_ORIGINS === '*' && !apiOrigin
    ? '*'
    : raw.ALLOWED_ORIGINS === '*'
      ? [apiOrigin]
    : raw.ALLOWED_ORIGINS.split(',')
        .map((o) => o.trim())
        .filter(Boolean);

export const config = {
  port: raw.PORT,
  nodeEnv: raw.NODE_ENV,
  inferenceUrl: raw.INFERENCE_URL,
  inferenceToken: raw.INFERENCE_TOKEN,
  fastInferenceUrl: raw.FAST_INFERENCE_URL,
  fastInferenceToken: raw.FAST_INFERENCE_TOKEN,
  fastInferenceModel: raw.FAST_INFERENCE_MODEL,
  fastRequestLimit: raw.FAST_REQUEST_LIMIT,
  apiDomain: raw.API_DOMAIN,
  geminiModel: raw.GEMINI_MODEL,
  systemInstruction: raw.SYSTEM_INSTRUCTION,
  geminiMaxOutputTokens: raw.GEMINI_MAX_OUTPUT_TOKENS,
  geminiTemperature: raw.GEMINI_TEMPERATURE,
  allowedOrigins,
  maxBodyBytes: raw.MAX_BODY_BYTES,
  maxMessageChars: raw.MAX_MESSAGE_CHARS,
  maxHistoryTurns: raw.MAX_HISTORY_TURNS,
  summarizeEnabled: raw.SUMMARIZE_ENABLED,
  summarizeEveryNTurns: raw.SUMMARIZE_EVERY_N_TURNS,
  summarizeMaxOutputTokens: raw.SUMMARIZE_MAX_OUTPUT_TOKENS,
  rateLimit: {
    globalMax: raw.RATE_LIMIT_GLOBAL_MAX,
    chatMax: raw.RATE_LIMIT_CHAT_MAX,
    burstMax: raw.RATE_LIMIT_BURST_MAX,
    chatPerAppMax: raw.RATE_LIMIT_CHAT_PER_APP_MAX,
    burstPerAppMax: raw.RATE_LIMIT_BURST_PER_APP_MAX,
    dailyPerIpMax: raw.RATE_LIMIT_DAILY_PER_IP_MAX,
    dailyPerAppMax: raw.RATE_LIMIT_DAILY_PER_APP_MAX,
  },
  dailyApiCallLimit: raw.DAILY_API_CALL_LIMIT,
  usageStorePath: raw.USAGE_STORE_PATH,
  clientRoutingStorePath: raw.CLIENT_ROUTING_STORE_PATH,
  databaseUrl: raw.DATABASE_URL,
  publicApiUrl: raw.PUBLIC_API_URL?.trim() || (apiOrigin ? `${apiOrigin}/chatbot` : '/chatbot'),
  widgetTitle: raw.WIDGET_TITLE,
  widgetPlaceholder: raw.WIDGET_PLACEHOLDER,
  widgetPrimaryColor: raw.WIDGET_PRIMARY_COLOR,
  widgetPosition: raw.WIDGET_POSITION,
  widgetClientApp: raw.WIDGET_CLIENT_APP,
  ragEnabled: raw.RAG_ENABLED,
  ragDocsPath: raw.RAG_DOCS_PATH,
  ragTopK: raw.RAG_TOP_K,
  ragMaxChunkChars: raw.RAG_MAX_CHUNK_CHARS,
  ragMinScore: raw.RAG_MIN_SCORE,
  ragEmbeddingUrl: raw.RAG_EMBEDDING_URL,
  ragEmbeddingApiKey: raw.RAG_EMBEDDING_API_KEY,
  ragEmbeddingModel: raw.RAG_EMBEDDING_MODEL,
  ragEmbeddingBatchSize: raw.RAG_EMBEDDING_BATCH_SIZE,
  ragSyncOnStartup: raw.RAG_SYNC_ON_STARTUP,
};
