const DEFAULT_INTERVAL_MS = 500;
const sessions = new WeakMap();
const {requestXEduApi} = require('./api-request');

class StageSensingSession {
    constructor (runtime, options = {}) {
        this.runtime = runtime || {};
        this.options = options;
        this.intervalMs = options.intervalMs || DEFAULT_INTERVAL_MS;
        this.autoRefresh = options.autoRefresh !== false;
        this.tasks = new Map();
        this.timer = null;
    }

    enable (taskId) {
        const task = this._task(taskId);
        task.enabled = true;
        this._video()?.enableVideo?.();
        return this.refresh(taskId, true);
    }

    refresh (taskId, force = false) {
        const task = this._task(taskId);
        if (!task.enabled || task.inFlight) return task.inFlight || Promise.resolve(task.payload);
        if (!force && Date.now() - task.lastSampleAt < this.intervalMs) return Promise.resolve(task.payload);
        task.lastSampleAt = Date.now();
        task.inFlight = this._captureFrame()
            .then(frame => {
                task.frameSize = {width: frame.width || 0, height: frame.height || 0};
                return this._request(taskId, frame.dataUrl);
            })
            .then(payload => {
                task.payload = payload?.success === false ? null : payload;
                task.ready = Boolean(task.payload);
                task.error = payload?.success === false ? String(payload.message || '感知失败') : '';
                return task.payload;
            })
            .catch(error => {
                task.ready = false;
                task.error = error?.message || '感知请求失败';
                return null;
            })
            .finally(() => {
                task.inFlight = null;
                this._schedule();
            });
        return task.inFlight;
    }

    isReady (taskId) { return Boolean(this._task(taskId).ready); }
    result (taskId) { return this._task(taskId).payload; }
    frameSize (taskId) { return this._task(taskId).frameSize || {width: 0, height: 0}; }

    setPreviewVisible (visible) { this._video()?.setPreviewGhost?.(visible ? 0 : 100); }

    setPreviewTransparency (value) {
        this._video()?.setPreviewGhost?.(Math.max(0, Math.min(100, Number(value) || 0)));
    }

    disableCamera () {
        this._video()?.disableVideo?.();
        for (const task of this.tasks.values()) task.enabled = false;
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
    }

    _task (taskId) {
        if (!this.tasks.has(taskId)) this.tasks.set(taskId, {enabled: false, ready: false, payload: null, error: '', inFlight: null, lastSampleAt: 0, frameSize: {width: 0, height: 0}});
        return this.tasks.get(taskId);
    }

    _video () { return this.runtime?.ioDevices?.video; }

    _schedule () {
        if (!this.autoRefresh || this.timer || ![...this.tasks.values()].some(task => task.enabled)) return;
        this.timer = setTimeout(() => {
            this.timer = null;
            for (const [taskId, task] of this.tasks) if (task.enabled) this.refresh(taskId);
        }, this.intervalMs);
        this.timer.unref?.();
    }

    async _captureFrame () {
        const frame = this.options.getFrame ? await this.options.getFrame() : this._video()?.getFrame?.({format: 'image-data'});
        if (typeof frame === 'string' && frame.startsWith('data:image/')) return {dataUrl: frame, width: 0, height: 0};
        if (!frame?.data || !frame.width || !frame.height || typeof document === 'undefined') throw new Error('未取得摄像头画面');
        const canvas = document.createElement('canvas');
        canvas.width = frame.width;
        canvas.height = frame.height;
        const context = canvas.getContext('2d');
        context.putImageData(frame, 0, 0);
        return {dataUrl: canvas.toDataURL('image/png'), width: frame.width, height: frame.height};
    }

    async _request (taskId, frame) {
        if (this.options.request) return this.options.request(taskId, frame);
        const apiBase = (this.options.apiBase?.() || 'http://127.0.0.1:5123').replace(/\/$/, '');
        const response = await requestXEduApi(`${apiBase}/api/resources/xeduhub/execute`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({code: '', project_root: this.options.projectRoot?.() || '', spec: {task_id: taskId, input: frame}}),
        });
        return response.json();
    }
}

function getStageSensingSession (runtime, options) {
    if (!runtime || (typeof runtime !== 'object' && typeof runtime !== 'function')) return new StageSensingSession(runtime, options);
    if (!sessions.has(runtime)) sessions.set(runtime, new StageSensingSession(runtime, options));
    return sessions.get(runtime);
}

module.exports = {StageSensingSession, getStageSensingSession};
