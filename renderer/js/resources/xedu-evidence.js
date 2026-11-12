import { isMicroPythonExperiment } from './micropython-launch.js';
import { normalizeStudentWorkspaceTabId } from './student-workspace-utils.js';

export function evidenceExperimentKind({ tabId = 'route', experiment = null, overview = null } = {}) {
    const tab = normalizeStudentWorkspaceTabId(tabId);
    if (tab === 'visual') {
        if (Array.isArray(overview?.scratchFiles) && overview.scratchFiles.length) return 'scratch';
        return experiment ? 'screenshot' : '';
    }
    if (tab === 'python') {
        const hasProject = isMicroPythonExperiment(experiment)
            || (Array.isArray(overview?.notebookFiles) && overview.notebookFiles.length > 0)
            || (Array.isArray(overview?.pythonFiles) && overview.pythonFiles.length > 0);
        return hasProject ? 'notebook' : 'screenshot';
    }
    if (tab !== 'route' && experiment) return 'screenshot';
    return '';
}
