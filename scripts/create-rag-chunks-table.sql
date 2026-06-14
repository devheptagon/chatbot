-- Run while connected to the chatbot database.
-- Example: psql -U postgres -d chatbot -f scripts/create-rag-chunks-table.sql

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS rag_chunks (
  id BIGSERIAL PRIMARY KEY,
  source TEXT NOT NULL,
  heading TEXT NOT NULL,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL UNIQUE,
  embedding vector(768) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rag_chunks_source ON rag_chunks (source);

CREATE INDEX IF NOT EXISTS idx_rag_chunks_embedding
  ON rag_chunks
  USING hnsw (embedding vector_cosine_ops);
