import { syncRagIndex } from '../server/services/ragIndexer.js';
import { ragStore } from '../server/services/ragStore.js';

try {
  const result = await syncRagIndex();
  console.log(`[rag] ingest complete: ${JSON.stringify(result)}`);
} catch (error) {
  console.error('[rag] ingest failed:', error);
  process.exitCode = 1;
} finally {
  await ragStore.end();
}
