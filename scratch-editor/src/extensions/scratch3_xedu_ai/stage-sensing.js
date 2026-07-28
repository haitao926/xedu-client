const DEFAULT_INTERVAL_MS = 100;
const MIN_REFRESH_INTERVAL_MS = 10;
const DEFAULT_FIRST_FRAME_RETRY_DELAY_MS = 50;
const DEFAULT_FIRST_FRAME_MAX_RETRIES = 5;
const VIDEO_READY_POLL_INTERVAL_MS = 25;
const VIDEO_READY_TIMEOUT_MS = 3000;
const MAX_FRAME_DIMENSION = 640;
const JPEG_QUALITY = 0.75;
const MIN_JPEG_QUALITY = 0.3;
const MAX_FRAME_BYTES = 1024 * 1024;
const TARGET_FRAME_BYTES = 800 * 1024;
const MAX_FRAME_DATA_URL_BYTES = 720 * 1024;
const STALE_RESULT_TTL_MS = 2000;
const STAGE_WIDTH = 480;
const STAGE_HEIGHT = 360;
const OVERLAY_LAYER = 'video';
const OVERLAY_STYLES = Object.freeze({
    pose_body17: {fill: '#4F46E5', stroke: '#FFFFFF', radius: 5},
    pose_face106: {fill: '#F43F5E', stroke: '#FFFFFF', radius: 2.5},
    pose_hand21: {fill: '#D97706', stroke: '#FFFFFF', radius: 4},
    detection: {fill: '#F43F5E', stroke: '#FFFFFF', radius: 0},
    result: {fill: '#0F172A', stroke: '#FFFFFF', radius: 0},
});
const sessions = new WeakMap();
const {requestXEduApi} = require('./api-request');

let sessionSequence = 0;

function createSessionId() {
    sessionSequence += 1;
    return `scratch-sensing-${Date.now()}-${sessionSequence}`;
}

function defaultConcurrentRequests() {
    const cores = Number(globalThis.navigator?.hardwareConcurrency) || 4;
    return cores >= 8 ? 2 : 1;
}

function utf8Bytes(value) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(String(value));
    const encoded = unescape(encodeURIComponent(String(value)));
    const bytes = new Uint8Array(encoded.length);
    for (let index = 0; index < encoded.length; index += 1) bytes[index] = encoded.charCodeAt(index);
    return bytes;
}

function joinBytes(parts) {
    const size = parts.reduce((total, part) => total + part.byteLength, 0);
    const result = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) {
        result.set(part, offset);
        offset += part.byteLength;
    }
    return result;
}

async function buildMultipartBody(fields, blob) {
    const boundary = `----XEduRealtime${Date.now()}${Math.random().toString(16).slice(2)}`;
    const parts = [];
    const addTextPart = (name, value) => {
        parts.push(utf8Bytes(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
    };
    for (const [name, value] of Object.entries(fields)) addTextPart(name, value);
    parts.push(utf8Bytes(`--${boundary}\r\nContent-Disposition: form-data; name="frame"; filename="camera.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`));
    parts.push(new Uint8Array(await blob.arrayBuffer()));
    parts.push(utf8Bytes(`\r\n--${boundary}--\r\n`));
    return {
        body: joinBytes(parts),
        contentType: `multipart/form-data; boundary=${boundary}`,
    };
}

async function blobToDataUrl(blob) {
    if (!blob) return '';
    if (typeof FileReader !== 'undefined') {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(reader.error || new Error('无法读取摄像头画面'));
            reader.readAsDataURL(blob);
        });
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    const encoded = typeof btoa === 'function' ? btoa(binary) : Buffer.from(bytes).toString('base64');
    return `data:${blob.type || 'image/jpeg'};base64,${encoded}`;
}

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

function byteLength(value) {
    const text = String(value ?? '');
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).byteLength;
    return unescape(encodeURIComponent(text)).length;
}

function outputValue(payload) {
    return payload?.result?.output ?? payload?.output ?? payload?.result ?? null;
}

function extractPointSets(payload) {
    const output = outputValue(payload);
    const rawPoints = Array.isArray(output)
        ? output
        : output && typeof output === 'object'
            ? output['关键点坐标'] ?? output['关键点'] ?? output.keypoints ?? output.points
            : null;
    if (!Array.isArray(rawPoints) || !rawPoints.length) return [];
    if (pointXY(rawPoints[0])) return [rawPoints];
    return rawPoints.filter(Array.isArray).filter(group => group.some(point => pointXY(point)));
}

function boxFromValue(value) {
    if (Array.isArray(value) && value.length >= 4 && value.slice(0, 4).every(item => Number.isFinite(Number(item)))) {
        return value.slice(0, 4);
    }
    if (!Array.isArray(value) || value.length < 4) return null;
    const points = value.map(pointXY).filter(Boolean);
    if (points.length < 4) return null;
    const xs = points.map(point => point.x);
    const ys = points.map(point => point.y);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

function extractTextLabels(payload) {
    const output = outputValue(payload);
    const values = output && typeof output === 'object' && !Array.isArray(output)
        ? output['文本'] ?? output.texts ?? output.text ?? output.results ?? output.ocr
        : output;
    if (!Array.isArray(values)) return typeof values === 'string' ? [values] : [];
    return values.map(item => {
        if (typeof item === 'string') return item;
        if (Array.isArray(item)) return item.find(value => typeof value === 'string') || '';
        if (item && typeof item === 'object') {
            return item.text ?? item['文本'] ?? item.content ?? item['内容'] ?? '';
        }
        return '';
    }).map(value => String(value || '').trim()).filter(Boolean);
}

function extractBoxes(payload) {
    const output = outputValue(payload);
    const candidates = Array.isArray(output)
        ? output
        : output && typeof output === 'object'
            ? output['检测框'] ?? output['文字区域'] ?? output.boxes ?? output.bboxes ?? output.text_boxes ?? output.textRegions ?? output.predictions ?? output.detections
            : null;
    if (!Array.isArray(candidates)) return [];
    return candidates.map(item => {
        if (Array.isArray(item)) {
            const box = boxFromValue(item[0]) || boxFromValue(item);
            if (!box) return null;
            const label = item.slice(1).find(value => typeof value === 'string') || '';
            return {box, label};
        }
        if (!item || typeof item !== 'object') return null;
        const box = boxFromValue(item.bbox ?? item.box ?? item['检测框'] ?? item.polygon ?? item.points ?? [item.x1, item.y1, item.x2, item.y2]);
        if (!box) return null;
        return {box, label: item.label ?? item.class ?? item.text ?? item['文本'] ?? item.content ?? item['类别'] ?? '', score: item.score ?? item.confidence};
    }).filter(Boolean);
}

function resultPreview(payload) {
    return payload?.result_artifacts?.preview_image || payload?.artifacts?.image_data || '';
}

function resultHeadline(payload) {
    return String(payload?.result_summary?.headline || payload?.message || '').trim();
}

function isDetectionEntry(entry) {
    return String(entry?.taskId || '').startsWith('det_') || entry?.payload?.result_type === 'detection';
}

function hasBoxOverlay(entry) {
    return isDetectionEntry(entry) || String(entry?.taskId || '') === 'ocr';
}

class KeypointOverlay {
    constructor (runtime) {
        this.runtime = runtime || {};
        this.canvas = null;
        this.context = null;
        this.skinId = -1;
        this.drawableId = -1;
        this.previewSource = '';
        this.previewImage = null;
        this.previewLoadToken = 0;
        this.entries = [];
    }

    draw (entries) {
        if (!Array.isArray(entries) || !entries.length) {
            this.clear();
            return;
        }
        if (!this._ensureResources()) return;
        this.entries = entries;
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
        let hasContent = false;
        let hasPendingPreview = false;
        for (const entry of entries) {
            const style = OVERLAY_STYLES[entry.taskId] || OVERLAY_STYLES[entry.payload?.result_type === 'detection' ? 'detection' : 'result'];
            const preview = resultPreview(entry.payload);
            if (preview) {
                if (this._loadPreview(preview)) {
                    if (typeof this.context.drawImage === 'function') {
                        this.context.drawImage(this.previewImage, 0, 0, this.canvas.width, this.canvas.height);
                        hasContent = true;
                    }
                } else {
                    hasPendingPreview = true;
                }
            }
            const pointSets = extractPointSets(entry.payload);
            const frameWidth = Number(entry.frameSize?.width) || Number(this.previewImage?.naturalWidth || this.previewImage?.width) || 0;
            const frameHeight = Number(entry.frameSize?.height) || Number(this.previewImage?.naturalHeight || this.previewImage?.height) || 0;
            for (const pointSet of pointSets) {
                for (const point of pointSet) {
                    const xy = pointXY(point);
                    if (!xy) continue;
                    const x = frameWidth ? (xy.x / frameWidth) * this.canvas.width : xy.x;
                    const y = frameHeight ? (xy.y / frameHeight) * this.canvas.height : xy.y;
                    this._drawPoint(x, y, style);
                    hasContent = true;
                }
            }
            const detections = hasBoxOverlay(entry) ? extractBoxes(entry.payload) : [];
            for (const detection of detections) {
                if (this._drawBox(detection, frameWidth, frameHeight, style)) hasContent = true;
            }
            let hasTextContent = false;
            if (String(entry?.taskId || '') === 'ocr' && !detections.length) {
                const textLabels = extractTextLabels(entry.payload);
                if (textLabels.length && this._drawResultCard(textLabels.slice(0, 3).join(' | '), style)) {
                    hasContent = true;
                    hasTextContent = true;
                }
            }
            if (!preview && !pointSets.length && !detections.length && !hasTextContent) {
                if (this._drawResultCard(resultHeadline(entry.payload), style)) hasContent = true;
            }
        }
        if (!hasContent) {
            if (!hasPendingPreview) {
                this.clear();
                return;
            }
            // Do not leave the renderer displaying the previous completed frame while the new image loads.
            this.runtime.renderer.updateBitmapSkin(this.skinId, this.canvas, 1);
            this.runtime.renderer.updateDrawableVisible(this.drawableId, false);
            this.runtime.requestRedraw?.();
            return;
        }
        this.runtime.renderer.updateBitmapSkin(this.skinId, this.canvas, 1);
        this.runtime.renderer.updateDrawableVisible(this.drawableId, true);
        this.runtime.renderer.setDrawableOrder(this.drawableId, Infinity, OVERLAY_LAYER);
        this.runtime.requestRedraw?.();
    }

    clear () {
        this.previewLoadToken += 1;
        this.previewSource = '';
        this.previewImage = null;
        this.entries = [];
        if (this.drawableId === -1 || !this.runtime?.renderer) return;
        if (this.context && this.canvas) {
            this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.runtime.renderer.updateBitmapSkin(this.skinId, this.canvas, 1);
        }
        this.runtime.renderer.updateDrawableVisible(this.drawableId, false);
        this.runtime.requestRedraw?.();
    }

    _loadPreview (source) {
        if (source === this.previewSource && this.previewImage) return true;
        if (source === this.previewSource && !this.previewImage) return false;
        this.previewSource = source;
        this.previewImage = null;
        const loadToken = ++this.previewLoadToken;
        if (typeof Image === 'undefined') return false;
        const image = new Image();
        image.onload = () => {
            if (this.previewSource !== source || this.previewLoadToken !== loadToken) return;
            this.previewImage = image;
            this.draw(this.entries);
        };
        image.onerror = () => {
            if (this.previewSource === source && this.previewLoadToken === loadToken) this.previewSource = '';
        };
        image.src = source;
        return false;
    }

    _drawBox (detection, frameWidth, frameHeight, style) {
        if (!this.context || typeof this.context.strokeRect !== 'function') return false;
        const values = detection.box.slice(0, 4).map(Number);
        if (!values.every(Number.isFinite)) return false;
        const [x1, y1, x2, y2] = values;
        const scaleX = frameWidth ? this.canvas.width / frameWidth : 1;
        const scaleY = frameHeight ? this.canvas.height / frameHeight : 1;
        const left = Math.min(x1, x2) * scaleX;
        const top = Math.min(y1, y2) * scaleY;
        const width = Math.abs(x2 - x1) * scaleX;
        const height = Math.abs(y2 - y1) * scaleY;
        if (width <= 0 || height <= 0) return false;
        this.context.lineWidth = 3;
        this.context.strokeStyle = style.stroke;
        this.context.strokeRect(left, top, width, height);
        const label = String(detection.label || '').trim();
        if (label && typeof this.context.fillText === 'function') {
            this.context.fillStyle = style.stroke;
            this.context.font = '14px sans-serif';
            this.context.fillText(label, left + 4, Math.max(14, top - 4));
        }
        return true;
    }

    _drawResultCard (headline, style) {
        if (!headline || !this.context || typeof this.context.fillText !== 'function') return false;
        if (typeof this.context.fillRect === 'function') {
            this.context.fillStyle = 'rgba(15, 23, 42, 0.82)';
            this.context.fillRect(12, 12, Math.min(this.canvas.width - 24, 320), 38);
        }
        this.context.fillStyle = style.stroke;
        this.context.font = '16px sans-serif';
        this.context.fillText(headline, 22, 37);
        return true;
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
        this.intervalMs = Math.max(MIN_REFRESH_INTERVAL_MS, Number(options.intervalMs) || DEFAULT_INTERVAL_MS);
        this.firstFrameRetryDelayMs = Math.max(0, Number(options.firstFrameRetryDelayMs) || DEFAULT_FIRST_FRAME_RETRY_DELAY_MS);
        this.firstFrameMaxRetries = Math.max(0, Number(options.firstFrameMaxRetries) || DEFAULT_FIRST_FRAME_MAX_RETRIES);
        this.autoRefresh = options.autoRefresh !== false;
        const requestedConcurrency = Number(options.maxConcurrentRequests);
        this.maxConcurrentRequests = Math.max(
            1,
            Math.min(4, Number.isFinite(requestedConcurrency) && requestedConcurrency > 0
                ? requestedConcurrency
                : defaultConcurrentRequests()),
        );
        this.tasks = new Map();
        this.manualResults = new Map();
        this.timer = null;
        this.captureInFlight = null;
        this.activeRequests = 0;
        this.roundRobinCursor = 0;
        this.frameSequence = 0;
        this.sessionId = createSessionId();
        this.frameCanvases = null;
        this.overlay = null;
        this.videoReady = null;
        this.requestEpoch = 0;
    }

    enable (taskId) {
        const task = this._task(taskId);
        if (task.enabled) {
            task.nextDueAt = 0;
            this._pump(true);
            return task.inFlight || Promise.resolve(task.payload);
        }
        task.enabled = true;
        task.ready = false;
        task.payload = null;
        task.error = '';
        task.overlayVisible = true;
        task.lastSuccessAt = 0;
        task.nextDueAt = 0;
        const enableToken = Symbol(taskId);
        const requestEpoch = this.requestEpoch;
        task.enableToken = enableToken;
        const firstResult = new Promise(resolve => task.firstResultWaiters.push(resolve));
        return this._enableVideo(requestEpoch)
            .then(() => {
                if (!task.enabled || task.enableToken !== enableToken || requestEpoch !== this.requestEpoch) {
                    this._resolveFirstResult(task, null);
                    return null;
                }
                this._pump(true);
                // Auto-refresh can intentionally start the next slow inference
                // before the first one has returned to the caller. Wait only
                // for this capture round, not for the task to become idle.
                return firstResult.then(value => this._waitForCapture(value));
            })
            .catch(error => {
                if (task.enableToken !== enableToken || requestEpoch !== this.requestEpoch) return null;
                task.enabled = false;
                task.ready = false;
                task.error = error?.message || '摄像头不可用';
                this._resolveFirstResult(task, null);
                return null;
            });
    }

    enableCamera () { return this._enableVideo(); }

    refresh (taskId, force = false) {
        const task = this._task(taskId);
        if (!task.enabled || task.inFlight) return task.inFlight || Promise.resolve(task.payload);
        if (force) task.nextDueAt = 0;
        this._pump(true);
        if (task.inFlight) return task.inFlight;
        if (this.captureInFlight) return this.captureInFlight.then(() => task.payload);
        return Promise.resolve(task.payload);
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

    showResult (taskId, payload, frameSize = {}) {
        const key = String(taskId || 'result');
        this.manualResults.set(key, {taskId: key, payload, frameSize});
        this._renderOverlay();
        return payload;
    }

    clearResult (taskId = '') {
        if (taskId) this.manualResults.delete(String(taskId));
        else this.manualResults.clear();
        this._renderOverlay();
    }

    setPreviewVisible (visible) { this._video()?.setPreviewGhost?.(visible ? 0 : 100); }

    setPreviewTransparency (value) {
        this._video()?.setPreviewGhost?.(Math.max(0, Math.min(100, Number(value) || 0)));
    }

    disableCamera () {
        this.requestEpoch += 1;
        this.sessionId = createSessionId();
        this._video()?.disableVideo?.();
        this.videoReady = null;
        for (const task of this.tasks.values()) {
            task.enabled = false;
            task.ready = false;
            task.payload = null;
            task.error = '';
            task.inFlight = null;
            task.requestToken = null;
            task.enableToken = null;
            if (task.overlayExpiryTimer) clearTimeout(task.overlayExpiryTimer);
            task.overlayExpiryTimer = null;
            this._resolveFirstResult(task, null);
        }
        this.manualResults.clear();
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
        this.captureInFlight = null;
        this.activeRequests = 0;
        this._overlay()?.clear();
    }

    _task (taskId) {
        if (!this.tasks.has(taskId)) {
            this.tasks.set(taskId, {
                taskId,
                enabled: false,
                ready: false,
                payload: null,
                error: '',
                inFlight: null,
                lastSampleAt: 0,
                frameSize: {width: 0, height: 0},
                overlayVisible: false,
                requestToken: null,
                enableToken: null,
                overlayExpiryTimer: null,
                nextDueAt: 0,
                lastSuccessAt: 0,
                firstResultWaiters: [],
            });
        }
        return this.tasks.get(taskId);
    }

    _video () { return this.runtime?.ioDevices?.video; }

    _enableVideo (requestEpoch = this.requestEpoch) {
        if (this.videoReady) return this.videoReady;
        const video = this._video();
        if (!video?.enableVideo) return Promise.resolve();
        const result = video.enableVideo();
        const setup = result && typeof result.then === 'function' ? result : Promise.resolve(result);
        // Lightweight providers used by integrations do not expose a readiness state.
        // Preserve their original promise while real Scratch Video devices get the
        // metadata wait that prevents getFrame() from racing videoWidth/videoHeight.
        this.videoReady = typeof video.videoReady === 'undefined'
            ? setup
            : setup.then(value => this._waitForVideoReady(video, requestEpoch).then(() => value));
        const ready = this.videoReady;
        ready.catch(error => {
            if (this.videoReady === ready) this.videoReady = null;
        });
        return ready;
    }

    _waitForVideoReady (video, requestEpoch) {
        if (typeof video.videoReady === 'undefined') return Promise.resolve();
        const deadline = Date.now() + VIDEO_READY_TIMEOUT_MS;
        const check = () => {
            if (requestEpoch !== this.requestEpoch) throw new Error('摄像头会话已重置');
            if (video.videoReady) return;
            if (Date.now() >= deadline) throw new Error('摄像头画面未就绪');
            return this._delay(VIDEO_READY_POLL_INTERVAL_MS).then(check);
        };
        return Promise.resolve().then(check);
    }

    _resolveFirstResult (task, value) {
        const waiters = task.firstResultWaiters.splice(0);
        for (const resolve of waiters) resolve(value);
    }

    _waitForCapture (value) {
        const pending = this.captureInFlight;
        return pending ? pending.then(() => value) : value;
    }

    _enabledTasks () {
        return [...this.tasks.values()].filter(task => task.enabled);
    }

    _dueTasks (now = Date.now()) {
        return this._enabledTasks().filter(task => !task.inFlight && task.nextDueAt <= now);
    }

    _pump (manual = false) {
        if (!this.autoRefresh && !manual) return;
        if (this.captureInFlight || this.activeRequests >= this.maxConcurrentRequests) {
            return;
        }
        const dueTasks = this._dueTasks();
        if (!dueTasks.length) {
            this._schedule();
            return;
        }
        const orderedTasks = dueTasks.map((_, index) => dueTasks[(this.roundRobinCursor + index) % dueTasks.length]);
        const selectedTasks = orderedTasks.slice(0, this.maxConcurrentRequests - this.activeRequests);
        this.roundRobinCursor = (this.roundRobinCursor + selectedTasks.length) % Math.max(1, dueTasks.length);
        const requestEpoch = this.requestEpoch;
        const captureOperation = this._captureFrame()
            .then(frame => {
                if (requestEpoch !== this.requestEpoch) return [];
                frame.frameSequence = ++this.frameSequence;
                const operations = selectedTasks
                    .filter(task => task.enabled && task.nextDueAt <= Date.now() && !task.inFlight)
                    .map(task => this._dispatch(task, frame, requestEpoch));
                // Dispatch synchronously after one capture. Inference promises
                // continue independently, so a slow model does not hold up
                // another task that still has an available request slot.
                return operations.length;
            })
            .catch(error => {
                if (requestEpoch === this.requestEpoch) {
                    for (const task of selectedTasks) {
                        if (!task.enabled || task.inFlight) continue;
                        task.error = error?.message || '未取得摄像头画面';
                        task.ready = false;
                        task.nextDueAt = Date.now() + this.intervalMs;
                        this._resolveFirstResult(task, null);
                    }
                }
                return [];
            })
            .finally(() => {
                if (this.captureInFlight === captureOperation) this.captureInFlight = null;
                this._pump();
            });
        this.captureInFlight = captureOperation;
    }

    _dispatch (task, frame, requestEpoch) {
        const taskId = task.taskId;
        const requestToken = Symbol(taskId);
        const frameSequence = Number(frame.frameSequence) || ++this.frameSequence;
        task.lastSampleAt = frame.capturedAt;
        task.nextDueAt = frame.capturedAt + this.intervalMs;
        task.frameSize = {width: frame.width || 0, height: frame.height || 0};
        task.requestToken = requestToken;
        this.activeRequests += 1;
        const operation = this._request(taskId, frame, {
            sessionId: this.sessionId,
            frameSequence,
            capturedAtMs: frame.capturedAt,
        })
            .then(payload => {
                if (!task.enabled || requestEpoch !== this.requestEpoch || task.requestToken !== requestToken) return null;
                if (payload?.session_id && payload.session_id !== this.sessionId) return null;
                if (payload?.frame_seq != null && Number(payload.frame_seq) !== frameSequence) return null;
                if (payload?.success === false) {
                    task.error = String(payload.message || '感知失败');
                    if (!task.lastSuccessAt || Date.now() - task.lastSuccessAt >= STALE_RESULT_TTL_MS) task.ready = false;
                    return task.payload;
                }
                task.payload = payload;
                task.ready = true;
                task.error = '';
                task.lastSuccessAt = Date.now();
                this._scheduleOverlayExpiry(task);
                return payload;
            })
            .catch(error => {
                if (task.requestToken !== requestToken) return null;
                task.error = error?.message || '感知请求失败';
                if (!task.lastSuccessAt || Date.now() - task.lastSuccessAt >= STALE_RESULT_TTL_MS) task.ready = false;
                return task.payload;
            })
            .finally(() => {
                if (requestEpoch === this.requestEpoch) {
                    this.activeRequests = Math.max(0, this.activeRequests - 1);
                }
                const isCurrentRequest = requestEpoch === this.requestEpoch && task.requestToken === requestToken;
                if (isCurrentRequest) {
                    task.inFlight = null;
                    task.requestToken = null;
                    this._resolveFirstResult(task, task.payload);
                }
                this._renderOverlay();
                this._pump();
            });
        task.inFlight = operation;
        return operation;
    }

    _schedule () {
        if (!this.autoRefresh || this.timer || !this._enabledTasks().length || this.captureInFlight) return;
        const now = Date.now();
        const nextDueAt = Math.min(...this._enabledTasks()
            .filter(task => !task.inFlight)
            .map(task => task.nextDueAt));
        if (!Number.isFinite(nextDueAt)) return;
        this.timer = setTimeout(() => {
            this.timer = null;
            this._pump();
        }, Math.max(0, nextDueAt - now));
        this.timer.unref?.();
    }

    _scheduleOverlayExpiry (task) {
        if (task.overlayExpiryTimer) clearTimeout(task.overlayExpiryTimer);
        if (!task.lastSuccessAt) return;
        task.overlayExpiryTimer = setTimeout(() => {
            task.overlayExpiryTimer = null;
            if (task.lastSuccessAt && Date.now() - task.lastSuccessAt >= STALE_RESULT_TTL_MS) {
                task.ready = false;
                this._renderOverlay();
            }
        }, Math.max(1, task.lastSuccessAt + STALE_RESULT_TTL_MS - Date.now() + 1));
        task.overlayExpiryTimer.unref?.();
    }

    async _captureFrame () {
        let frame = null;
        for (let attempt = 0; attempt <= this.firstFrameMaxRetries; attempt += 1) {
            frame = this.options.getFrame ? await this.options.getFrame() : this._video()?.getFrame?.({format: 'image-data'});
            if (frame) break;
            if (attempt === this.firstFrameMaxRetries) throw new Error('未取得摄像头画面');
            await this._delay(this.firstFrameRetryDelayMs);
        }
        const capturedAt = Date.now();
        if (typeof frame === 'string' && frame.startsWith('data:image/')) return {dataUrl: frame, blob: null, width: 0, height: 0, capturedAt};
        if (!frame?.data || !frame.width || !frame.height || typeof document === 'undefined') throw new Error('未取得摄像头画面');
        if (!this.frameCanvases) {
            this.frameCanvases = {source: document.createElement('canvas'), target: document.createElement('canvas')};
        }
        const sourceCanvas = this.frameCanvases.source;
        sourceCanvas.width = frame.width;
        sourceCanvas.height = frame.height;
        const sourceContext = sourceCanvas.getContext('2d');
        sourceContext.putImageData(frame, 0, 0);

        let width = Math.min(frame.width, MAX_FRAME_DIMENSION);
        let height = Math.max(1, Math.round(frame.height * (width / frame.width)));
        if (height > MAX_FRAME_DIMENSION) {
            height = MAX_FRAME_DIMENSION;
            width = Math.max(1, Math.round(frame.width * (height / frame.height)));
        }

        let lastEncoding = null;
        for (let scale = 1; scale >= 0.5; scale *= 0.8) {
            const targetWidth = Math.max(1, Math.round(width * scale));
            const targetHeight = Math.max(1, Math.round(height * scale));
            const canvas = this.frameCanvases.target;
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            const context = canvas.getContext('2d');
            if (targetWidth === frame.width && targetHeight === frame.height) {
                context.putImageData(frame, 0, 0);
            } else {
                context.drawImage(sourceCanvas, 0, 0, targetWidth, targetHeight);
            }

            for (let quality = JPEG_QUALITY; quality >= MIN_JPEG_QUALITY; quality -= 0.15) {
                const encoded = await this._canvasToBlob(canvas, Number(quality.toFixed(2)));
                lastEncoding = {...encoded, width: targetWidth, height: targetHeight, capturedAt};
                const size = encoded.blob?.size || byteLength(encoded.dataUrl);
                if (size <= TARGET_FRAME_BYTES && (!encoded.dataUrl || byteLength(encoded.dataUrl) <= MAX_FRAME_DATA_URL_BYTES)) return lastEncoding;
            }
        }

        return lastEncoding;
    }

    _delay (ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    _canvasToBlob (canvas, quality) {
        if (typeof canvas.toBlob === 'function') {
            return new Promise((resolve, reject) => {
                canvas.toBlob(blob => {
                    if (!blob) reject(new Error('摄像头画面编码失败'));
                    else resolve({blob, dataUrl: ''});
                }, 'image/jpeg', quality);
            });
        }
        if (typeof canvas.toDataURL === 'function') return Promise.resolve({blob: null, dataUrl: canvas.toDataURL('image/jpeg', quality)});
        return Promise.reject(new Error('浏览器不支持摄像头画面编码'));
    }

    async _request (taskId, frame, metadata = {}) {
        if (this.options.request) return this.options.request(taskId, frame.blob || frame.dataUrl, metadata);
        if (!frame.blob) return this._requestLegacy(taskId, frame.dataUrl);
        const apiBase = (this.options.apiBase?.() || 'http://127.0.0.1:5123').replace(/\/$/, '');
        const multipart = await buildMultipartBody({
            task_id: taskId,
            session_id: metadata.sessionId || this.sessionId,
            frame_seq: metadata.frameSequence || 0,
            captured_at_ms: metadata.capturedAtMs || Date.now(),
            params: JSON.stringify(this.options.taskParams?.(taskId) || {}),
        }, frame.blob);
        const response = await requestXEduApi(`${apiBase}/api/resources/xeduhub/realtime`, {
            method: 'POST',
            headers: {'Content-Type': multipart.contentType},
            body: multipart.body,
        });
        if (response.status === 404) {
            const dataUrl = frame.dataUrl || await blobToDataUrl(frame.blob);
            return this._requestLegacy(taskId, dataUrl);
        }
        return response.json();
    }

    async _requestLegacy (taskId, dataUrl) {
        const apiBase = (this.options.apiBase?.() || 'http://127.0.0.1:5123').replace(/\/$/, '');
        const response = await requestXEduApi(`${apiBase}/api/resources/xeduhub/execute`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({code: '', project_root: this.options.projectRoot?.() || '', spec: {task_id: taskId, input: dataUrl, params: {img_type: ''}}}),
        });
        return response.json();
    }

    _overlay () {
        if (!this.overlay) this.overlay = new KeypointOverlay(this.runtime);
        return this.overlay;
    }

    _renderOverlay () {
        const visibleEntries = [];
        const now = Date.now();
        for (const [taskId, task] of this.tasks.entries()) {
            const stale = task.lastSuccessAt > 0 && now - task.lastSuccessAt >= STALE_RESULT_TTL_MS;
            if (!task.overlayVisible || !task.payload || !task.ready || stale) continue;
            visibleEntries.push({taskId, payload: task.payload, frameSize: task.frameSize});
        }
        visibleEntries.push(...this.manualResults.values());
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
