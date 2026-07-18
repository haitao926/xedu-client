import { access } from 'node:fs/promises';
import { constants } from 'node:fs';

const entryPoint = 'scratch-editor/build/index.html';

try {
  await access(entryPoint, constants.R_OK);
  console.log(`Scratch build verified: ${entryPoint}`);
} catch {
  console.error(`Scratch build missing: ${entryPoint}`);
  process.exitCode = 1;
}
