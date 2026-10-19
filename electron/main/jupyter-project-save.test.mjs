import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { setImmediate } from 'node:timers/promises';
import vm from 'node:vm';
import test from 'node:test';

const require = createRequire(import.meta.url);
const moduleUrl = new URL('./jupyter-project-save.js', import.meta.url);

function executeExport(window, ...args) {
    assert.ok(existsSync(moduleUrl), 'The current-document export module must exist');
    const { saveCurrentJupyterProject } = require('./jupyter-project-save.js');
    assert.equal(typeof saveCurrentJupyterProject, 'function');
    const sandbox = vm.createContext({ window, TextEncoder, Object, args });
    return vm.runInContext(`(${saveCurrentJupyterProject.toString()})(...args)`, sandbox);
}

function makeDocument(path = 'course/current.ipynb') {
    const events = [];
    const notebook = {
        cells: [{ cell_type: 'code', source: ['print("dirty")'], outputs: [] }],
        metadata: {}, nbformat: 4, nbformat_minor: 5,
    };
    const context = {
        path,
        ready: Promise.resolve(),
        model: {
            dirty: true,
            toJSON() {
                events.push('toJSON');
                return notebook;
            },
            toString() {
                events.push('toString');
                return 'print("dirty")\n';
            },
        },
        async save() {
            events.push('save');
            this.model.dirty = false;
        },
    };
    const window = { jupyterapp: { shell: { currentWidget: { context } } } };
    return { window, context, events, notebook };
}

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

test('serialized export saves the dirty active notebook and returns its UTF-8 model', async () => {
    const document = makeDocument('course/lesson/\u5b66\u751f.ipynb');
    document.notebook.cells[0].source = ['print("\u4f60\u597d")'];
    document.window.jupyterapp.shell.widgets = [{ context: { path: 'other.ipynb' } }];

    const result = await executeExport(document.window);

    assert.equal(result.filename, '\u5b66\u751f.ipynb');
    assert.equal(result.mime, 'application/x-ipynb+json');
    assert.ok(Array.isArray(result.bytes));
    assert.deepEqual(Array.from(result.bytes), Array.from(Buffer.from(JSON.stringify(document.notebook))));
    assert.equal(document.context.model.dirty, false);
    assert.deepEqual(document.events, ['save', 'toJSON']);
    assert.deepEqual(Object.keys(result).sort(), ['bytes', 'filename', 'mime']);
});

test('export waits for readiness and save completion before reading the model', async () => {
    const document = makeDocument();
    const ready = deferred();
    const saved = deferred();
    document.context.ready = ready.promise;
    document.context.save = async () => {
        document.events.push('save');
        await saved.promise;
        document.notebook.metadata.saved = true;
        document.events.push('saved');
    };

    const exported = executeExport(document.window);
    await setImmediate();
    assert.deepEqual(document.events, []);
    ready.resolve();
    await setImmediate();
    assert.deepEqual(document.events, ['save']);
    saved.resolve();
    const result = await exported;

    assert.deepEqual(document.events, ['save', 'saved', 'toJSON']);
    assert.equal(JSON.parse(Buffer.from(result.bytes).toString('utf8')).metadata.saved, true);
});

test('export saves the active Python editor using its text model', async () => {
    const document = makeDocument('course/scripts/solution.py');
    const source = '# \u5b66\u751f\nprint("\u4f60\u597d")\n';
    document.context.model.toString = () => {
        document.events.push('toString');
        return source;
    };

    const result = await executeExport(document.window);

    assert.equal(result.filename, 'solution.py');
    assert.equal(result.mime, 'text/x-python');
    assert.equal(Buffer.from(result.bytes).toString('utf8'), source);
    assert.equal(document.context.model.dirty, false);
    assert.deepEqual(document.events, ['save', 'toString']);
});

test('export retains the captured document when another tab becomes active', async () => {
    const document = makeDocument();
    const ready = deferred();
    document.context.ready = ready.promise;
    const exported = executeExport(document.window);
    document.window.jupyterapp.shell.currentWidget = makeDocument('other.py').window.jupyterapp.shell.currentWidget;
    ready.resolve();

    const result = await exported;

    assert.equal(result.filename, 'current.ipynb');
    assert.deepEqual(document.events, ['save', 'toJSON']);
});

test('export uses the actual basename after a rename while saving', async () => {
    const document = makeDocument();
    document.context.save = async () => {
        document.context.path = 'renamed/final.ipynb';
    };

    assert.equal((await executeExport(document.window)).filename, 'final.ipynb');
});

for (const [name, window] of [
    ['missing exposed application', {}],
    ['missing shell', { jupyterapp: {} }],
    ['missing active widget', { jupyterapp: { shell: {} } }],
    ['active launcher without a context', { jupyterapp: { shell: { currentWidget: {} } } }],
]) {
    test(`export rejects ${name}`, async () => {
        await assert.rejects(async () => executeExport(window), /Jupyter|current|context/i);
    });
}

for (const path of ['', 'course/notes.txt', 'course/worksheet.ipynb.bak', 'course/']) {
    test(`export rejects unsupported current path ${JSON.stringify(path)} without saving`, async () => {
        const document = makeDocument(path);
        await assert.rejects(async () => executeExport(document.window), /ipynb|python|supported|path/i);
        assert.deepEqual(document.events, []);
    });
}

test('readiness failures propagate without saving or exporting', async () => {
    const document = makeDocument();
    const ready = deferred();
    document.context.ready = ready.promise;
    const exported = executeExport(document.window);
    const rejected = assert.rejects(exported, /document failed to load/);
    ready.reject(new Error('document failed to load'));
    await rejected;
    assert.deepEqual(document.events, []);
});

test('save failures propagate without exporting stale content', async () => {
    const document = makeDocument();
    document.context.save = async () => {
        document.events.push('save');
        throw new Error('disk full');
    };

    await assert.rejects(async () => executeExport(document.window), /disk full/);
    assert.deepEqual(document.events, ['save']);
});

test('serialization failures propagate after saving', async () => {
    const document = makeDocument();
    document.context.model.toJSON = () => { throw new Error('invalid notebook model'); };
    await assert.rejects(async () => executeExport(document.window), /invalid notebook model/);
    assert.deepEqual(document.events, ['save']);
});

test('export rejects a context without a save method', async () => {
    const document = makeDocument();
    delete document.context.save;
    await assert.rejects(async () => executeExport(document.window), /save|context/i);
});

test('export rejects a notebook without a JSON serializer', async () => {
    const document = makeDocument();
    delete document.context.model.toJSON;
    await assert.rejects(async () => executeExport(document.window), /model|serializ|notebook/i);
});

test('export rejects a Python editor without a text serializer', async () => {
    const document = makeDocument('current.py');
    document.context.model = {};
    await assert.rejects(async () => executeExport(document.window), /model|serializ|python/i);
});

test('export rejects a document that changes to an unsupported type while saving', async () => {
    const document = makeDocument();
    document.context.save = async () => { document.context.path = 'renamed.txt'; };
    await assert.rejects(async () => executeExport(document.window), /ipynb|python|supported|path/i);
    assert.deepEqual(document.events, []);
});
