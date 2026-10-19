import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { getExperimentFileOverview } from './experiment-overview.js';
import { normalizeFile, isDirectory, isHtmlFile } from './file-utils.js';
import { pickFirstExperimentWithFiles, getStudentWorkspaceFilesForOverview } from './student-workspace-utils.js';

const source = readFileSync(new URL('../resources.js', import.meta.url), 'utf8');
function load(extra = {}) {
    const context = vm.createContext({
        getExperimentFileOverview, normalizeFile, isDirectory, isHtmlFile,
        console, resourcesState: {},
        getExperimentStudentTasks: () => [],
        getSectionLearningObjectives: () => [], getSectionKeyPoints: () => [], getSectionDifficulties: () => [],
        ...extra,
    });
    const start = source.indexOf('function normalizeSections(');
    const end = source.indexOf('function isRemotePath(', start);
    vm.runInContext(source.slice(start, end), context);
    return context;
}

test('local directory scan supplements incomplete manifests without mixing experiments or persisting metadata', async () => {
    const requests = [];
    const resource = { local_path: '/courses/demo', sections: [{ experiments: [
        { path: 'lesson/one', files: [{ path: 'lesson/one/notes.txt' }] },
        { path: 'lesson/two', files: [] },
    ] }] };
    const original = JSON.stringify(resource);
    const context = load({ apiClient: { post: async (...args) => {
        requests.push(args);
        return { success: true, files: [
            { path: 'lesson/one/demo.html' },
            { path: 'lesson/two/help.html' }, { path: 'lesson/two/index.html' },
            { path: 'other/index.html' },
        ] };
    } } });
    await context.prepareStudentHtmlFiles(resource);
    await context.prepareStudentHtmlFiles(resource);
    const experiments = context.normalizeSections(resource)[0].experiments;
    assert.equal(getExperimentFileOverview(experiments[0]).htmlFiles[0]?.path, 'lesson/one/demo.html');
    assert.equal(getExperimentFileOverview(experiments[1]).htmlFiles[0]?.path, 'lesson/two/index.html');
    assert.equal(JSON.stringify(resource), original);
    assert.equal(requests.length, 1);
    assert.equal(requests[0][0], '/api/resources/scan-folder');
});

test('ambiguous HTML files are not guessed and remote courses are not scanned', async () => {
    const context = load({ apiClient: { post: async () => ({ success: true, files: [
        { path: 'exp/a.html' }, { path: 'exp/b.html' },
    ] }) } });
    const course = { local_path: '/course', sections: [{ experiments: [{ path: 'exp', files: [] }] }] };
    await context.prepareStudentHtmlFiles(course);
    assert.equal(getExperimentFileOverview(context.normalizeSections(course)[0].experiments[0]).htmlFiles.length, 0);
    await context.prepareStudentHtmlFiles({ sections: [] });
});

test('current experiment entry wins over the first experiment in the lesson', () => {
    const resource = { sections: [{ experiments: [
        { files: [{ path: 'first.html' }] },
        { path: 'second', entry_file: 'start.html', files: [] },
    ] }] };
    const context = load({
        resourcesState: { activeExperimentIndex: 1 },
        getCurrentLessonIndex: () => 0, pickFirstExperimentWithFiles,
        getWorkspaceFilesForOverview: getStudentWorkspaceFilesForOverview,
    });
    const start = source.indexOf('function findFirstExperimentWithWorkspaceFiles(');
    const end = source.indexOf('function pickExperimentIndexForWorkspaceTab(', start);
    vm.runInContext(source.slice(start, end), context);
    const target = context.findFirstExperimentWithWorkspaceFiles(resource, 'experience');
    assert.equal(target.expIndex, 1);
    assert.equal(target.file.path, 'second/start.html');
});

test('a recognizable local index supplements a manifest containing only an auxiliary HTML page', async () => {
    const context = load({ apiClient: { post: async () => ({ success: true, files: [
        { path: 'exp/help.html' }, { path: 'exp/index.html' },
    ] }) } });
    const resource = { local_path: '/course', sections: [{ experiments: [
        { path: 'exp', files: [{ path: 'exp/help.html' }] },
    ] }] };
    await context.prepareStudentHtmlFiles(resource);
    const exp = context.normalizeSections(resource)[0].experiments[0];
    assert.equal(getExperimentFileOverview(exp).htmlFiles[0].path, 'exp/index.html');
});


function loadStudentExperimentPage(extra = {}) {
    const state = { notices: [], selections: [], opens: [], cleared: 0, shown: [] };
    const context = vm.createContext({
        console,
        resourcesState: { teacherMode: { unlocked: false }, xeduActivityTasks: [], ...(extra.resourcesState || {}) },
        normalizeWorkspaceTabId: value => value,
        prepareStudentHtmlFiles: async () => {},
        syncStudentPageBodyState() {},
        syncLessonPageTitle() {},
        getWorkspaceFilesForOverview: (overview, tabId) => {
            if (tabId === 'python') return overview.pythonWorkspaceFiles || [];
            if (tabId === 'visual') return overview.visualWorkspaceFiles || [];
            return overview.allFiles || [];
        },
        relativeResourcePath: value => String(value || '').replace(/\\/g, '/').replace(/^\/+/, ''),
        notifyUser: (...args) => { state.notices.push(args); },
        xeduScoreBridge: { clearDraft() { state.cleared += 1; } },
        openStudentPythonWorkspace: async (...args) => { state.opens.push(args); return args[1]?.file || null; },
        openStudentVisualWorkspace: async (...args) => { state.opens.push(args); return args[1]?.file || null; },
        shouldHideJupyterForStudentTab: () => false,
        showDetailView: (...args) => { state.shown.push(args); },
        isStudentLessonMode: () => true,
        window: {
            electronAPI: {
                xeduSelectLocalTask: async (payload) => {
                    state.selections.push(payload);
                    return { ok: true };
                },
            },
            app: {
                jupyter: { setVisibility: async () => {} },
                ui: { showTab() {} },
            },
        },
        document: { getElementById: () => null },
        ...extra,
    });
    const start = source.indexOf('async function openStudentExperimentPage(');
    const end = source.indexOf('function makeStudentRouteButton(', start);
    vm.runInContext(source.slice(start, end), context);
    return { context, state };
}

test('normalizeSections preserves stable experiment ids for platform task matching', () => {
    const context = load();
    const exp = context.normalizeSections({ sections: [{ experiments: [{ id: 'mqtt-peer-temperature', files: [] }] }] })[0].experiments[0];
    assert.equal(exp.id, 'mqtt-peer-temperature');
});

test('python companion file reuses the same experiment primary activity task', async () => {
    const { context, state } = loadStudentExperimentPage({
        resourcesState: {
            xeduActivityTasks: [{ activity_id: 'act-1', resource_id: 'lesson1/mqtt-peer-exchange.html' }],
        },
    });
    const exp = { id: 'mqtt-peer-temperature', path: 'lesson1', entry_file: 'mqtt-peer-exchange.html' };
    const overview = {
        htmlFiles: [{ path: 'lesson1/mqtt-peer-exchange.html' }],
        primaryEntry: { kind: 'html', file: { path: 'lesson1/mqtt-peer-exchange.html' } },
        pythonWorkspaceFiles: [{ path: 'lesson1/peer_exchange.py' }],
    };
    await context.openStudentExperimentPage('python', {
        resource: { id: 'course-1' },
        sectionIndex: 0,
        expIndex: 0,
        exp,
        overview,
    }, { path: 'lesson1/peer_exchange.py' });
    assert.equal(state.selections.length, 1);
    assert.equal(state.selections[0].activity_id, 'act-1');
    assert.equal(state.selections[0].resource_id, 'lesson1/mqtt-peer-exchange.html');
    assert.equal(state.notices.length, 0);
    assert.equal(state.cleared, 1);
    assert.equal(state.opens[0][1].file.path, 'lesson1/peer_exchange.py');
});

test('python experiment can match a uniquely tagged activity task by experiment_id', async () => {
    const { context, state } = loadStudentExperimentPage({
        resourcesState: {
            xeduActivityTasks: [
                { activity_id: 'act-2', resource_id: 'lesson1/mqtt-peer-exchange.html', experiment_id: 'mqtt-peer-temperature' },
                { activity_id: 'act-3', resource_id: 'lesson1/other.py', experiment_id: 'other-experiment' },
            ],
        },
    });
    await context.openStudentExperimentPage('python', {
        resource: { id: 'course-1' },
        sectionIndex: 0,
        expIndex: 0,
        exp: { id: 'mqtt-peer-temperature', path: 'lesson1' },
        overview: { pythonWorkspaceFiles: [{ path: 'lesson1/peer_exchange.py' }] },
    }, { path: 'lesson1/peer_exchange.py' });
    assert.equal(state.selections.length, 1);
    assert.equal(state.selections[0].activity_id, 'act-2');
    assert.equal(state.selections[0].resource_id, 'lesson1/mqtt-peer-exchange.html');
    assert.equal(state.notices.length, 0);
});

test('truly unbound python experiment still warns instead of selecting a task', async () => {
    const { context, state } = loadStudentExperimentPage({
        resourcesState: { xeduActivityTasks: [] },
    });
    await context.openStudentExperimentPage('python', {
        resource: { id: 'course-1' },
        sectionIndex: 0,
        expIndex: 0,
        exp: { id: 'mqtt-peer-temperature', path: 'lesson1' },
        overview: { pythonWorkspaceFiles: [{ path: 'lesson1/peer_exchange.py' }] },
    }, { path: 'lesson1/peer_exchange.py' });
    assert.deepEqual(state.selections, []);
    assert.deepEqual(state.notices, [['本实验尚未绑定到平台活动，请先让老师完成活动绑定。', 'warning']]);
    assert.equal(state.opens.length, 0);
});

test('HTML view uses a neutral title and honors entry_file ahead of a stale platform launch', () => {
    const elements = [];
    const createElement = (tag) => {
        const node = { tag, children: [], classList: { toggle() {}, contains: () => false },
            appendChild(child) { this.children.push(child); }, setAttribute() {}, addEventListener() {} };
        elements.push(node);
        return node;
    };
    const context = vm.createContext({
        document: { createElement, addEventListener() {}, body: {} },
        window: { dispatchEvent() {} }, Event: class {},
        MutationObserver: class { observe() {} },
        resourcesState: { xeduLaunchResourceId: 'exp/old.html' },
        relativeResourcePath: value => value,
        getExperimentFileOverview,
        buildLocalCourseFileUrl: (_course, path) => `http://localhost/${path}`,
        apiClient: {}, courseAiFrameBridge: { attach() {} }, xeduScoreBridge: { attach() {} },
        withAsyncActionErrorBoundary: action => action,
    });
    const start = source.indexOf('function buildStudentHtmlExperienceView(');
    const end = source.indexOf('function invalidateStudentNavigation(', start);
    vm.runInContext(source.slice(start, end), context);
    const exp = { title: '实验目标', path: 'exp', entry_file: 'start.html', files: [{ path: 'exp/old.html' }] };
    context.buildStudentHtmlExperienceView({ resource: { title: '课程名' }, exp, overview: getExperimentFileOverview(exp) });
    assert.equal(elements.find(node => node.tag === 'iframe').src, 'http://localhost/exp/start.html');
    assert.equal(elements.find(node => node.className === 'resources-student-html-experience-title').textContent, '互动体验');
    assert.equal(elements.find(node => node.tag === 'iframe').title, '互动体验');
});
