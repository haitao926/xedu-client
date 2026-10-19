import assert from 'node:assert/strict';
import { access, readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import { resolveBuildCore } from '../../jupyterlab_micropython/scripts/build.mjs';
import { fileURLToPath } from 'node:url';

const repoRoot = new URL('../../', import.meta.url);
const readRepoFile = (relativePath) => readFile(new URL(relativePath, repoRoot), 'utf8');

test('published federation consumes shared versions compatible with the shipped JupyterLab', async () => {
  const core = resolveBuildCore({ repoRoot: fileURLToPath(repoRoot), env: {} });
  const metadata = JSON.parse(await readRepoFile('backend/jupyterlab_micropython/jupyterlab-micropython/package.json'));
  const remote = await readRepoFile(`backend/jupyterlab_micropython/jupyterlab-micropython/${metadata.jupyterlab._build.load}`);
  for (const name of ['launcher', 'coreutils', 'apputils']) {
    const key = `@jupyterlab/${name}`;
    const version = core.metadata.resolutions[key].replace(/^[~^]/, '');
    // Webpack serializes a caret range as [1, major, minor, patch]. Check
    // the actual remoteEntry, not merely the extension's dependencies.
    assert.ok(remote.includes(`"${key}",!1,[1,${version.split('.').join(',')}]`),
      `${key} must consume ^${version} from the shipped core, not the developer's 4.6.1 core`);
  }
  assert.equal(metadata.jupyterlab._build.xeduCoreVersion, core.runtimeVersion);
});

test('ESP32 MicroPython extension is packaged with the backend runtime', async () => {
  const packageJson = JSON.parse(await readRepoFile('package.json'));
  const backendResource = packageJson.build.extraResources.find(({ from }) => from === 'backend');
  assert.ok(backendResource, 'backend must be an electron-builder resource');
  assert.ok(
    backendResource.filter.includes('**/*'),
    'backend resource must include the extension files',
  );

  const [extensionPackage, serverSource, sessionSource] = await Promise.all([
    readRepoFile('backend/jupyterlab_micropython/jupyterlab-micropython/package.json'),
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

  const staticFiles = await readdir(new URL('backend/jupyterlab_micropython/jupyterlab-micropython/static/', repoRoot));
  assert.ok(staticFiles.some((name) => /^remoteEntry\..+\.js$/.test(name)));
  assert.ok(staticFiles.some((name) => /^\d+\..+\.js$/.test(name)));
});
