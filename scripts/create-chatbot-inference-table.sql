-- Run the CREATE DATABASE statement while connected to an existing database (e.g. postgres).
CREATE DATABASE chatbot;

-- Connect to the chatbot database before running the table statement below.
-- Example: \c chatbot

CREATE TABLE IF NOT EXISTS inference (
  id BIGSERIAL PRIMARY KEY,
  client_app TEXT,
  llm_url TEXT NOT NULL,
  request_date TIMESTAMPTZ NOT NULL,
  response_date TIMESTAMPTZ NOT NULL,
  inference_input JSONB NOT NULL,
  inference_output JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_inference_request_date ON inference (request_date);
CREATE INDEX IF NOT EXISTS idx_inference_client_app ON inference (client_app);
