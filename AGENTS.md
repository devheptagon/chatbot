# Agent memory — Heptagon Chatbot

Read this file first when working in this repo. It is the canonical project context for humans and AI agents.

## What this project is

**Heptagon Chatbot** (`heptagon-chatbot`) is a Node.js Express API that proxies chat requests to LLM providers and serves an embeddable HTML widget. Websites and mobile apps integrate via `POST /chatbot`.

- **Fast path:** first N requests per client → Cerebras (`FAST_INFERENCE_URL`)
- **Default path:** subsequent requests → Gemini (`INFERENCE_URL`, `gemini-2.5-flash-lite`)
- **Knowledge base (RAG):** markdown files in `docs/` are retrieved and injected into the system prompt
- **History compression:** long conversation history is summarized server-side before LLM calls

## Tech stack

| Layer | Choice |
|-------|--------|
| Runtime | Node.js ≥ 18, ES modules (`"type": "module"`) |
| HTTP | Express 4, helmet, cors, express-rate-limit |
| Validation | Zod (env in `server/config.js`, requests in `server/middleware/validate.js`) |
| LLM providers | Gemini (primary), Cerebras (fast bootstrap) |
| Persistence | JSON files in `data/` + optional PostgreSQL inference logging |
| Tests | Vitest + supertest |

No TypeScript. No frontend build step — plain HTML/CSS/JS in `client/`.

## Directory map

```
server/
  index.js              # Express app factory + listen
  config.js             # Zod-validated env → config object (read .env.example, never .env)
  routes/
    chat.js             # POST /chatbot
    health.js           # GET /health
    clientConfig.js     # GET /chatbot-config.js (widget settings, no secrets)
  middleware/
    validate.js         # Zod chat request schema
    rateLimit.js        # Per-IP and per-client-app limits
    quota.js            # Daily upstream API budget
    cors.js
  services/
    inference.js        # Orchestrator — start here for chat pipeline changes
    gemini.js           # Gemini generateContent
    cerebras.js         # Cerebras OpenAI-compatible API
    historySummarizer.js
    rag.js              # Chunking + semantic retrieval orchestration
    ragIndexer.js       # Load docs, embed chunks, sync to pgvector
    ragStore.js         # PostgreSQL pgvector search/upsert
    embeddings.js       # Gemini embedding API client
    clientRoutingStore.js
    usageStore.js
    inferenceLogStore.js
client/
  widget.js, widget.css, index.html   # Embeddable widget + demo page
docs/                   # RAG knowledge base (markdown, recursive)
tests/                  # Vitest; fixtures in tests/fixtures/
scripts/                # SQL migrations, ingest-docs.js
data/                   # Runtime JSON stores (gitignored)
```

## Request flow (`POST /chatbot`)

```
widget / API client
  → validateChatRequest (Zod)
  → rate limits + dailyQuota
  → generateChatReply (inference.js)
       ├─ clientRoutingStore.getCount → Cerebras vs Gemini
       ├─ compressHistory (historySummarizer.js)
       ├─ retrieveContext + buildRagSystemInstruction (rag.js)
       ├─ generateCerebrasReply / generateGeminiReply
       ├─ inferenceLogStore.logInference (PostgreSQL, if configured)
       └─ clientRoutingStore.increment
  → { reply, model, provider }
```

**Client key:** `app:{clientApp}:ip:{ip}` when `client-app` is sent, else just IP.

## Where to change behavior

| Goal | File(s) |
|------|---------|
| Chat pipeline / provider order | `server/services/inference.js` |
| System prompt / RAG injection | `server/services/rag.js`, `SYSTEM_INSTRUCTION` in `.env` |
| Gemini API shape | `server/services/gemini.js` |
| Cerebras API shape | `server/services/cerebras.js` |
| History summarization | `server/services/historySummarizer.js` |
| Request validation | `server/middleware/validate.js` |
| Rate limits / quota | `server/middleware/rateLimit.js`, `quota.js` |
| New env vars | `server/config.js` + `.env.example` (never commit `.env`) |
| Widget UI | `client/widget.js`, `widget.css` |
| Knowledge base content | `docs/*.md` + `npm run ingest-docs` |
| RAG indexing / vectors | `server/services/ragIndexer.js`, `scripts/ingest-docs.js` |
| Embedding API | `server/services/embeddings.js` |
| pgvector storage | `server/services/ragStore.js`, `scripts/create-rag-chunks-table.sql` |

## Configuration

- **Source of truth:** `.env.example` documents all variables; `server/config.js` validates and exports camelCase `config`.
- **Never read or display** `.env`, API keys, or `DATABASE_URL` values in chat/commits.
- **Production requirements:** explicit `ALLOWED_ORIGINS` (or `API_DOMAIN`), `DATABASE_URL` required.
- **Port:** single `PORT` in `.env`; dev CORS auto-adds `http://localhost:$PORT`.

Key feature flags:

- `RAG_ENABLED`, `RAG_DOCS_PATH`, `RAG_TOP_K`, `RAG_MIN_SCORE` — knowledge base
- `RAG_EMBEDDING_MODEL`, `RAG_EMBEDDING_DIMENSIONS`, `RAG_SYNC_ON_STARTUP` — vector index
- `DATABASE_URL` — required for RAG semantic search (pgvector table `rag_chunks`)
- `SUMMARIZE_ENABLED`, `SUMMARIZE_EVERY_N_TURNS` — history compression
- `FAST_REQUEST_LIMIT` — Cerebras requests before Gemini switch

## RAG (semantic / pgvector)

1. **Ingest** — `npm run ingest-docs` (or `RAG_SYNC_ON_STARTUP=true`) chunks `docs/*.md` by `##` headings, embeds with Gemini `gemini-embedding-001` (768 dims), stores in PostgreSQL `rag_chunks` with pgvector HNSW index.
2. **Retrieve** — on each chat request, embed the user message, cosine-search pgvector, filter by `RAG_MIN_SCORE`, take top `RAG_TOP_K`.
3. **Augment** — `buildRagSystemInstruction` appends matched chunks to the system prompt.

Setup SQL: `scripts/create-rag-chunks-table.sql` (requires `CREATE EXTENSION vector`).

Without `DATABASE_URL`, RAG retrieval is skipped (empty context).

## Coding conventions

- ES modules with `.js` extensions in imports.
- External input validated with Zod at boundaries.
- Provider errors get `statusCode: 502` and optional `upstreamStatus`.
- JSON file stores use simple read/write patterns in `*Store.js` services.
- Tests mock `global.fetch` for LLM calls; use `tests/helpers.js` for chat tests.
- Keep diffs minimal; match existing style (no TypeScript migration unless asked).

## Commands

```bash
npm install
npm start          # production
npm run dev        # nodemon
npm test           # vitest run
npm run ingest-docs  # index docs into pgvector
docker compose up --build
```

## Tests

- `tests/setup.js` — test env defaults, temp data paths under `data/test-*.json`
- `tests/chat.test.js` — integration tests for `/chatbot`
- `tests/summarizer.test.js` — history compression unit tests
- `tests/rag.test.js` — RAG chunking + mocked vector retrieval (`tests/fixtures/rag-docs/`)
- `tests/embeddings.test.js` — Gemini embedding API client
- `tests/rateLimit.test.js` — rate limit behavior

When adding features: unit-test pure logic; integration-test HTTP paths that touch inference.

## Docker

- `Dockerfile` copies `server/`, `client/`, `docs/`
- `data/` volume for usage/routing persistence
- Set `DATABASE_URL` to Postgres on `proxy-network` in production

## Common agent tasks

1. **Add env var** → `server/config.js` schema + export + `.env.example` + README table if user-facing
2. **Change LLM behavior** → `inference.js` first; pass `systemInstruction` override to both providers
3. **Add knowledge** → create/edit `docs/*.md`; run `npm run ingest-docs`
4. **New API route** → `server/routes/`, register in `server/index.js`
5. **Fix rate limit / quota** → middleware + `tests/rateLimit.test.js`

## Out of scope unless requested

- Committing or pushing without explicit user ask
- Reading `.env` or secret values
- Large refactors (TypeScript, new frameworks)
- Replacing pgvector with an external vector DB unless requested

## Related docs

- `README.md` — user-facing setup, API, config tables
- `.env.example` — all environment variables with comments
