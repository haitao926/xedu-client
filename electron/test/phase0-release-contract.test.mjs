import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';

const repoRoot = new URL('../../', import.meta.url);
const readRepoFile = (relativePath) => readFile(new URL(relativePath, repoRoot), 'utf8');
const require = createRequire(import.meta.url);
const releaseConfigPath = path.join(new URL('../../', import.meta.url).pathname, 'electron-builder.release.cjs');

function withReleaseEnv(overrides = {}) {
  return {
    ...process.env,
    WIN_CSC_LINK: 'file:///tmp/windows-cert.p12',
    WIN_CSC_KEY_PASSWORD: 'test-password',
    CSC_LINK: 'file:///tmp/mac-cert.p12',
    CSC_KEY_PASSWORD: 'test-password',
    APPLE_ID: 'teacher-release@example.com',
    APPLE_APP_SPECIFIC_PASSWORD: 'app-specific-password',
    APPLE_TEAM_ID: 'ABCDE12345',
    ...overrides,
  };
}

function loadReleaseConfig(envOverrides = {}) {
  const previousEnv = { ...process.env };
  const resolvedPath = require.resolve(releaseConfigPath);
  delete require.cache[resolvedPath];
  Object.assign(process.env, withReleaseEnv(envOverrides));
  try {
    return require(resolvedPath);
  } finally {
    delete require.cache[resolvedPath];
    for (const key of Object.keys(process.env)) {
      if (!(key in previousEnv)) delete process.env[key];
    }
    Object.assign(process.env, previousEnv);
  }
}

const testSigningEnv = {
  WIN_CSC_LINK: 'file:///tmp/windows-cert.p12',
  WIN_CSC_KEY_PASSWORD: 'test-password',
  CSC_LINK: 'file:///tmp/mac-cert.p12',
  CSC_KEY_PASSWORD: 'test-password',
  APPLE_ID: 'teacher-release@example.com',
  APPLE_APP_SPECIFIC_PASSWORD: 'app-specific-password',
  APPLE_TEAM_ID: 'ABCDE12345',
};

async function runNode(args, env = process.env) {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: new URL('../../', import.meta.url),
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}

test('quality gate covers every release-critical stage in order', async () => {
  const source = await readRepoFile('scripts/run_quality_gate.py');
  const expectedStages = [
    'check:python-syntax',
    'backend/tests',
        'electron/test/preload-security.test.mjs',
        'test:student-shell',
        'renderer/js/api.test.mjs',
        'renderer/js/utils/html.test.js',
        'test:resources-inspection',
    'build:scratch',
    'test:scratch',
    'npm", "run", "build"',
    'check:bundle',
  ];
  let previousIndex = -1;
  for (const stage of expectedStages) {
    const index = source.indexOf(stage);
    assert.notEqual(index, -1, `quality gate is missing ${stage}`);
    assert.ok(index > previousIndex, `${stage} is out of order`);
    previousIndex = index;
  }
});

test('official release workflow builds only tagged, signed Windows and macOS artifacts', async () => {
  const workflow = await readRepoFile('.github/workflows/release.yml');

  assert.match(workflow, /push:\s*[\s\S]*tags:\s*[\s\S]*- ['"]v\*['"]/);
  assert.match(workflow, /workflow_dispatch:\s*[\s\S]*inputs:\s*[\s\S]*tag:/);
  assert.match(workflow, /quality-gate:/);
  assert.match(workflow, /source_commit:/);
  assert.match(workflow, /ref: \$\{\{ needs\.quality-gate\.outputs\.source_commit \}\}/);
  assert.match(workflow, /version_pattern=/);
  assert.match(workflow, /-rc\\\.\[0-9\]\+/);
  assert.doesNotMatch(workflow, /v\$\{version\}-rc\.1/);
  assert.match(workflow, /check_release_inputs\.mjs/);
  assert.match(workflow, /Validate protected release credentials/);
  assert.match(workflow, /XEDU_CHECKPOINT_BUNDLE_URL/);
  assert.match(workflow, /XEDU_CHECKPOINT_BUNDLE_SHA256/);
  for (const secret of [
    'WIN_CSC_LINK',
    'WIN_CSC_KEY_PASSWORD',
    'CSC_LINK',
    'CSC_KEY_PASSWORD',
    'APPLE_ID',
    'APPLE_APP_SPECIFIC_PASSWORD',
    'APPLE_TEAM_ID',
  ]) {
    assert.match(workflow, new RegExp(secret));
  }
  assert.match(workflow, /npm audit --audit-level=high --package-lock-only/);
  assert.match(workflow, /npm audit --prefix scratch-editor --audit-level=high --package-lock-only/);
  assert.match(workflow, /release-evidence\/dependency-audit\/scratch-npm\.json/);
  assert.match(workflow, /docs\/release\/2\.0\.0-rc\.4\/SCRATCH_DEPENDENCY_EXCEPTIONS\.json/);
  assert.match(workflow, /Enforce dependency audit gate/);
  assert.match(workflow, /- name: Enforce dependency audit gate\n\s+if: success\(\)/);
  assert.match(workflow, /shopt -s nullglob/);
  assert.match(workflow, /Upload dependency audit evidence/);
  assert.match(workflow, /if: always\(\) && hashFiles\('release-evidence\/dependency-audit\/\*\*'\) != ''/);
  assert.match(workflow, /if-no-files-found: warn/);
  assert.match(workflow, /pip_audit -r backend\/requirements\.txt/);
  assert.match(workflow, /pip_audit -r backend\/requirements_full\.txt/);
  assert.match(workflow, /windows-release:/);
  assert.match(workflow, /runs-on: windows-2022/);
  assert.match(workflow, /WIN_CSC_LINK: \$\{\{ secrets\.WIN_CSC_LINK \}\}/);
  assert.match(workflow, /WIN_CSC_KEY_PASSWORD: \$\{\{ secrets\.WIN_CSC_KEY_PASSWORD \}\}/);
  assert.match(workflow, /macos-release:/);
  assert.match(workflow, /runs-on: macos-14/);
  assert.match(workflow, /CSC_LINK: \$\{\{ secrets\.CSC_LINK \}\}/);
  assert.match(workflow, /APPLE_APP_SPECIFIC_PASSWORD: \$\{\{ secrets\.APPLE_APP_SPECIFIC_PASSWORD \}\}/);
  assert.equal((workflow.match(/npm run quality-gate/g) ?? []).length, 1);
  assert.equal((workflow.match(/npm run electron:build:release/g) ?? []).length, 2);
  assert.match(workflow, /verify_release_artifact\.mjs/);
  assert.match(workflow, /--commit "\$\{\{ needs\.quality-gate\.outputs\.source_commit \}\}"/);
  assert.match(workflow, /signtool verify \/pa \/v/);
  assert.match(workflow, /Get-AuthenticodeSignature/);
  assert.match(workflow, /Include \*\.dll,\*\.exe/);
  assert.match(workflow, /Clean release output/);
  assert.match(workflow, /XEdu Client-2\.0\.0\.dmg/);
  assert.match(workflow, /XEdu Client-2\.0\.0\.zip/);
  assert.match(workflow, /codesign --verify --deep --strict/);
  assert.match(workflow, /spctl --assess --type execute/);
  assert.match(workflow, /xcrun stapler validate/);
  assert.match(workflow, /macos-signing-identity\.txt/);
});

test('quality gate and Python syntax checks use cross-platform Node launchers', async () => {
  const packageJson = await readRepoFile('package.json');
  assert.match(packageJson, /"quality-gate"\s*:\s*"node scripts\/run_quality_gate\.mjs"/);
  assert.match(packageJson, /"check:python-syntax"\s*:\s*"node scripts\/check_python_syntax\.mjs"/);
  assert.match(await readRepoFile('scripts/run_quality_gate.mjs'), /process\.platform === 'win32'/);
  assert.match(await readRepoFile('scripts/check_python_syntax.mjs'), /py_compile/);
});

test('macOS build and CI use the complete release path', async () => {
  const [buildScript, workflow] = await Promise.all([
    readRepoFile('build.sh'),
    readRepoFile('.github/workflows/ci-guard.yml'),
  ]);

  assert.ok(buildScript.indexOf('npm run build:scratch') >= 0);
  assert.ok(buildScript.indexOf('npm run build:scratch') < buildScript.indexOf('npm run build\n'));
  assert.match(workflow, /run:\s*npm run quality-gate/);
});

test('release runtime uses a patched Electron and a usable minimum window', async () => {
  const [packageJson, lockfileText, main] = await Promise.all([
    readRepoFile('package.json'),
    readRepoFile('package-lock.json'),
    readRepoFile('electron/main/main.js'),
  ]);

  assert.match(packageJson, /"electron": "\^39\.8\.5"/);
  const lockfile = JSON.parse(lockfileText);
  const electronVersion = lockfile.packages['node_modules/electron']?.version || '';
  assert.match(electronVersion, /^39\.8\.(?:[5-9]|1\d+)$/);
  assert.match(main, /width: 1200,\s*\n\s*height: 800,\s*\n\s*minWidth: 960,\s*\n\s*minHeight: 600,/);
});

test('backend requirement files share pinned direct dependencies without Flask-CORS', async () => {
  const files = ['backend/requirements.txt', 'backend/requirements_ci.txt', 'backend/requirements_full.txt'];
  const contents = await Promise.all(files.map(readRepoFile));
  const sharedPins = [
    'Flask==3.1.3',
    'requests==2.33.0',
    'python-dotenv==1.2.2',
    'Pillow==12.3.0',
    'psutil==5.9.8',
    'markdown==3.8.1',
    'Pygments==2.20.0',
    'PyYAML==6.0.1',
  ];

  for (const content of contents) {
    assert.doesNotMatch(content, /Flask-CORS/i);
    for (const pin of sharedPins) assert.match(content, new RegExp(`^${pin}$`, 'm'));
  }
});

test('teacher Python profiles stay resolver-safe and pin the model runtime', async () => {
  const [minimal, full] = await Promise.all([
    readRepoFile('backend/requirements.txt'),
    readRepoFile('backend/requirements_full.txt'),
  ]);

  for (const content of [minimal, full]) {
    assert.doesNotMatch(content, /^kimi-agent-sdk(?:[<>=!~].*)?$/m);
    assert.match(content, /^rapidocr-onnxruntime==1\.4\.4$/m);
  }

  assert.match(full, /^protobuf==6\.33\.5$/m);
  assert.match(full, /^onnx==1\.22\.0$/m);
  assert.match(full, /^onnxruntime==1\.27\.0$/m);
  assert.match(full, /^jupyterlab==4\.5\.9$/m);
  assert.match(full, /^jupyter_server==2\.20\.0$/m);
  assert.match(full, /^transformers==5\.5\.0$/m);
  assert.doesNotMatch(full, /^torchaudio==/m);
});

test('packaged Electron app does not expose DevTools in the application menu', async () => {
  const source = await readRepoFile('electron/main/main.js');

  assert.match(
    source,
    /const viewSubmenu = \[\s*\{\s*label: '重新加载'[\s\S]*?\}\s*\];\s*if \(!app\.isPackaged\) \{\s*viewSubmenu\.push\(\{\s*label: '开发者工具'[\s\S]*?accelerator: process\.platform === 'darwin' \? 'Alt\+Cmd\+I' : 'Ctrl\+Shift\+I'/,
    'DevTools menu item should only be added for unpackaged builds so production releases do not ship the shortcut'
  );
  assert.match(
    source,
    /label: '视图',\s*submenu: viewSubmenu/,
    'the View menu should be built from the gated submenu'
  );
});

test('official release script uses a dedicated release config while preserving developer pack', async () => {
  const packageJson = await readRepoFile('package.json');

  assert.match(
    packageJson,
    /"electron:build:release"\s*:\s*"npm run build:scratch && npm run check:scratch-build && npm run build && electron-builder --config electron-builder\.release\.cjs"/,
  );
  assert.match(
    packageJson,
    /"electron:pack"\s*:\s*"npm run build:scratch && npm run check:scratch-build && npm run build && electron-builder --dir"/,
  );
});

test('official release config inherits package build settings and forces signed targets', async () => {
  const releaseConfig = loadReleaseConfig();
  const packageJson = JSON.parse(await readRepoFile('package.json'));

  assert.equal(releaseConfig.appId, packageJson.build.appId);
  assert.deepEqual(releaseConfig.files, packageJson.build.files);
  assert.deepEqual(releaseConfig.extraResources, packageJson.build.extraResources);
  assert.equal(releaseConfig.directories.buildResources, packageJson.build.directories.buildResources);
  assert.equal(releaseConfig.directories.output, 'dist-release');
  assert.equal(releaseConfig.win.forceCodeSigning, true);
  assert.equal(releaseConfig.win.signAndEditExecutable, true);
  assert.equal(releaseConfig.mac.hardenedRuntime, true);
  assert.equal(releaseConfig.mac.entitlements, packageJson.build.mac.entitlements);
  assert.equal(releaseConfig.mac.entitlementsInherit, packageJson.build.mac.entitlementsInherit);
  assert.deepEqual(releaseConfig.mac.target, packageJson.build.mac.target);
});

test('official release config fails closed when signing credentials are missing', async () => {
  const result = await runNode(['-e', "require('./electron-builder.release.cjs')"], {
    ...process.env,
    WIN_CSC_LINK: '',
    WIN_CSC_KEY_PASSWORD: '',
    CSC_LINK: '',
    CSC_KEY_PASSWORD: '',
    APPLE_ID: '',
    APPLE_APP_SPECIFIC_PASSWORD: '',
    APPLE_TEAM_ID: '',
  });

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /electron:build:release/i);
  assert.match(result.stderr, /Missing release signing credentials/i);
  assert.match(result.stderr, /APPLE_ID/);
  assert.doesNotMatch(result.stderr, /WIN_CSC_LINK/);
});

test('official release config validates only the credentials for the target platform', async () => {
  const releaseConfig = loadReleaseConfig();
  const getMissingReleaseEnv = releaseConfig.getMissingReleaseEnv;

  assert.deepEqual(getMissingReleaseEnv(testSigningEnv, 'win32'), []);
  assert.deepEqual(getMissingReleaseEnv(testSigningEnv, 'darwin'), []);
  assert.deepEqual(
    getMissingReleaseEnv({...testSigningEnv, APPLE_ID: ''}, 'win32'),
    [],
  );
  assert.deepEqual(
    getMissingReleaseEnv({...testSigningEnv, WIN_CSC_LINK: ''}, 'darwin'),
    [],
  );
  assert.deepEqual(
    getMissingReleaseEnv({...testSigningEnv, WIN_CSC_LINK: ''}, 'win32'),
    ['WIN_CSC_LINK'],
  );
  assert.deepEqual(
    getMissingReleaseEnv({...testSigningEnv, APPLE_ID: ''}, 'darwin'),
    ['APPLE_ID'],
  );
});
