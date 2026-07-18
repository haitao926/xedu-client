import assert from 'node:assert/strict';
import test from 'node:test';
import {
    getEntryKindForFile,
    isBlocklyFile,
    isDirectory,
    isScratchFile,
    normalizeFile,
    sortFiles,
} from './file-utils.js';

test('file utility normalizes nested files and preserves legacy Blockly detection', () => {
    const normalized = normalizeFile({
        name: 'lesson',
        type: 'folder',
        children: [{ path: 'main.sb3' }, { path: 'legacy.blockly.xml' }],
    });

    assert.equal(isDirectory(normalized), true);
    assert.equal(isScratchFile(normalized.children[0]), true);
    assert.equal(isBlocklyFile(normalized.children[1]), true);
    assert.equal(getEntryKindForFile(normalized.children[0]), 'scratch');
    assert.equal(getEntryKindForFile(normalized.children[1]), 'blockly');
});

test('file utility sorts supported entries before generic files without mutating input', () => {
    const files = [
        { path: 'notes.txt' },
        { path: 'lesson.ipynb' },
        { path: 'experience.html' },
        { path: 'project.sb3' },
    ];

    assert.deepEqual(sortFiles(files).map((file) => file.path), [
        'experience.html',
        'project.sb3',
        'lesson.ipynb',
        'notes.txt',
    ]);
    assert.equal(files[0].path, 'notes.txt');
});
