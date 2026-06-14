import { vi } from 'vitest';

export function mockGeminiSuccess(reply = 'Hello from Gemini') {
  return vi.spyOn(global, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [
        {
          content: {
            parts: [{ text: reply }],
          },
        },
      ],
    }),
  });
}

export function mockCerebrasSuccess(reply = 'Hello from Cerebras') {
  return vi.spyOn(global, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      model: 'gpt-oss-120b',
      choices: [
        {
          message: {
            role: 'assistant',
            content: reply,
          },
        },
      ],
    }),
  });
}

export function mockInferenceRouting({
  cerebrasReply = 'Hello from Cerebras',
  geminiReply = 'Hello from Gemini',
} = {}) {
  const fastUrl = process.env.FAST_INFERENCE_URL;
  const geminiUrl = process.env.INFERENCE_URL;

  return vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
    if (url === fastUrl) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          model: 'gpt-oss-120b',
          choices: [
            {
              message: {
                role: 'assistant',
                content: cerebrasReply,
              },
            },
          ],
        }),
      };
    }

    if (url === geminiUrl) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: geminiReply }],
              },
            },
          ],
        }),
      };
    }

    throw new Error(`Unexpected fetch URL in test: ${url}`);
  });
}

export function mockGeminiFailure(status = 500, message = 'Gemini unavailable') {
  return vi.spyOn(global, 'fetch').mockResolvedValue({
    ok: false,
    status,
    json: async () => ({
      error: { message },
    }),
  });
}
