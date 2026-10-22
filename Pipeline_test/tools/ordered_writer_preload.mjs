// Test-only preload. Never mounted or imported by production deployments.
import { readFile, writeFile, access } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import { createRequire } from 'node:module';
if (!/^p123-core-[a-f0-9]{10}$/.test(process.env.WAVE1D_PROJECT ?? '') || process.env.P123_ORDERED_TEST !== '1') throw Error('Owned offline test project required');
const require = createRequire('/app/backend/package.json');
const { Collection } = require('mongodb');
const original = Collection.prototype.findOneAndUpdate;
Collection.prototype.findOneAndUpdate = async function(filter, update, options) {
  const result = await original.call(this, filter, update, options);
  if (this.collectionName !== 'draft_chapters' || !update?.$set?.content?.startsWith('P1_ORDERED_A_')) return result;
  let config;
  try { config = JSON.parse(await readFile('/tmp/p123-ordered-config.json', 'utf8')); } catch { return result; }
  if (filter.chapterId !== config.chapterId) return result;
  await writeFile('/tmp/p123-ordered-paused', JSON.stringify({ chapterId: filter.chapterId, version: result?.version }));
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try { await access('/tmp/p123-ordered-release'); return result; } catch {}
    await setTimeout(30);
  }
  throw Error('Bounded test barrier expired');
};
