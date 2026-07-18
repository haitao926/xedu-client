import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const cssUrl = new URL('./main.css', import.meta.url);

test('main stylesheet does not define unused custom properties', async () => {
    const source = await readFile(cssUrl, 'utf8');
    const names = [...source.matchAll(/--([\w-]+)\s*:/g)].map((match) => match[1]);
    const unused = names.filter((name) => !new RegExp(`var\\(--${name}\\b`).test(source));

    assert.deepEqual(unused, []);
});
