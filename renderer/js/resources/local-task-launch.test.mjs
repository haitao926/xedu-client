import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { getEntryKindForFile } from './file-utils.js';

const source = readFileSync(new URL('../resources.js', import.meta.url), 'utf8');
const start = source.indexOf('function relativeResourcePath(');
const end = source.indexOf('export async function toggleTeacherMode', start);
const functions = source.slice(start, end).replace('export async function', 'async function');

for (const [path, tab] of [['exp/quiz.html', 'experience'], ['exp/work.ipynb', 'python'], ['exp/turtle.py', 'python'], ['exp/project.sb3', 'visual']]) {
    test(`platform launch opens ${path} in ${tab} workspace with experiment context`, async () => {
        const calls = [];
        const context = vm.createContext({
            resourcesState: {}, getEntryKindForFile,
            normalizeSections: course => course.sections || [],
            getExperimentFileOverview: exp => ({ allFiles: exp.files }),
            studentSaveKind: '', studentSaveResult: null, studentSavePhase: '',
            xeduScoreBridge: { restoreDraft() {}, clearDraft() {} },
            addCourse() {}, notifyUser() {}, syncStudentFocusChrome() {},
            openStudentExperimentPage: async (...args) => { calls.push(args); },
        });
        vm.runInContext(functions, context);
        const exp = { title: '实验', path: 'exp', files: [{ path }] };
        await context.openLaunchedLocalTask({ lab_url: `http://127.0.0.1/${path}`, resource_id: path, course_root: '/cache/course', course: { id: 'course', sections: [{ experiments: [exp] }] } });
        assert.equal(calls[0][0], tab);
        assert.equal(calls[0][1].exp, exp);
        assert.deepEqual(calls[0][1].overview.allFiles, exp.files);
        assert.equal(calls[0][2].path, path);
    });
}

test('unlisted native resource fallback infers its type rather than HTML', async () => {
    const calls = [];
    const context = vm.createContext({
        resourcesState: {}, getEntryKindForFile,
        normalizeSections: course => course.sections || [],
        getExperimentFileOverview: exp => ({ allFiles: exp.files }),
        studentSaveKind: '', studentSaveResult: null, studentSavePhase: '',
        xeduScoreBridge: { restoreDraft() {}, clearDraft() {} },
        addCourse() {}, notifyUser() {}, syncStudentFocusChrome() {},
        openStudentExperimentPage: async (...args) => { calls.push(args); },
    });
    vm.runInContext(functions, context);
    await context.openLaunchedLocalTask({ lab_url: 'http://127.0.0.1/task.py', resource_id: 'task.py', course: { id: 'course' } });
    assert.equal(calls[0][0], 'python');
    assert.equal(getEntryKindForFile(calls[0][2]), 'python');
});

for (const listed of [true, false]) {
    test(`course launch opens the course directory without opening or fabricating an experiment (${listed ? 'listed' : 'unlisted'} resource)`, async () => {
        const calls = [];
        const draft = { name: '保留成绩', score: 80 };
        const course = { id: 'course', sections: [{ experiments: [{ files: [{ path: 'exp/task.py' }] }] }] };
        const context = vm.createContext({
            resourcesState: {}, getEntryKindForFile,
            normalizeSections: value => value.sections || [],
            getExperimentFileOverview: exp => ({ allFiles: exp.files }),
            studentSaveKind: 'score', studentSaveResult: { ok: true }, studentSavePhase: 'saved',
            xeduScoreBridge: { restoreDraft: value => calls.push(['draft', value]), clearDraft: () => calls.push(['clear']) },
            addCourse: (...args) => calls.push(['import', ...args]),
            notifyUser() {}, syncStudentFocusChrome() {},
            window: { app: {
                jupyter: { setVisibility: async value => calls.push(['jupyter', value]) },
                ui: { showTab: (...args) => calls.push(['tab', ...args]) },
            } },
            document: { getElementById: () => null },
            showDetailView: (...args) => calls.push(['detail', ...args]),
            openStudentExperimentPage: async () => calls.push(['experiment']),
        });
        vm.runInContext(functions, context);
        const resourceId = listed ? 'exp/task.py' : 'unlisted.py';
        const payload = { launch_scope: 'course', lab_url: `http://127.0.0.1/${resourceId}`, resource_id: resourceId, course_root: '/cache/course', course, restored_draft: draft, grant_expired: !listed };
        assert.equal(await context.openLaunchedLocalTask(payload), payload);
        assert.equal(calls.some(call => call[0] === 'experiment'), false);
        const imported = calls.find(call => call[0] === 'import')[1];
        assert.deepEqual(imported.sections, course.sections);
        assert.equal(imported.local_path, '/cache/course');
        assert.equal(imported.source, 'local');
        context.selectStudentCurrentCourse = () => null;
        const pickStart = source.indexOf('function pickStudentCurrentCourse(');
        const pickEnd = source.indexOf('function syncStudentLessonNav(', pickStart);
        vm.runInContext(source.slice(pickStart, pickEnd), context);
        assert.equal(context.pickStudentCurrentCourse(), imported, 'platform course survives a refresh without a joined classroom');
        assert.equal(calls.find(call => call[0] === 'draft')[1], draft);
        assert.equal(context.resourcesState.xeduLaunchResourceId, resourceId);
        assert.equal(context.resourcesState.xeduLabFrameUrls[resourceId], payload.lab_url);
        const navigation = calls.filter(call => ['jupyter', 'tab', 'detail'].includes(call[0]));
        assert.deepEqual(navigation.map(call => call[0]), ['jupyter', 'tab', 'detail']);
        assert.equal(navigation[0][1], false);
        assert.equal(navigation[1][1], 'resources');
        assert.equal(navigation[2][1], imported);
        assert.equal(navigation[2][2].tabId, 'route');
        assert.equal(context.studentSavePhase, listed ? 'idle' : 'failed');
        if (!listed) assert.equal(context.studentSaveResult.code, 'grant_expired');
    });
}

test('explicit Scratch launch keeps the granted course when another classroom course is active', async () => {
    const opened = [];
    const targetCourse = { id: 'granted', local_path: '/granted' };
    const context = vm.createContext({
        resourcesState: {},
        pickStudentCurrentCourse: () => ({ id: 'other', local_path: '/other' }),
        getCurrentLessonIndex: () => 0,
        getEntryKindForFile,
        syncStudentLessonNav() {}, syncStudentPageBodyState() {}, syncLessonPageTitle() {},
        window: { app: { jupyter: { setVisibility: async () => {} } } },
        openExperimentEntry: async (...args) => { opened.push(args); },
    });
    const start = source.indexOf('async function openStudentVisualWorkspace(');
    const end = source.indexOf('function appendExperimentTaskList(', start);
    vm.runInContext(source.slice(start, end), context);
    await context.openStudentVisualWorkspace(targetCourse, {
        resource: targetCourse, sectionIndex: 0, expIndex: 0,
        overview: {}, file: { path: 'project.sb3' },
    });
    assert.equal(opened[0][2].resource, targetCourse);
    assert.equal(context.resourcesState.currentResource, targetCourse);
});
