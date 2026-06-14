import { config } from '../config.js';

function extractEmbedding(data) {
  const values = data?.data?.[0]?.embedding;
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('Embedding API returned an empty vector');
  }
  return values;
}

function extractBatchEmbeddings(data, expectedCount) {
  const items = data?.data;
  if (!Array.isArray(items) || items.length !== expectedCount) {
    throw new Error('Embedding API returned an unexpected batch result');
  }

  return [...items]
    .sort((left, right) => (left.index ?? 0) - (right.index ?? 0))
    .map((entry, index) => {
      const values = entry?.embedding;
      if (!Array.isArray(values) || values.length === 0) {
        throw new Error(`Embedding API returned an empty vector at index ${index}`);
      }
      return values;
    });
}

function buildHeaders() {
  const headers = {
    'Content-Type': 'application/json',
  };

  if (config.ragEmbeddingApiKey) {
    headers.Authorization = `Bearer ${config.ragEmbeddingApiKey}`;
  }

  return headers;
}

async function postEmbedding(body) {
  const response = await fetch(config.ragEmbeddingUrl, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(body),
  });

  let data;
  try {
    data = await response.json();
  } catch {
    throw Object.assign(new Error('Invalid response from embedding API'), {
      statusCode: 502,
    });
  }

  if (!response.ok) {
    const upstreamMessage =
      data?.error?.message ?? data?.message ?? 'Embedding API request failed';
    throw Object.assign(new Error(upstreamMessage), {
      statusCode: 502,
      upstreamStatus: response.status,
    });
  }

  return data;
}

export async function embedText(text) {
  const data = await postEmbedding({
    model: config.ragEmbeddingModel,
    input: text,
  });

  return extractEmbedding(data);
}

export async function embedTexts(texts) {
  if (texts.length === 0) {
    return [];
  }

  const allEmbeddings = [];
  const batchSize = config.ragEmbeddingBatchSize;

  for (let index = 0; index < texts.length; index += batchSize) {
    const batch = texts.slice(index, index + batchSize);
    const data = await postEmbedding({
      model: config.ragEmbeddingModel,
      input: batch,
    });

    allEmbeddings.push(...extractBatchEmbeddings(data, batch.length));
  }

  return allEmbeddings;
}
