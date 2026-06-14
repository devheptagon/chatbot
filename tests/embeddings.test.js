import { describe, it, expect, beforeEach, vi } from 'vitest';
import { embedText, embedTexts } from '../server/services/embeddings.js';

describe('embeddings', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('embeds a single text via external embedding API', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: [{ embedding: [0.1, 0.2, 0.3], index: 0 }],
      }),
    });

    const vector = await embedText('business hours');

    expect(vector).toEqual([0.1, 0.2, 0.3]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toContain('/v1/embeddings');
    expect(fetchSpy.mock.calls[0][1].body).toContain('business hours');
  });

  it('embeds multiple texts in one batch request', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          { embedding: [0.1], index: 0 },
          { embedding: [0.2], index: 1 },
        ],
      }),
    });

    const vectors = await embedTexts(['first', 'second']);

    expect(vectors).toEqual([[0.1], [0.2]]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toContain('/v1/embeddings');
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body).input).toEqual(['first', 'second']);
  });
});
