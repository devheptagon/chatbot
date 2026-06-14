import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  compressHistory,
  formatTurnsForSummary,
  buildSummaryReplacement,
  SUMMARY_USER_PREFIX,
} from '../server/services/historySummarizer.js';

function makeTurn(role, text) {
  return { role, parts: [{ text }] };
}

function makeHistory(count) {
  return Array.from({ length: count }, (_, index) =>
    makeTurn(index % 2 === 0 ? 'user' : 'model', `message-${index + 1}`),
  );
}

describe('historySummarizer', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('formats turns for summary', () => {
    const formatted = formatTurnsForSummary([
      makeTurn('user', 'Hello'),
      makeTurn('model', 'Hi there'),
    ]);

    expect(formatted).toContain('User: Hello');
    expect(formatted).toContain('Assistant: Hi there');
  });

  it('builds a summary replacement pair', () => {
    const replacement = buildSummaryReplacement('User asked about weather.');

    expect(replacement).toHaveLength(2);
    expect(replacement[0].parts[0].text).toContain(SUMMARY_USER_PREFIX);
    expect(replacement[0].parts[0].text).toContain('User asked about weather.');
  });

  it('does not compress short history', async () => {
    const history = makeHistory(10);
    const fetchSpy = vi.spyOn(global, 'fetch');

    const result = await compressHistory(history);

    expect(result).toEqual(history);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('compresses every five records once history exceeds ten', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: 'User discussed weather in Istanbul and Şanlıurfa.' }],
            },
          },
        ],
      }),
    });

    const history = makeHistory(12);
    const result = await compressHistory(history);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(9);
    expect(result[0].parts[0].text).toContain(SUMMARY_USER_PREFIX);
    expect(result[0].parts[0].text).toContain('Istanbul');
    expect(result[2].parts[0].text).toBe('message-6');
  });

  it('compresses multiple batches when history is long', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: 'Compressed summary.' }],
            },
          },
        ],
      }),
    });

    const history = makeHistory(16);
    const result = await compressHistory(history);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result.length).toBeLessThan(history.length);
    expect(result[0].parts[0].text).toContain(SUMMARY_USER_PREFIX);
  });
});
