import { config } from '../config.js';
import { embedText } from './embeddings.js';
import { ragStore } from './ragStore.js';

export function chunkMarkdown(content, source, maxChunkChars) {
  const sections = content.split(/\n(?=#{1,3} )/).filter((section) => section.trim());
  const chunks = [];

  for (const section of sections) {
    const lines = section.split('\n');
    const headingLine = lines[0]?.match(/^#{1,3} (.+)/);
    const heading = headingLine?.[1]?.trim() ?? 'Introduction';
    const body = (headingLine ? lines.slice(1) : lines).join('\n').trim();

    if (!body) {
      continue;
    }

    if (body.length <= maxChunkChars) {
      chunks.push({ source, heading, text: body });
      continue;
    }

    const paragraphs = body.split(/\n\n+/).filter((paragraph) => paragraph.trim());
    let buffer = '';

    for (const paragraph of paragraphs) {
      const next = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
      if (next.length > maxChunkChars && buffer) {
        chunks.push({ source, heading, text: buffer });
        buffer = paragraph;
      } else {
        buffer = next;
      }
    }

    if (buffer) {
      chunks.push({ source, heading, text: buffer });
    }
  }

  return chunks;
}

export async function retrieveContext(query) {
  if (!config.ragEnabled) {
    return [];
  }

  if (!config.databaseUrl) {
    if (config.nodeEnv !== 'test') {
      console.warn('[rag] DATABASE_URL is not set; skipping semantic retrieval');
    }
    return [];
  }

  const queryEmbedding = await embedText(query);
  const matches = await ragStore.searchSimilar({
    embedding: queryEmbedding,
    topK: config.ragTopK,
    minScore: config.ragMinScore,
  });

  return matches.map(({ source, heading, text }) => ({
    source,
    heading,
    text,
  }));
}

export function buildRagSystemInstruction(baseInstruction, contextChunks) {
  if (!contextChunks.length) {
    return baseInstruction;
  }

  const contextBlocks = contextChunks
    .map(
      (chunk) =>
        `[${chunk.source} > ${chunk.heading}]\n${chunk.text}`,
    )
    .join('\n\n---\n\n');

  return `${baseInstruction}

Use the knowledge base below to answer questions when it is relevant. Prefer these sources over general knowledge. If the answer is not covered, say you do not have that information in the knowledge base.

${contextBlocks}`;
}
