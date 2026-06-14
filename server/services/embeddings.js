import { config } from '../config.js';

function extractEmbeddingValues(data) {
  const values = data?.embedding?.values;
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('Gemini embedding API returned an empty vector');
  }
  return values;
}

function extractBatchEmbeddings(data, expectedCount) {
  const embeddings = data?.embeddings;
  if (!Array.isArray(embeddings) || embeddings.length !== expectedCount) {
    throw new Error('Gemini batch embedding API returned an unexpected result');
  }

  return embeddings.map((entry, index) => {
    const values = entry?.values;
    if (!Array.isArray(values) || values.length === 0) {
      throw new Error(`Gemini batch embedding API returned an empty vector at index ${index}`);
    }
    return values;
  });
}

async function postEmbedding(url, body) {
  const response = await fetch(url, {
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
    throw Object.assign(new Error('Invalid response from Gemini embedding API'), {
      statusCode: 502,
    });
  }

  if (!response.ok) {
    const upstreamMessage = data?.error?.message ?? 'Gemini embedding API request failed';
    throw Object.assign(new Error(upstreamMessage), {
      statusCode: 502,
      upstreamStatus: response.status,
    });
  }

  return data;
}

export async function embedText(text) {
  const data = await postEmbedding(config.ragEmbeddingUrl, {
    model: `models/${config.ragEmbeddingModel}`,
    content: {
      parts: [{ text }],
    },
    outputDimensionality: config.ragEmbeddingDimensions,
  });

  return extractEmbeddingValues(data);
}

export async function embedTexts(texts) {
  if (texts.length === 0) {
    return [];
  }

  const allEmbeddings = [];
  const batchSize = config.ragEmbeddingBatchSize;

  for (let index = 0; index < texts.length; index += batchSize) {
    const batch = texts.slice(index, index + batchSize);
    const data = await postEmbedding(config.ragEmbeddingBatchUrl, {
      requests: batch.map((text) => ({
        model: `models/${config.ragEmbeddingModel}`,
        content: {
          parts: [{ text }],
        },
        outputDimensionality: config.ragEmbeddingDimensions,
      })),
    });

    allEmbeddings.push(...extractBatchEmbeddings(data, batch.length));
  }

  return allEmbeddings;
}
