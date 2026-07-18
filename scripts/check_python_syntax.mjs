import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const pythonRoots = [
  'backend/backend_main.py',
  'backend/api',
  'backend/services',
  'backend/runtime',
  'backend/models',
  'backend/utils',
];

async function collectPythonFiles(relativePath, result = []) {
  const absolutePath = path.resolve(relativePath);
  if (absolutePath.endsWith('.py')) {
    result.push(absolutePath);
    return result;
  }

  const entries = await readdir(absolutePath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '__pycache__') continue;
    const childPath = path.join(relativePath, entry.name);
    if (entry.isDirectory()) {
      await collectPythonFiles(childPath, result);
    } else if (entry.isFile() && entry.name.endsWith('.py')) {
      result.push(path.resolve(childPath));
    }
  }
  return result;
}

const files = (await Promise.all(pythonRoots.map((root) => collectPythonFiles(root))))
  .flat()
  .sort();

const pythonCommands = process.platform === 'win32'
  ? ['python', 'py']
  : ['python3', 'python'];

for (const command of pythonCommands) {
  const result = spawnSync(command, ['-m', 'py_compile', ...files], {
    stdio: 'inherit',
    shell: false,
  });
  if (result.error?.code === 'ENOENT') continue;
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
  process.exit();
}

console.error(`Python interpreter not found. Tried: ${pythonCommands.join(', ')}`);
process.exitCode = 1;
