import assert from 'node:assert/strict';
import test from 'node:test';

import { evidenceExperimentKind } from './xedu-evidence.js';

test('scratch and notebook experiments can submit evidence, micropython cannot', () => {
    assert.equal(evidenceExperimentKind({
        tabId: 'visual',
        overview: { scratchFiles: [{ path: 'lab.sb3' }] },
    }), 'scratch');
    assert.equal(evidenceExperimentKind({
        tabId: 'visual',
        overview: { blocklyFiles: [{ path: 'old.blockly.xml' }] },
    }), '');
    assert.equal(evidenceExperimentKind({
        tabId: 'python',
        experiment: { runtime: '' },
        overview: { notebookFiles: [{ path: 'lab.ipynb' }] },
    }), 'notebook');
    assert.equal(evidenceExperimentKind({
        tabId: 'python',
        experiment: { runtime: 'micropython-esp32' },
        overview: { notebookFiles: [{ path: 'lab.ipynb' }], pythonFiles: [{ path: 'main.py' }] },
    }), '');
    assert.equal(evidenceExperimentKind({
        tabId: 'python',
        overview: { pythonFiles: [{ path: 'main.py' }] },
    }), '');
    assert.equal(evidenceExperimentKind({
        tabId: 'experience',
        overview: { scratchFiles: [{ path: 'lab.sb3' }], htmlFiles: [{ path: 'lab.html' }] },
    }), '');
});
