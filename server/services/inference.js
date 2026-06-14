import { config } from '../config.js';
import { createClientRoutingStore } from './clientRoutingStore.js';
import { inferenceLogStore } from './inferenceLogStore.js';
import { compressHistory } from './historySummarizer.js';
import { generateCerebrasReply } from './cerebras.js';
import { generateGeminiReply } from './gemini.js';
import { buildRagSystemInstruction, retrieveContext } from './rag.js';

const clientRoutingStore = createClientRoutingStore(config.clientRoutingStorePath);

export async function generateChatReply({ message, history, clientKey, clientApp }) {
  const completedRequests = await clientRoutingStore.getCount(clientKey);
  const useFastProvider = completedRequests < config.fastRequestLimit;
  const requestDate = new Date();
  const historyForLlm = await compressHistory(history);
  const contextChunks = await retrieveContext(message);
  const systemInstruction = buildRagSystemInstruction(
    config.systemInstruction,
    contextChunks,
  );

  const result = useFastProvider
    ? await generateCerebrasReply({ message, history: historyForLlm, systemInstruction })
    : await generateGeminiReply({ message, history: historyForLlm, systemInstruction });

  const responseDate = new Date();

  await inferenceLogStore.logInference({
    clientApp,
    llmUrl: result.llmUrl,
    requestDate,
    responseDate,
    inferenceInput: { message, history },
    inferenceOutput: {
      reply: result.reply,
      model: result.model,
      provider: result.provider,
    },
  });

  console.log(
    `[chatbot] LLM call: provider=${result.provider} model=${result.model} client=${clientKey}`,
  );

  await clientRoutingStore.increment(clientKey);

  return {
    reply: result.reply,
    model: result.model,
    provider: result.provider,
  };
}

export { clientRoutingStore };
