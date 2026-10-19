import { isMicroPythonExperiment } from './micropython-launch.js';
import { normalizeStudentWorkspaceTabId } from './student-workspace-utils.js';

export function evidenceExperimentKind({ tabId = 'route', experiment = null, overview = null } = {}) {
    const tab = normalizeStudentWorkspaceTabId(tabId);
    if (tab === 'visual') {
        if (Array.isArray(overview?.scratchFiles) && overview.scratchFiles.length) return 'scratch';
        return experiment ? 'screenshot' : '';
    }
    if (tab === 'python' && !isMicroPythonExperiment(experiment)) {
        return Array.isArray(overview?.notebookFiles) && overview.notebookFiles.length ? 'notebook' : 'screenshot';
    }
    if (tab !== 'route' && experiment) return 'screenshot';
    return '';
}
