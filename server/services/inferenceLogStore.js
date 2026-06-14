import pg from 'pg';
import { config } from '../config.js';

const { Pool } = pg;

export function createInferenceLogStore(databaseUrl) {
  if (!databaseUrl) {
    return {
      async logInference() {},
    };
  }

  const pool = new Pool({ connectionString: databaseUrl });

  return {
    async logInference({
      clientApp,
      llmUrl,
      requestDate,
      responseDate,
      inferenceInput,
      inferenceOutput,
    }) {
      await pool.query(
        `INSERT INTO inference (
          client_app,
          llm_url,
          request_date,
          response_date,
          inference_input,
          inference_output
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          clientApp ?? null,
          llmUrl,
          requestDate,
          responseDate,
          inferenceInput,
          inferenceOutput,
        ],
      );
    },

    async end() {
      await pool.end();
    },
  };
}

export const inferenceLogStore = createInferenceLogStore(config.databaseUrl);
