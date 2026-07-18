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
