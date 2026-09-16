import { execFileSync } from 'node:child_process';
import { cpSync, copyFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = dirname(fileURLToPath(import.meta.url));
const extensionRoot = dirname(packageRoot);
const pythonExecutable = process.env.XEDU_PYTHON_EXECUTABLE || process.env.PYTHON || 'python3';
const corePath = execFileSync(
  pythonExecutable,
  ['-c', 'import pathlib, jupyterlab; print(pathlib.Path(jupyterlab.__file__).parent / "static")'],
  { encoding: 'utf8' },
).trim();

mkdirSync(join(extensionRoot, 'lib'), { recursive: true });
for (const fileName of readdirSync(join(extensionRoot, 'src'))) {
  if (!fileName.endsWith('.js') || fileName.includes('.test.')) continue;
  copyFileSync(join(extensionRoot, 'src', fileName), join(extensionRoot, 'lib', fileName));
}
execFileSync(
  join(extensionRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'build-labextension.cmd' : 'build-labextension'),
  ['.', '--core-path', corePath],
  { cwd: extensionRoot, stdio: 'inherit' },
);
const builtExtension = join(extensionRoot, 'jupyterlab_micropython', 'labextension');
const packagedExtension = join(dirname(extensionRoot), 'backend', 'jupyterlab_micropython', 'labextension');
mkdirSync(dirname(packagedExtension), { recursive: true });
rmSync(packagedExtension, { recursive: true, force: true });
cpSync(builtExtension, packagedExtension, { recursive: true });
