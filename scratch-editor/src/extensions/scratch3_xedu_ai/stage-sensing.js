const DEFAULT_INTERVAL_MS = 500;
const STAGE_WIDTH = 480;
const STAGE_HEIGHT = 360;
const OVERLAY_LAYER = 'video';
const OVERLAY_STYLES = Object.freeze({
    pose_body17: {fill: '#4F46E5', stroke: '#FFFFFF', radius: 5},
    pose_face106: {fill: '#F43F5E', stroke: '#FFFFFF', radius: 2.5},
    pose_hand21: {fill: '#D97706', stroke: '#FFFFFF', radius: 4},
});
const sessions = new WeakMap();
const {requestXEduApi} = require('./api-request');

function pointXY(point) {
    if (Array.isArray(point)) {
        const x = Number(point[0]);
        const y = Number(point[1]);
        return Number.isFinite(x) && Number.isFinite(y) ? {x, y} : null;
    }
    if (!point || typeof point !== 'object') return null;
    const x = Number(point.x);
    const y = Number(point.y);
    return Number.isFinite(x) && Number.isFinite(y) ? {x, y} : null;
}

function extractPointSets(payload) {
    const output = payload?.result?.output ?? payload?.output ?? payload?.result ?? null;
    if (!output || typeof output !== 'object') return [];
    const rawPoints = output['关键点坐标'] ?? output['关键点'] ?? output.keypoints ?? output.points;
    if (!Array.isArray(rawPoints) || !rawPoints.length) return [];
    if (pointXY(rawPoints[0])) return [rawPoints];
    return rawPoints.filter(Array.isArray).filter(group => group.some(point => pointXY(point)));
}

class KeypointOverlay {
    constructor (runtime) {
        this.runtime = runtime || {};
        this.canvas = null;
        this.context = null;
        this.skinId = -1;
        this.drawableId = -1;
    }

    draw (entries) {
        if (!Array.isArray(entries) || !entries.length) {
            this.clear();
            return;
        }
        if (!this._ensureResources()) return;
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
        let hasPoints = false;
        for (const entry of entries) {
            const style = OVERLAY_STYLES[entry.taskId];
            if (!style) continue;
            const pointSets = extractPointSets(entry.payload);
            const frameWidth = Number(entry.frameSize?.width) || 0;
            const frameHeight = Number(entry.frameSize?.height) || 0;
            for (const pointSet of pointSets) {
                for (const point of pointSet) {
                    const xy = pointXY(point);
                    if (!xy) continue;
                    const x = frameWidth ? (xy.x / frameWidth) * this.canvas.width : xy.x;
                    const y = frameHeight ? (xy.y / frameHeight) * this.canvas.height : xy.y;
                    this._drawPoint(x, y, style);
                    hasPoints = true;
                }
            }
        }
        if (!hasPoints) {
            this.clear();
            return;
        }
        this.runtime.renderer.updateBitmapSkin(this.skinId, this.canvas, 1);
        this.runtime.renderer.updateDrawableVisible(this.drawableId, true);
        this.runtime.renderer.setDrawableOrder(this.drawableId, Infinity, OVERLAY_LAYER);
        this.runtime.requestRedraw?.();
    }

    clear () {
        if (this.drawableId === -1 || !this.runtime?.renderer) return;
        if (this.context && this.canvas) {
            this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.runtime.renderer.updateBitmapSkin(this.skinId, this.canvas, 1);
        }
        this.runtime.renderer.updateDrawableVisible(this.drawableId, false);
        this.runtime.requestRedraw?.();
    }

    _ensureResources () {
        if (typeof document === 'undefined' || !this.runtime?.renderer) return false;
        if (!this.canvas) {
            this.canvas = document.createElement('canvas');
            this.canvas.width = STAGE_WIDTH;
            this.canvas.height = STAGE_HEIGHT;
            this.context = this.canvas.getContext('2d');
            if (!this.context) return false;
        }
        if (this.skinId === -1 || this.drawableId === -1) {
            this.skinId = this.runtime.renderer.createBitmapSkin(this.canvas, 1);
            this.drawableId = this.runtime.renderer.createDrawable(OVERLAY_LAYER);
            this.runtime.renderer.updateDrawableSkinId(this.drawableId, this.skinId);
            this.runtime.renderer.setDrawableOrder(this.drawableId, Infinity, OVERLAY_LAYER);
        }
        return true;
    }

    _drawPoint (x, y, style) {
        if (!this.context) return;
        this.context.beginPath();
        this.context.arc(x, y, Math.max(1, Number(style.radius) || 3), 0, Math.PI * 2);
        this.context.fillStyle = style.fill;
        this.context.fill();
        this.context.lineWidth = 1.5;
        this.context.strokeStyle = style.stroke;
        this.context.stroke();
    }
}

class StageSensingSession {
    constructor (runtime, options = {}) {
        this.runtime = runtime || {};
        this.options = options;
        this.intervalMs = options.intervalMs || DEFAULT_INTERVAL_MS;
        this.autoRefresh = options.autoRefresh !== false;
        this.tasks = new Map();
        this.timer = null;
        this.overlay = null;
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
                this._renderOverlay();
                this._schedule();
            });
        return task.inFlight;
    }

    isReady (taskId) { return Boolean(this._task(taskId).ready); }
    result (taskId) { return this._task(taskId).payload; }
    frameSize (taskId) { return this._task(taskId).frameSize || {width: 0, height: 0}; }

    showKeypoints (taskId) {
        const task = this._task(taskId);
        task.overlayVisible = true;
        this._renderOverlay();
        return task.enabled ? this.refresh(taskId, true) : Promise.resolve(task.payload);
    }

    hideKeypoints (taskId) {
        this._task(taskId).overlayVisible = false;
        this._renderOverlay();
    }

    setPreviewVisible (visible) { this._video()?.setPreviewGhost?.(visible ? 0 : 100); }

    setPreviewTransparency (value) {
        this._video()?.setPreviewGhost?.(Math.max(0, Math.min(100, Number(value) || 0)));
    }

    disableCamera () {
        this._video()?.disableVideo?.();
        for (const task of this.tasks.values()) task.enabled = false;
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
        this._overlay()?.clear();
    }

    _task (taskId) {
        if (!this.tasks.has(taskId)) {
            this.tasks.set(taskId, {
                enabled: false,
                ready: false,
                payload: null,
                error: '',
                inFlight: null,
                lastSampleAt: 0,
                frameSize: {width: 0, height: 0},
                overlayVisible: false,
            });
        }
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

    _overlay () {
        if (!this.overlay) this.overlay = new KeypointOverlay(this.runtime);
        return this.overlay;
    }

    _renderOverlay () {
        const visibleEntries = [];
        for (const [taskId, task] of this.tasks.entries()) {
            if (!task.overlayVisible || !task.payload) continue;
            visibleEntries.push({taskId, payload: task.payload, frameSize: task.frameSize});
        }
        if (!visibleEntries.length) {
            this.overlay?.clear();
            return;
        }
        this._overlay().draw(visibleEntries);
    }
}

function getStageSensingSession (runtime, options) {
    if (!runtime || (typeof runtime !== 'object' && typeof runtime !== 'function')) return new StageSensingSession(runtime, options);
    if (!sessions.has(runtime)) sessions.set(runtime, new StageSensingSession(runtime, options));
    return sessions.get(runtime);
}

module.exports = {StageSensingSession, getStageSensingSession};
