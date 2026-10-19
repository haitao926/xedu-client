import assert from 'node:assert/strict';
import test from 'node:test';
import { getExperimentFileOverview } from './experiment-overview.js';

test('experiment overview prioritizes Scratch and preserves legacy Blockly as unsupported metadata', () => {
    const overview = getExperimentFileOverview({
        files: [
            { path: 'guide.md' },
            { path: 'legacy.blockly.xml' },
            { path: 'lesson.sb3' },
            { path: 'main.ipynb' },
        ],
    });

    assert.equal(overview.primaryEntry.kind, 'scratch');
    assert.equal(overview.primaryScratchFile.path, 'lesson.sb3');
    assert.equal(overview.primaryBlocklyFile.path, 'legacy.blockly.xml');
    assert.deepEqual(overview.notebookFiles.map((file) => file.path), ['main.ipynb']);
});

test('experiment overview prefers the declared HTML entry even when file order differs', () => {
    const overview = getExperimentFileOverview({
        entry_file: 'lesson/exp/start.html',
        files: [
            { path: 'lesson/exp/appendix.html' },
            { path: 'lesson/exp/start.html' },
        ],
    });

    assert.equal(overview.primaryEntry.file.path, 'lesson/exp/start.html');
});

test('experiment overview includes an explicit HTML entry missing from the file manifest', () => {
    const overview = getExperimentFileOverview({
        entry_file: 'lesson/exp/start.html',
        files: [],
    });

    assert.deepEqual(overview.htmlFiles.map((file) => file.path), ['lesson/exp/start.html']);
    assert.equal(overview.primaryEntry.file.path, 'lesson/exp/start.html');
});

test('relative entry matches a unique course-relative manifest path', () => {
    const overview = getExperimentFileOverview({
        entry_file: 'start.html',
        files: [{ path: 'lesson/exp/help.html' }, { path: 'lesson/exp/start.html' }],
    });
    assert.equal(overview.htmlFiles[0].path, 'lesson/exp/start.html');
    assert.equal(overview.htmlFiles.length, 2);
});
