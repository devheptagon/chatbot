import { config } from '../config.js';

function extractReply(data) {
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('Gemini returned an empty response');
  }
  return text.trim();
}

export function buildGeminiContents(message, history = []) {
  const contents = history.map((turn) => ({
    role: turn.role,
    parts: turn.parts.map((part) => ({ text: part.text })),
  }));

  contents.push({
    role: 'user',
    parts: [{ text: message }],
  });

  return contents;
}

export async function generateGeminiReply({ message, history, systemInstruction }) {
  const body = {
    contents: buildGeminiContents(message, history),
    systemInstruction: {
      parts: [{ text: systemInstruction ?? config.systemInstruction }],
    },
    generationConfig: {
      maxOutputTokens: config.geminiMaxOutputTokens,
      temperature: config.geminiTemperature,
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
    throw Object.assign(new Error('Invalid response from Gemini API'), {
      statusCode: 502,
    });
  }

  if (!response.ok) {
    const upstreamMessage =
      data?.error?.message ?? 'Gemini API request failed';
    throw Object.assign(new Error(upstreamMessage), {
      statusCode: 502,
      upstreamStatus: response.status,
    });
  }

  const reply = extractReply(data);
  return {
    reply,
    model: config.geminiModel,
    provider: 'gemini',
    llmUrl: config.inferenceUrl,
  };
}
