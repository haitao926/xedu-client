import { rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const extensionRoot = dirname(dirname(fileURLToPath(import.meta.url)));
await Promise.all([
  rm(join(extensionRoot, 'lib'), { recursive: true, force: true }),
  rm(join(extensionRoot, 'jupyterlab_micropython', 'labextension'), { recursive: true, force: true }),
]);
