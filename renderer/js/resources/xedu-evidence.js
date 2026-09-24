import { isMicroPythonExperiment } from './micropython-launch.js';
import { normalizeStudentWorkspaceTabId } from './student-workspace-utils.js';

export function evidenceExperimentKind({ tabId = 'route', experiment = null, overview = null } = {}) {
    const tab = normalizeStudentWorkspaceTabId(tabId);
    if (tab === 'visual') {
        return Array.isArray(overview?.scratchFiles) && overview.scratchFiles.length ? 'scratch' : '';
    }
    if (tab === 'python' && !isMicroPythonExperiment(experiment)) {
        return Array.isArray(overview?.notebookFiles) && overview.notebookFiles.length ? 'notebook' : '';
    }
    return '';
}
