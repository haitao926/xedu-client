import { spawnSync } from 'node:child_process';
import process from 'node:process';

const pythonCommands = process.platform === 'win32'
  ? ['python', 'py']
  : ['python3', 'python'];

for (const command of pythonCommands) {
  const result = spawnSync(command, ['scripts/run_quality_gate.py', ...process.argv.slice(2)], {
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
