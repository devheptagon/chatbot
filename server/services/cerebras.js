import { config } from '../config.js';

function extractReply(data) {
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('Cerebras returned an empty response');
  }
  return text.trim();
}

export function buildCerebrasMessages(message, history = [], systemInstruction) {
  const messages = [{ role: 'system', content: systemInstruction ?? config.systemInstruction }];

  for (const turn of history) {
    messages.push({
      role: turn.role === 'model' ? 'assistant' : turn.role,
      content: turn.parts.map((part) => part.text).join('\n'),
    });
  }

  messages.push({ role: 'user', content: message });
  return messages;
}

export async function generateCerebrasReply({ message, history, systemInstruction }) {
  const body = {
    model: config.fastInferenceModel,
    stream: false,
    messages: buildCerebrasMessages(message, history, systemInstruction),
    temperature: config.geminiTemperature,
    max_completion_tokens: config.geminiMaxOutputTokens,
  };

  const response = await fetch(config.fastInferenceUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.fastInferenceToken}`,
    },
    body: JSON.stringify(body),
  });

  let data;
  try {
    data = await response.json();
  } catch {
    throw Object.assign(new Error('Invalid response from Cerebras API'), {
      statusCode: 502,
    });
  }

  if (!response.ok) {
    const upstreamMessage =
      data?.error?.message ?? data?.message ?? 'Cerebras API request failed';
    throw Object.assign(new Error(upstreamMessage), {
      statusCode: 502,
      upstreamStatus: response.status,
    });
  }

  const reply = extractReply(data);
  return {
    reply,
    model: data?.model ?? config.fastInferenceModel,
    provider: 'cerebras',
    llmUrl: config.fastInferenceUrl,
  };
}
