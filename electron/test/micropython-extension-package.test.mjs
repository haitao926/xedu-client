import assert from 'node:assert/strict';
import { access, readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const repoRoot = new URL('../../', import.meta.url);
const readRepoFile = (relativePath) => readFile(new URL(relativePath, repoRoot), 'utf8');

test('ESP32 MicroPython extension is packaged with the backend runtime', async () => {
  const packageJson = JSON.parse(await readRepoFile('package.json'));
  const backendResource = packageJson.build.extraResources.find(({ from }) => from === 'backend');
  assert.ok(backendResource, 'backend must be an electron-builder resource');
  assert.ok(
    backendResource.filter.includes('**/*'),
    'backend resource must include the extension files',
  );

  const [extensionPackage, serverSource, sessionSource] = await Promise.all([
    readRepoFile('backend/jupyterlab_micropython/labextension/package.json'),
    readRepoFile('backend/services/jupyter_micropython_server.py'),
    readRepoFile('backend/services/micropython_session.py'),
  ]);
  const metadata = JSON.parse(extensionPackage);
  assert.equal(metadata.name, 'jupyterlab-micropython');
  assert.equal(metadata.jupyterlab.extension, true);
  assert.deepEqual(
    {
      '@jupyterlab/application': metadata.dependencies['@jupyterlab/application'],
      '@jupyterlab/apputils': metadata.dependencies['@jupyterlab/apputils'],
      '@jupyterlab/coreutils': metadata.dependencies['@jupyterlab/coreutils'],
      '@jupyterlab/launcher': metadata.dependencies['@jupyterlab/launcher'],
      '@lumino/widgets': metadata.dependencies['@lumino/widgets'],
    },
    {
      '@jupyterlab/application': '~4.5.9',
      '@jupyterlab/apputils': '~4.6.9',
      '@jupyterlab/coreutils': '~6.5.9',
      '@jupyterlab/launcher': '~4.5.9',
      '@lumino/widgets': '^2.3.1',
    },
  );
  assert.match(serverSource, /xedu-micropython/);
  assert.match(sessionSource, /class MicroPythonSessionManager/);

  const staticFiles = await readdir(new URL('backend/jupyterlab_micropython/labextension/static/', repoRoot));
  assert.ok(staticFiles.some((name) => /^remoteEntry\..+\.js$/.test(name)));
  assert.ok(staticFiles.some((name) => /^\d+\..+\.js$/.test(name)));
});
