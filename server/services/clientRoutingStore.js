import fs from 'fs/promises';
import path from 'path';

async function ensureDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function readStore(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof parsed.clients === 'object' &&
      parsed.clients !== null
    ) {
      return parsed;
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }
  return { clients: {} };
}

async function writeStore(filePath, data) {
  await ensureDir(filePath);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

export function createClientRoutingStore(filePath) {
  let writeChain = Promise.resolve();

  const withLock = (fn) => {
    const run = writeChain.then(fn);
    writeChain = run.catch(() => {});
    return run;
  };

  return {
    async getCount(clientKey) {
      return withLock(async () => {
        const store = await readStore(filePath);
        const count = store.clients[clientKey];
        return typeof count === 'number' ? count : 0;
      });
    },

    async increment(clientKey) {
      return withLock(async () => {
        const store = await readStore(filePath);
        const current =
          typeof store.clients[clientKey] === 'number' ? store.clients[clientKey] : 0;
        store.clients[clientKey] = current + 1;
        await writeStore(filePath, store);
        return store.clients[clientKey];
      });
    },

    async resetForTests() {
      return withLock(async () => {
        await writeStore(filePath, { clients: {} });
      });
    },
  };
}
