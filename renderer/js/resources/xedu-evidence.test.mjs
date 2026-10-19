import assert from 'node:assert/strict';
import test from 'node:test';

import { evidenceExperimentKind } from './xedu-evidence.js';

test('scratch and notebook experiments use project submissions while other concrete tabs use screenshots', () => {
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
    }), 'screenshot');
    assert.equal(evidenceExperimentKind({
        tabId: 'python',
        experiment: { runtime: '' },
        overview: { pythonFiles: [{ path: 'main.py' }] },
    }), 'screenshot');
    assert.equal(evidenceExperimentKind({
        tabId: 'experience',
        experiment: { title: 'HTML task' },
        overview: { scratchFiles: [{ path: 'lab.sb3' }], htmlFiles: [{ path: 'lab.html' }] },
    }), 'screenshot');
});

test('concrete non-project experiment tabs use screenshot submission', () => {
    for (const tabId of ['experience', 'python']) {
        assert.equal(evidenceExperimentKind({
            tabId,
            experiment: { runtime: tabId === 'python' ? 'micropython-esp32' : '' },
            overview: { htmlFiles: [{ path: 'index.html' }] },
        }), 'screenshot');
    }
    assert.equal(evidenceExperimentKind({ tabId: 'route', experiment: { title: 'ordinary page' } }), '');
});
