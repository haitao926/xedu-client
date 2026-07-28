import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import credentialStoreModule from '../main/teacher-credential-store.js';

const { createTeacherCredentialStore } = credentialStoreModule;

function createSafeStorage({ available = true } = {}) {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (value) => Buffer.from(`encrypted:${Buffer.from(value, 'utf8').toString('base64')}`, 'utf8'),
    decryptString: (value) => Buffer.from(String(value).replace(/^encrypted:/, ''), 'base64').toString('utf8'),
  };
}

test('teacher credential store encrypts, loads, and clears a credential', async () => {
  const userDataPath = await mkdtemp(path.join(os.tmpdir(), 'xedu-credential-test-'));
  try {
    const store = createTeacherCredentialStore({
      userDataPath,
      safeStorage: createSafeStorage(),
    });

    assert.deepEqual(store.load(), { success: true, code: '' });
    assert.deepEqual(store.save(' teacher-code '), { success: true });
    assert.deepEqual(store.load(), { success: true, code: 'teacher-code' });

    const stored = await readFile(path.join(userDataPath, 'credentials', 'teacher-code.bin'), 'utf8');
    assert.match(stored, /^encrypted:/);
    assert.doesNotMatch(stored, /teacher-code/);
    assert.deepEqual(store.clear(), { success: true });
    assert.deepEqual(store.load(), { success: true, code: '' });
  } finally {
    await rm(userDataPath, { recursive: true, force: true });
  }
});

test('teacher credential store fails closed when encryption is unavailable', () => {
  const store = createTeacherCredentialStore({
    userDataPath: '/tmp/xedu-credential-test-unavailable',
    safeStorage: createSafeStorage({ available: false }),
  });

  assert.deepEqual(store.load(), { success: false, code: '', error: 'encryption-unavailable' });
  assert.deepEqual(store.save('teacher-code'), { success: false, error: 'encryption-unavailable' });
});

test('electron exposes credential persistence only through trusted named bridges', async () => {
  const [mainSource, preloadSource] = await Promise.all([
    readFile(new URL('../main/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../preload/index.js', import.meta.url), 'utf8'),
  ]);

  assert.match(mainSource, /teacher-credential:load/);
  assert.match(mainSource, /teacher-credential:save/);
  assert.match(mainSource, /teacher-credential:clear/);
  assert.match(mainSource, /safeStorage/);
  assert.match(preloadSource, /loadTeacherCredential/);
  assert.match(preloadSource, /saveTeacherCredential/);
  assert.match(preloadSource, /clearTeacherCredential/);
});
