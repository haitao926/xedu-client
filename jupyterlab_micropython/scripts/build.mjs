import { execFileSync } from 'node:child_process';
import { cpSync, copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = dirname(fileURLToPath(import.meta.url));
const extensionRoot = dirname(packageRoot);
const repoRoot = dirname(extensionRoot);
const readJSON = (path) => JSON.parse(readFileSync(path, 'utf8'));

// Read the actual release input, not whichever JupyterLab happens to be on PATH.
// Reading static metadata also permits inspecting a Windows runtime on macOS.
export function resolveBuildCore({
  repoRoot: root = repoRoot,
  platform = process.platform,
  env = process.env,
  execPython = (executable) => execFileSync(executable, [
    '-c',
    'import json, pathlib, jupyterlab; print(json.dumps({"version": jupyterlab.__version__, "corePath": str(pathlib.Path(jupyterlab.__file__).parent / "static")}))',
  ], { encoding: 'utf8' }),
} = {}) {
  const runtimeRoot = join(root, platform === 'win32' ? 'python_env_win_minimal' : 'python_env_minimal');
  const sitePackages = platform === 'win32'
    ? [join(runtimeRoot, 'Lib', 'site-packages')]
    : readdirSync(join(runtimeRoot, 'lib'))
      .filter((name) => /^python\d+\.\d+$/.test(name))
      .map((name) => join(runtimeRoot, 'lib', name, 'site-packages'));
  if (sitePackages.length !== 1) {
    throw new Error(`Expected one shipped Python site-packages in ${runtimeRoot}`);
  }
  const shippedCorePath = join(sitePackages[0], 'jupyterlab', 'static');
  const shippedMetadata = readJSON(join(shippedCorePath, 'package.json'));
  const runtimeVersion = shippedMetadata.version;
  const selected = env.XEDU_PYTHON_EXECUTABLE
    ? JSON.parse(execPython(env.XEDU_PYTHON_EXECUTABLE))
    : { version: runtimeVersion, corePath: shippedCorePath };
  if (selected.version !== runtimeVersion) {
    throw new Error(`Selected JupyterLab ${selected.version} does not match shipped runtime ${runtimeVersion}`);
  }
  const metadata = readJSON(join(selected.corePath, 'package.json'));
  if (metadata.version !== runtimeVersion ||
      JSON.stringify(metadata.resolutions) !== JSON.stringify(shippedMetadata.resolutions) ||
      JSON.stringify(metadata.dependencies) !== JSON.stringify(shippedMetadata.dependencies)) {
    throw new Error(`Selected core metadata does not match shipped JupyterLab ${runtimeVersion}`);
  }
  return { ...selected, runtimeVersion, metadata };
}

export function buildExtension() {
  const { corePath, version } = resolveBuildCore();
  console.log(`Building MicroPython extension against shipped JupyterLab ${version}: ${corePath}`);

  mkdirSync(join(extensionRoot, 'lib'), { recursive: true });
  copyFileSync(join(extensionRoot, 'src', 'index.js'), join(extensionRoot, 'lib', 'index.js'));
  copyFileSync(join(extensionRoot, 'src', 'panel-logic.js'), join(extensionRoot, 'lib', 'panel-logic.js'));
  execFileSync(
    join(extensionRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'build-labextension.cmd' : 'build-labextension'),
    ['.', '--core-path', corePath],
    { cwd: extensionRoot, stdio: 'inherit' },
  );
  const builtExtension = join(extensionRoot, 'jupyterlab_micropython', 'jupyterlab-micropython');
  const builtPackagePath = join(builtExtension, 'package.json');
  const builtMetadata = readJSON(builtPackagePath);
  builtMetadata.jupyterlab._build.xeduCoreVersion = version;
  writeFileSync(builtPackagePath, `${JSON.stringify(builtMetadata, null, 2)}\n`);
  const packagedExtension = join(dirname(extensionRoot), 'backend', 'jupyterlab_micropython', 'jupyterlab-micropython');
  mkdirSync(dirname(packagedExtension), { recursive: true });
  rmSync(packagedExtension, { recursive: true, force: true });
  rmSync(join(dirname(packagedExtension), 'labextension'), { recursive: true, force: true });
  cpSync(builtExtension, packagedExtension, { recursive: true });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildExtension();
}
