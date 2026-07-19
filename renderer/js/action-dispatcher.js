import { getAppContext } from './app-context.js';
import { loadDocument } from './docs.js';

const ACTIONS = Object.freeze({
    'ui.showTab': (app, element) => app.ui?.showTab?.(element.dataset.actionValue, element),
    'ui.showModal': (app, element) => app.ui?.showModal?.(element.dataset.actionValue),
    'ui.hideModal': (app, element) => app.ui?.hideModal?.(element.dataset.actionValue),
    'docs.loadDocument': (_app, element) => loadDocument(element.dataset.actionValue),
    'jupyter.browseFolder': (app) => app.jupyter?.browseFolder?.(),
    'jupyter.startJupyter': (app) => app.jupyter?.startJupyter?.(),
    'jupyter.restartJupyter': (app) => app.jupyter?.restartJupyter?.(),
    'jupyter.stopJupyter': (app) => app.jupyter?.stopJupyter?.(),
    'jupyter.refreshView': (app) => app.jupyter?.refreshView?.(),
    'jupyter.openExternal': (app) => app.jupyter?.openExternal?.(),
    'jupyter.toggleFullscreen': (app) => app.jupyter?.toggleFullscreen?.(),
    'jupyter.testPythonEnvironment': (app) => app.jupyter?.testPythonEnvironment?.(),
    'workspace.openScratchWorkspace': (app) => app.workspace?.openScratchWorkspace?.({}),
    'resources.openStudentLessonTab': (app, element) => app.resources?.openStudentLessonTab?.(element.dataset.actionValue, element),
    'resources.toggleTeacherMode': (app) => app.resources?.toggleTeacherMode?.(),
    'ai.startNewChat': (app) => app.ai?.startNewChat?.(),
    'ai.selectChat': (app, element) => app.ai?.selectChat?.(Number(element.dataset.actionValue)),
    'ai.clearCurrentChat': (app) => app.ai?.clearCurrentChat?.(),
    'ai.removeImage': (app) => app.ai?.removeImage?.(),
    'ai.askAI': (app) => app.ai?.askAI?.(),
    'ai.handleKeyDown': (app, _element, event) => app.ai?.handleKeyDown?.(event),
    'ai.previewImage': (app, element) => app.ai?.previewImage?.(element),
    'system.showSettingsTab': (app, element) => app.system?.showSettingsTab?.(element.dataset.actionValue),
    'system.installPackage': (app) => app.system?.installPackage?.(),
    'system.updatePackage': (app) => app.system?.updatePackage?.(),
    'system.uninstallPackage': (app) => app.system?.uninstallPackage?.(),
    'system.resetSystemConfig': (app) => app.system?.resetSystemConfig?.(),
    'system.selectPythonEnvironment': (app) => app.system?.selectPythonEnvironment?.(),
    'system.repairXeduEnvironment': (app) => app.system?.repairXeduEnvironment?.(),
    'system.saveSystemConfig': (app) => app.system?.saveSystemConfig?.(),
    'projectWizard.close': (app) => app.projectWizard?.close?.(),
    'projectWizard.browsePath': (app) => app.projectWizard?.browsePath?.(),
    'projectWizard.prevStep': (app) => app.projectWizard?.prevStep?.(),
    'projectWizard.nextStep': (app) => app.projectWizard?.nextStep?.(),
    'projectWizard.finish': (app) => app.projectWizard?.finish?.(),
});

function dispatchAction(element, event) {
    const action = ACTIONS[element.dataset.action];
    if (!action) {
        console.warn(`忽略未知界面操作: ${element.dataset.action}`);
        return;
    }

    try {
        Promise.resolve(action(getAppContext(), element, event)).catch((error) => {
            console.error(`界面操作失败: ${element.dataset.action}`, error);
        });
    } catch (error) {
        console.error(`界面操作失败: ${element.dataset.action}`, error);
    }
}

export function registerActionDelegation(root = document) {
    if (!root || root.__xeduActionDelegationRegistered) return;
    root.__xeduActionDelegationRegistered = true;
    root.addEventListener('click', (event) => {
        const element = event.target?.closest?.('[data-action]');
        if (!element || element.dataset.actionEvent && element.dataset.actionEvent !== event.type || element.disabled) return;
        event.preventDefault();
        dispatchAction(element, event);
    });
    ['keydown', 'change'].forEach((eventName) => {
        root.addEventListener(eventName, (event) => {
            const element = event.target?.closest?.('[data-action]');
            if (!element || element.dataset.actionEvent !== event.type || element.disabled) return;
            dispatchAction(element, event);
        });
    });
}

registerActionDelegation();
