import fs from 'fs/promises';
import path from 'path';

process.env.NODE_ENV = 'test';
process.env.PORT = process.env.PORT || '4444';
process.env.INFERENCE_URL =
  process.env.INFERENCE_URL ||
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';
process.env.INFERENCE_TOKEN = process.env.INFERENCE_TOKEN || 'test-gemini-token';
process.env.FAST_INFERENCE_URL =
  process.env.FAST_INFERENCE_URL || 'https://api.cerebras.ai/v1/chat/completions';
process.env.FAST_INFERENCE_TOKEN = process.env.FAST_INFERENCE_TOKEN || 'test-cerebras-token';
process.env.FAST_REQUEST_LIMIT = process.env.FAST_REQUEST_LIMIT || '3';
process.env.API_DOMAIN = '';
process.env.ALLOWED_ORIGINS = '*';
process.env.DAILY_API_CALL_LIMIT = process.env.DAILY_API_CALL_LIMIT || '5';
process.env.RATE_LIMIT_GLOBAL_MAX = process.env.RATE_LIMIT_GLOBAL_MAX || '1000';
process.env.RATE_LIMIT_CHAT_MAX = process.env.RATE_LIMIT_CHAT_MAX || '1000';
process.env.RATE_LIMIT_BURST_MAX = process.env.RATE_LIMIT_BURST_MAX || '1000';
process.env.RATE_LIMIT_DAILY_PER_IP_MAX = process.env.RATE_LIMIT_DAILY_PER_IP_MAX || '1000';
process.env.USAGE_STORE_PATH = process.env.USAGE_STORE_PATH || './data/test-usage.json';
process.env.CLIENT_ROUTING_STORE_PATH =
  process.env.CLIENT_ROUTING_STORE_PATH || './data/test-client-routing.json';
process.env.DATABASE_URL = '';
process.env.RAG_DOCS_PATH = process.env.RAG_DOCS_PATH || './tests/fixtures/rag-docs';
process.env.RAG_EMBEDDING_URL =
  process.env.RAG_EMBEDDING_URL || 'http://localhost:4445/v1/embeddings';
process.env.RAG_EMBEDDING_MODEL =
  process.env.RAG_EMBEDDING_MODEL || 'BAAI/bge-small-en-v1.5';

const usagePath = path.resolve(process.env.USAGE_STORE_PATH);
const routingPath = path.resolve(process.env.CLIENT_ROUTING_STORE_PATH);

await fs.mkdir(path.dirname(usagePath), { recursive: true });
await fs.mkdir(path.dirname(routingPath), { recursive: true });
await fs.writeFile(
  usagePath,
  JSON.stringify({ date: new Date().toISOString().slice(0, 10), count: 0 }, null, 2),
);
await fs.writeFile(routingPath, JSON.stringify({ clients: {} }, null, 2));
