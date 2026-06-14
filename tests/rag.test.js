import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../server/config.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    config: {
      ...actual.config,
      databaseUrl: 'postgres://test:test@127.0.0.1:5432/chatbot',
      ragEnabled: true,
    },
  };
});

vi.mock('../server/services/embeddings.js', () => ({
  embedText: vi.fn(),
}));

vi.mock('../server/services/ragStore.js', () => ({
  ragStore: {
    searchSimilar: vi.fn(),
  },
}));

import { embedText } from '../server/services/embeddings.js';
import { ragStore } from '../server/services/ragStore.js';
import {
  chunkMarkdown,
  retrieveContext,
  buildRagSystemInstruction,
} from '../server/services/rag.js';
import {
  buildChunkHash,
  buildEmbeddingInput,
  loadDocumentChunks,
} from '../server/services/ragIndexer.js';

describe('rag', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('chunks markdown by headings', () => {
    const content = `# Company

## Business hours

Open 9 to 5.

## Contact

Email support@example.com`;

    const chunks = chunkMarkdown(content, 'company.md', 1200);

    expect(chunks).toHaveLength(2);
    expect(chunks[0].heading).toBe('Business hours');
    expect(chunks[0].text).toContain('Open 9 to 5');
    expect(chunks[1].heading).toBe('Contact');
  });

  it('builds stable chunk hashes', () => {
    const hash = buildChunkHash({
      source: 'company.md',
      heading: 'Business hours',
      text: 'Open 9 to 5.',
    });

    expect(hash).toHaveLength(64);
    expect(hash).toBe(
      buildChunkHash({
        source: 'company.md',
        heading: 'Business hours',
        text: 'Open 9 to 5.',
      }),
    );
  });

  it('builds embedding input from heading and body', () => {
    expect(
      buildEmbeddingInput({
        heading: 'Business hours',
        text: 'Open 9 to 5.',
      }),
    ).toBe('Business hours\n\nOpen 9 to 5.');
  });

  it('loads markdown chunks from the configured docs path', async () => {
    const chunks = await loadDocumentChunks();

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]).toMatchObject({
      source: 'company.md',
      heading: expect.any(String),
      text: expect.any(String),
      contentHash: expect.any(String),
    });
  });

  it('retrieves semantic matches from the vector store', async () => {
    embedText.mockResolvedValue([0.1, 0.2, 0.3]);
    ragStore.searchSimilar.mockResolvedValue([
      {
        source: 'company.md',
        heading: 'Business hours',
        text: 'Monday through Friday, 9:00 AM to 5:00 PM',
        similarity: 0.82,
      },
    ]);

    const chunks = await retrieveContext('When are you open?');

    expect(embedText).toHaveBeenCalledWith('When are you open?');
    expect(ragStore.searchSimilar).toHaveBeenCalledWith({
      embedding: [0.1, 0.2, 0.3],
      topK: expect.any(Number),
      minScore: expect.any(Number),
    });
    expect(chunks).toEqual([
      {
        source: 'company.md',
        heading: 'Business hours',
        text: 'Monday through Friday, 9:00 AM to 5:00 PM',
      },
    ]);
  });

  it('returns no context when the vector store has no matches', async () => {
    embedText.mockResolvedValue([0.1, 0.2, 0.3]);
    ragStore.searchSimilar.mockResolvedValue([]);

    const chunks = await retrieveContext('quantum entanglement in superconductors');

    expect(chunks).toEqual([]);
  });

  it('builds an augmented system instruction with retrieved context', () => {
    const instruction = buildRagSystemInstruction('You are helpful.', [
      { source: 'company.md', heading: 'Business hours', text: 'Open 9 to 5.' },
    ]);

    expect(instruction).toContain('You are helpful.');
    expect(instruction).toContain('[company.md > Business hours]');
    expect(instruction).toContain('Open 9 to 5.');
    expect(instruction).toContain('knowledge base');
  });
});
