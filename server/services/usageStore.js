import fs from 'fs/promises';
import path from 'path';

function getUtcDateKey() {
  return new Date().toISOString().slice(0, 10);
}

async function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
}

async function readStore(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof parsed.date === 'string' &&
      typeof parsed.count === 'number'
    ) {
      return parsed;
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }
  return { date: getUtcDateKey(), count: 0 };
}

async function writeStore(filePath, data) {
  await ensureDir(filePath);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

export function createUsageStore(filePath) {
  let writeChain = Promise.resolve();

  const withLock = (fn) => {
    const run = writeChain.then(fn);
    writeChain = run.catch(() => {});
    return run;
  };

  return {
    async getTodayCount() {
      return withLock(async () => {
        const store = await readStore(filePath);
        const today = getUtcDateKey();
        if (store.date !== today) {
          return 0;
        }
        return store.count;
      });
    },

    async reserveCall(limit) {
      return withLock(async () => {
        const store = await readStore(filePath);
        const today = getUtcDateKey();
        const current =
          store.date === today ? store.count : 0;

        if (current >= limit) {
          return { allowed: false, count: current, limit };
        }

        const next = { date: today, count: current + 1 };
        await writeStore(filePath, next);
        return { allowed: true, count: next.count, limit };
      });
    },

    async resetForTests() {
      return withLock(async () => {
        await writeStore(filePath, { date: getUtcDateKey(), count: 0 });
      });
    },
  };
}
