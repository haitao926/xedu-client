const learningProgressKey = 'xedu_learning_progress_v1';

function loadLearningProgressMap() {
    try {
        const raw = localStorage.getItem(learningProgressKey);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
            return parsed;
        }
    } catch (error) {
        console.warn('读取学习进度失败:', error);
    }
    return {};
}

function saveLearningProgressMap(map) {
    try {
        localStorage.setItem(learningProgressKey, JSON.stringify(map || {}));
    } catch (error) {
        console.warn('保存学习进度失败:', error);
    }
}

function getCourseProgress(resource) {
    const courseId = (resource?.id || '').toString().trim();
    if (!courseId) return null;
    const map = loadLearningProgressMap();
    const progress = map[courseId];
    if (!progress || typeof progress !== 'object') return null;
    return progress;
}

export function getExperimentProgress(resource, sectionIndex, expIndex) {
    const progress = getCourseProgress(resource);
    if (!progress || !progress.experiments || typeof progress.experiments !== 'object') {
        return '';
    }
    const key = `${sectionIndex}:${expIndex}`;
    const status = (progress.experiments[key] || '').toString();
    return status === 'done' || status === 'in_progress' ? status : '';
}

export function setExperimentProgress(resource, sectionIndex, expIndex, status = 'in_progress') {
    const courseId = (resource?.id || '').toString().trim();
    if (!courseId) return;
    const map = loadLearningProgressMap();
    const progress = map[courseId] && typeof map[courseId] === 'object' ? map[courseId] : {};
    const experiments = progress.experiments && typeof progress.experiments === 'object' ? progress.experiments : {};
    const key = `${sectionIndex}:${expIndex}`;
    if (status === 'done' || status === 'in_progress') {
        experiments[key] = status;
    } else {
        delete experiments[key];
    }
    progress.experiments = experiments;
    progress.last_section_index = sectionIndex;
    progress.last_experiment_index = expIndex;
    progress.updated_at = new Date().toISOString();
    map[courseId] = progress;
    saveLearningProgressMap(map);
}

export function getLastLearning(resource) {
    const progress = getCourseProgress(resource);
    if (!progress) return null;
    const sectionIndex = Number(progress.last_section_index);
    const expIndex = Number(progress.last_experiment_index);
    if (Number.isNaN(sectionIndex) || Number.isNaN(expIndex)) return null;
    return { sectionIndex, expIndex };
}

export function buildExperimentStateKey(resource, sectionIndex, expIndex) {
    const courseId = (resource?.id || '').toString().trim();
    if (!courseId) return '';
    return `${courseId}:${sectionIndex}:${expIndex}`;
}
