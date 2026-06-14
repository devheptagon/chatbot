import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { config } from '../config.js';
import { embedTexts } from './embeddings.js';
import { chunkMarkdown } from './rag.js';
import { ragStore } from './ragStore.js';

async function collectMarkdownFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectMarkdownFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }

  return files;
}

export function buildChunkHash({ source, heading, text }) {
  return crypto
    .createHash('sha256')
    .update(`${source}\n${heading}\n${text}`)
    .digest('hex');
}

export function buildEmbeddingInput({ heading, text }) {
  return `${heading}\n\n${text}`;
}

export async function loadDocumentChunks() {
  const docsPath = path.resolve(config.ragDocsPath);

  let files = [];
  try {
    files = await collectMarkdownFiles(docsPath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const chunks = [];

  for (const filePath of files) {
    const content = await fs.readFile(filePath, 'utf8');
    const source = path.relative(docsPath, filePath);
    const fileChunks = chunkMarkdown(content, source, config.ragMaxChunkChars);

    for (const chunk of fileChunks) {
      chunks.push({
        ...chunk,
        contentHash: buildChunkHash(chunk),
      });
    }
  }

  return chunks;
}

export async function syncRagIndex() {
  if (!config.ragEnabled) {
    return { indexed: 0, skipped: true, reason: 'RAG disabled' };
  }

  if (!config.databaseUrl) {
    console.warn('[rag] DATABASE_URL is not set; skipping vector index sync');
    return { indexed: 0, skipped: true, reason: 'DATABASE_URL missing' };
  }

  const chunks = await loadDocumentChunks();
  const contentHashes = chunks.map((chunk) => chunk.contentHash);

  if (chunks.length === 0) {
    await ragStore.deleteExcept([]);
    return { indexed: 0, deleted: true };
  }

  const embeddings = await embedTexts(
    chunks.map((chunk) => buildEmbeddingInput(chunk)),
  );

  const indexedChunks = chunks.map((chunk, index) => ({
    ...chunk,
    embedding: embeddings[index],
  }));

  await ragStore.upsertChunks(indexedChunks);
  await ragStore.deleteExcept(contentHashes);

  return { indexed: indexedChunks.length };
}
