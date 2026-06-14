import { describe, it, expect, beforeEach, vi } from 'vitest';
import { embedText, embedTexts } from '../server/services/embeddings.js';

describe('embeddings', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('embeds a single text via Gemini embedContent', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        embedding: { values: [0.1, 0.2, 0.3] },
      }),
    });

    const vector = await embedText('business hours');

    expect(vector).toEqual([0.1, 0.2, 0.3]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toContain('embedContent');
    expect(fetchSpy.mock.calls[0][1].body).toContain('business hours');
  });

  it('embeds multiple texts via Gemini batchEmbedContents', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        embeddings: [{ values: [0.1] }, { values: [0.2] }],
      }),
    });

    const vectors = await embedTexts(['first', 'second']);

    expect(vectors).toEqual([[0.1], [0.2]]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toContain('batchEmbedContents');
  });
});
