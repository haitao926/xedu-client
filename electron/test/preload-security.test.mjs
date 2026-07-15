import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const preloadPath = new URL('../preload/index.js', import.meta.url);

test('preload exposes named capabilities instead of a generic IPC invoker', async () => {
  const source = await readFile(preloadPath, 'utf8');

  assert.match(source, /apiRequest:\s*\(request\)\s*=>\s*ipcRenderer\.invoke\('api:request', request\)/);
  assert.doesNotMatch(source, /invoke:\s*\(channel,/);
});
