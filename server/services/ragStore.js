import pg from 'pg';
import { config } from '../config.js';

const { Pool } = pg;

function formatVector(values) {
  return `[${values.join(',')}]`;
}

export function createRagStore(databaseUrl) {
  if (!databaseUrl) {
    return {
      async upsertChunks() {},
      async deleteExcept() {},
      async searchSimilar() {
        return [];
      },
      async count() {
        return 0;
      },
      async end() {},
    };
  }

  const pool = new Pool({ connectionString: databaseUrl });

  return {
    async upsertChunks(chunks) {
      if (chunks.length === 0) {
        return;
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        for (const chunk of chunks) {
          await client.query(
            `INSERT INTO rag_chunks (
              source,
              heading,
              content,
              content_hash,
              embedding
            ) VALUES ($1, $2, $3, $4, $5::vector)
            ON CONFLICT (content_hash) DO UPDATE SET
              source = EXCLUDED.source,
              heading = EXCLUDED.heading,
              content = EXCLUDED.content,
              embedding = EXCLUDED.embedding,
              updated_at = NOW()`,
            [
              chunk.source,
              chunk.heading,
              chunk.text,
              chunk.contentHash,
              formatVector(chunk.embedding),
            ],
          );
        }

        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },

    async deleteExcept(contentHashes) {
      if (contentHashes.length === 0) {
        await pool.query('DELETE FROM rag_chunks');
        return;
      }

      await pool.query(
        'DELETE FROM rag_chunks WHERE NOT (content_hash = ANY($1::text[]))',
        [contentHashes],
      );
    },

    async searchSimilar({ embedding, topK, minScore }) {
      const result = await pool.query(
        `SELECT
          source,
          heading,
          content,
          1 - (embedding <=> $1::vector) AS similarity
        FROM rag_chunks
        WHERE 1 - (embedding <=> $1::vector) >= $2
        ORDER BY embedding <=> $1::vector
        LIMIT $3`,
        [formatVector(embedding), minScore, topK],
      );

      return result.rows.map((row) => ({
        source: row.source,
        heading: row.heading,
        text: row.content,
        similarity: Number(row.similarity),
      }));
    },

    async count() {
      const result = await pool.query('SELECT COUNT(*)::int AS count FROM rag_chunks');
      return result.rows[0]?.count ?? 0;
    },

    async end() {
      await pool.end();
    },
  };
}

export const ragStore = createRagStore(config.databaseUrl);
