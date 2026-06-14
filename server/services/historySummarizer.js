import { config } from '../config.js';

const SUMMARY_USER_PREFIX = '[Earlier conversation summary]';
const SUMMARY_MODEL_ACK = 'Understood. I will use this context.';

function formatTurnsForSummary(turns) {
  return turns
    .map((turn) => {
      const text = turn.parts.map((part) => part.text).join('\n');
      const speaker = turn.role === 'model' ? 'Assistant' : 'User';
      return `${speaker}: ${text}`;
    })
    .join('\n');
}

function buildSummaryReplacement(summaryText) {
  return [
    {
      role: 'user',
      parts: [{ text: `${SUMMARY_USER_PREFIX}\n${summaryText}` }],
    },
    {
      role: 'model',
      parts: [{ text: SUMMARY_MODEL_ACK }],
    },
  ];
}

async function summarizeTurns(turns) {
  const transcript = formatTurnsForSummary(turns);
  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `Summarize the following conversation concisely. Preserve key facts, names, places, languages used, and user preferences. Use the same language as the conversation when possible.\n\n${transcript}`,
          },
        ],
      },
    ],
    generationConfig: {
      maxOutputTokens: config.summarizeMaxOutputTokens,
      temperature: 0.2,
    },
  };

  const response = await fetch(config.inferenceUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': config.inferenceToken,
    },
    body: JSON.stringify(body),
  });

  let data;
  try {
    data = await response.json();
  } catch {
    throw Object.assign(new Error('Invalid response from Gemini summary API'), {
      statusCode: 502,
    });
  }

  if (!response.ok) {
    const upstreamMessage = data?.error?.message ?? 'Gemini summary request failed';
    throw Object.assign(new Error(upstreamMessage), {
      statusCode: 502,
      upstreamStatus: response.status,
    });
  }

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('Gemini returned an empty summary');
  }

  return text.trim();
}

export async function compressHistory(history = []) {
  if (!config.summarizeEnabled || history.length <= config.summarizeEveryNTurns * 2) {
    return history;
  }

  let compressed = [...history];
  const batchSize = config.summarizeEveryNTurns;
  const minLengthToCompress = batchSize * 2;

  while (compressed.length > minLengthToCompress) {
    const chunk = compressed.slice(0, batchSize);
    const summaryText = await summarizeTurns(chunk);
    compressed = [...buildSummaryReplacement(summaryText), ...compressed.slice(batchSize)];
  }

  return compressed;
}

export {
  formatTurnsForSummary,
  buildSummaryReplacement,
  summarizeTurns,
  SUMMARY_USER_PREFIX,
  SUMMARY_MODEL_ACK,
};
