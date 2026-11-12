import assert from 'node:assert/strict';
import test from 'node:test';

import { evidenceExperimentKind } from './xedu-evidence.js';

test('Scratch, Notebook, Python and MicroPython experiments submit project files', () => {
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
    }), 'notebook');
    assert.equal(evidenceExperimentKind({
        tabId: 'python',
        experiment: { runtime: '' },
        overview: { pythonFiles: [{ path: 'main.py' }] },
    }), 'notebook');
    assert.equal(evidenceExperimentKind({
        tabId: 'experience',
        experiment: { title: 'HTML task' },
        overview: { scratchFiles: [{ path: 'lab.sb3' }], htmlFiles: [{ path: 'lab.html' }] },
    }), 'screenshot');
});

test('MicroPython submits its created main.py even when no Python file existed at launch', () => {
    assert.equal(evidenceExperimentKind({
        tabId: 'python',
        experiment: { runtime: 'micropython-esp32' },
        overview: {},
    }), 'notebook');
});

test('concrete non-project experiment tabs use screenshot submission', () => {
    for (const tabId of ['experience', 'python']) {
        assert.equal(evidenceExperimentKind({
            tabId,
            experiment: { runtime: '' },
            overview: { htmlFiles: [{ path: 'index.html' }] },
        }), 'screenshot');
    }
    assert.equal(evidenceExperimentKind({ tabId: 'route', experiment: { title: 'ordinary page' } }), '');
});
