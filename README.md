# Heptagon Chatbot

Config-driven chatbot proxy with an embeddable HTML widget.

> **For AI agents:** see [`AGENTS.md`](./AGENTS.md) for project architecture, file map, and conventions. The first 3 requests per client are routed to Cerebras for fast responses; subsequent requests use Gemini 2.5 Flash-Lite. Any website or mobile app can integrate via a single REST endpoint.

## Quick start

```bash
cp .env.example .env
# Add INFERENCE_URL/TOKEN (Gemini) and FAST_INFERENCE_URL/TOKEN (Cerebras)
# Set PORT if you want a non-default listen port

npm install
npm start
```

API and demo UI: `http://localhost:$PORT` (from `.env`)  
Demo page: `http://localhost:$PORT/` (served by the API)

## API

### `POST /chatbot`

```json
{
  "message": "What are your hours?",
  "client-app": "website",
  "history": [
    { "role": "user", "parts": [{ "text": "Hi" }] },
    { "role": "model", "parts": [{ "text": "Hello!" }] }
  ]
}
```

Response:

```json
{
  "reply": "We are open Mon–Fri 9–5.",
  "model": "gemini-2.5-flash-lite",
  "provider": "gemini"
}
```

### `GET /health`

Returns `{ "status": "ok" }`.

### `GET /chatbot-config.js`

Returns browser-safe widget settings from `.env` (no secrets).

## Embed in a website

Load config from your API host, then the widget assets:

```html
<script src="https://your-api.example.com/chatbot-config.js"></script>
<link rel="stylesheet" href="https://your-api.example.com/widget.css" />
<script src="https://your-api.example.com/widget.js"></script>
```

If the widget is served from the same host as the API, use relative paths:

```html
<script src="/chatbot-config.js"></script>
<link rel="stylesheet" href="/widget.css" />
<script src="/widget.js"></script>
```

## Mobile app integration

```javascript
const response = await fetch("https://your-api.example.com/chatbot", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    message: "Hello",
    "client-app": "ios-app",
    history: [],
  }),
});

const data = await response.json();
console.log(data.reply);
```

## Configuration

**Port:** set `PORT` once in `.env`. The server, Docker, and dev CORS all read it from there.

| Variable | Purpose | Default |
|----------|---------|---------|
| `PORT` | API listen port | required in `.env` |
| `PUBLIC_API_URL` | Widget API path shown to browsers | `/chatbot` |
| `WIDGET_CLIENT_APP` | Optional widget client-app identifier sent to `/chatbot` | unset |
| `INFERENCE_URL` | Gemini generateContent endpoint | required |
| `INFERENCE_TOKEN` | Gemini API key | required |
| `FAST_INFERENCE_URL` | Cerebras chat completions endpoint | required |
| `FAST_INFERENCE_TOKEN` | Cerebras API key | required |
| `FAST_REQUEST_LIMIT` | Fast Cerebras requests per client before Gemini | `3` |
| `DATABASE_URL` | PostgreSQL connection for inference logging | required in production |
| `WIDGET_TITLE` | Chat panel title | `Chat with us` |
| `ALLOWED_ORIGINS` | CORS origins (comma-separated) | `*` in dev |

In development, `http://localhost:$PORT` is added to CORS automatically.

In production (`NODE_ENV=production`), `ALLOWED_ORIGINS` must be an explicit list. Wildcard `*` is rejected at startup.

## Provider routing

Per client (tracked by IP, or by `client-app` plus IP when provided):

1. Requests 1–3 → Cerebras (`FAST_INFERENCE_URL`)
2. Request 4+ → Gemini (`INFERENCE_URL`)

Routing counts are persisted in `data/client-routing.json`.

## History summarization

The client still sends full conversation history, but the server compresses it before calling the LLM.

When history has more than 10 records, the oldest 5 records are summarized into a compact summary pair. This repeats while history stays above the threshold, keeping recent turns intact and reducing token usage.

| Variable | Purpose | Default |
|----------|---------|---------|
| `SUMMARIZE_ENABLED` | Turn server-side history compression on/off | `true` |
| `SUMMARIZE_EVERY_N_TURNS` | Number of history records to compress per batch | `5` |
| `SUMMARIZE_MAX_OUTPUT_TOKENS` | Max tokens for each summary call | `512` |

Inference logs still store the original request history from the client.

## RAG (semantic knowledge base)

Place markdown files in `docs/`. The server uses **Gemini embeddings + PostgreSQL pgvector** for semantic search.

### Setup

1. Enable the pgvector extension and create the chunks table:

```bash
psql -U postgres -d chatbot -f scripts/create-rag-chunks-table.sql
```

2. Set `DATABASE_URL` in `.env` (same Postgres used for inference logging).

3. Index your docs:

```bash
npm run ingest-docs
```

4. Ask questions — each chat request embeds the user message, searches pgvector, and injects the top matches into the system prompt.

```bash
docs/
  pricing.md
  faq.md
  policies/refunds.md
```

Re-run `npm run ingest-docs` after adding or changing docs. Optionally set `RAG_SYNC_ON_STARTUP=true` to index automatically when the API starts.

| Variable | Purpose | Default |
|----------|---------|---------|
| `RAG_ENABLED` | Turn knowledge-base retrieval on/off | `true` |
| `RAG_DOCS_PATH` | Folder containing markdown files | `./docs` |
| `RAG_TOP_K` | Max sections injected per request | `3` |
| `RAG_MAX_CHUNK_CHARS` | Max characters per section chunk | `1200` |
| `RAG_MIN_SCORE` | Minimum cosine similarity (0–1) to include a chunk | `0.55` |
| `RAG_EMBEDDING_MODEL` | Gemini embedding model | `gemini-embedding-001` |
| `RAG_EMBEDDING_DIMENSIONS` | Vector size stored in pgvector | `768` |
| `RAG_SYNC_ON_STARTUP` | Re-index docs when the API boots | `false` |

If no chunks match the question, the assistant falls back to its normal behavior and should say when information is not in the knowledge base.

## Inference logging

Each successful `/chatbot` request is logged as one row in PostgreSQL database `chatbot`, table `inference`.

Logged fields:

- `client_app` — from the optional `client-app` request parameter
- `llm_url` — upstream provider URL used for the call
- `request_date` / `response_date` — timestamps around the LLM call
- `inference_input` — JSON with `message` and `history`
- `inference_output` — JSON with `reply`, `model`, and `provider`

Create the database and table with:

```bash
psql -U postgres -f scripts/create-chatbot-inference-table.sql
psql -U postgres -d chatbot -f scripts/create-rag-chunks-table.sql
```

When running in Docker on `proxy-network`, point `DATABASE_URL` at the existing Postgres container, for example:

```env
DATABASE_URL=postgres://USER:PASSWORD@global-postgres-db:5432/chatbot
```

## Rate limiting and cost guard

1. **Global** — all routes, per IP / 15 min
2. **Chat** — `/chatbot`, per IP / 15 min
3. **Burst** — `/chatbot`, per IP / 1 min
4. **Daily per IP** — `/chatbot`, per IP / day
5. **Chat per client-app** — `/chatbot`, per `client-app` / 15 min (when provided)
6. **Burst per client-app** — `/chatbot`, per `client-app` / 1 min (when provided)
7. **Daily per client-app** — `/chatbot`, per `client-app` / day (when provided)
8. **Daily total quota** — project-wide upstream call budget per UTC day (persisted in `data/usage.json`)

When `client-app` is sent, both IP and client-app limits apply. Requests without `client-app` are only limited by IP.

| Variable | Purpose | Default |
|----------|---------|---------|
| `RATE_LIMIT_CHAT_PER_APP_MAX` | Chat requests per `client-app` / 15 min | `30` |
| `RATE_LIMIT_BURST_PER_APP_MAX` | Burst requests per `client-app` / 1 min | `5` |
| `RATE_LIMIT_DAILY_PER_APP_MAX` | Daily requests per `client-app` | `100` |

When the daily quota is exhausted, the API returns `429` with `"Daily chat quota reached"` before calling either provider.

## Docker

```bash
cp .env.example .env
docker compose up --build
```

Docker reads `PORT` from `.env` for the host mapping (`${PORT}:${PORT}`).

The `./data` volume persists daily usage counters across restarts.

## Tests

```bash
npm test
```
