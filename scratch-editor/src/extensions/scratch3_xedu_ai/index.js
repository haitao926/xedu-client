const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const Cast = require('../../util/cast');

const {
    TASKS,
    TASK_BLOCKS,
    buildTaskSpec,
    canonicalTaskId,
    createXEduBlockInfo,
    createXEduBlockInfoForModule,
    SENSING_DEFINITIONS,
    evaluateMathBlock,
    summarizeXEduPayload,
} = require('./descriptor');
const {getStageSensingSession} = require('./stage-sensing');
const {requestXEduApi} = require('./api-request');

const fallbackIconUri = 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2040%2040%22%3E%3Crect%20width%3D%2240%22%20height%3D%2240%22%20rx%3D%2210%22%20fill%3D%22%236366F1%22%2F%3E%3Cpath%20d%3D%22M12%2014h8m0%200v12m0-12%208%204m-8%208%208-4%22%20stroke%3D%22%23fff%22%20stroke-width%3D%223%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Ccircle%20cx%3D%2212%22%20cy%3D%2214%22%20r%3D%224%22%20fill%3D%22%23fff%22%2F%3E%3Ccircle%20cx%3D%2220%22%20cy%3D%2226%22%20r%3D%224%22%20fill%3D%22%23fff%22%2F%3E%3Ccircle%20cx%3D%2228%22%20cy%3D%2218%22%20r%3D%224%22%20fill%3D%22%23fff%22%2F%3E%3Ccircle%20cx%3D%2228%22%20cy%3D%2222%22%20r%3D%224%22%20fill%3D%22%23fff%22%20opacity%3D%22.74%22%2F%3E%3C%2Fsvg%3E';

const LEGACY_TASK_ALIASES = Object.freeze({
    classification: 'cls_imagenet', detection: 'det_body', segmentation: 'segment_anything',
    pose: 'pose_body17', ocr: 'ocr', generation: 'gen_style', panoptic: 'drive_perception',
    multimodal: 'embedding_image', depth: 'depth_anything',
});

const MENU_NAMES = Object.freeze({
    TASK: 'tasks', TASK_ID: 'tasks', COLOR_CODE: 'colorCodes', FLIP_CODE: 'flipCodes', ROTATE_CODE: 'rotateCodes',
    AXIS: 'axes', FIELD: 'fields', MODE: 'modes', STYLE: 'styles',
});

const MENU_ITEMS = Object.freeze({
    colorCodes: [{text: '灰度', value: 'GRAY'}, {text: 'RGB', value: 'RGB'}, {text: 'HSV', value: 'HSV'}],
    flipCodes: [{text: '水平', value: 'horizontal'}, {text: '垂直', value: 'vertical'}, {text: '水平+垂直', value: 'both'}],
    rotateCodes: [{text: '90°', value: '90'}, {text: '180°', value: '180'}, {text: '270°', value: '270'}],
    axes: [{text: 'X', value: 'x'}, {text: 'Y', value: 'y'}],
    fields: [{text: '摘要', value: 'result_summary'}, {text: '结果', value: 'result'}, {text: '原始数据', value: 'raw'}],
    modes: [{text: '点提示', value: 'point'}, {text: '框提示', value: 'box'}, {text: '掩码', value: 'mask'}],
    styles: [{text: '马赛克', value: 'mosaic'}, {text: '素描', value: 'sketch'}, {text: '油画', value: 'oil'}],
    objectFields: [{text: '类别', value: 'label'}, {text: '置信度', value: 'confidence'}],
    cameraDisplays: [{text: '舞台', value: 'stage'}, {text: '不显示', value: 'hidden'}],
    bodyPoints: [
        {text: '鼻尖', value: '1'}, {text: '左手腕', value: '10'}, {text: '右手腕', value: '11'},
        {text: '左脚踝', value: '16'}, {text: '右脚踝', value: '17'},
    ],
    handPoints: [
        {text: '手腕', value: '1'}, {text: '拇指指尖', value: '5'}, {text: '食指指尖', value: '9'},
        {text: '中指指尖', value: '13'}, {text: '无名指指尖', value: '17'}, {text: '小指指尖', value: '21'},
    ],
    positions: [
        {text: '中心 X', value: 'centerX'}, {text: '中心 Y', value: 'centerY'},
        {text: '宽度', value: 'width'}, {text: '高度', value: 'height'},
    ],
});

const SENSING_TASKS = Object.freeze({
    imageClassification: 'cls_imagenet', objectSensing: 'det_coco_l', faceSensing: 'pose_face106',
    bodySensing: 'pose_body17', handSensing: 'pose_hand21', textRecognition: 'ocr',
    imageSegmentation: 'segment_anything', depthSensing: 'depth_anything',
});

const sharedStates = new WeakMap();
let fallbackSharedState;

function createSharedState() {
    return {
        input: 'demo.jpg', workflowTask: 'cls_imagenet', workflowParams: {}, lastResult: '', lastRawResult: null,
        lastValue: '', lastError: '', records: [], resources: new Map(), resultsByExtension: {}, cameraStreams: new Set(),
    };
}

function getSharedState(runtime) {
    if (runtime && (typeof runtime === 'object' || typeof runtime === 'function')) {
        if (!sharedStates.has(runtime)) sharedStates.set(runtime, createSharedState());
        return sharedStates.get(runtime);
    }
    if (!fallbackSharedState) fallbackSharedState = createSharedState();
    return fallbackSharedState;
}

const SHARED_PROPERTIES = Object.freeze({
    _input: 'input', _workflowTask: 'workflowTask', _workflowParams: 'workflowParams', _lastResult: 'lastResult',
    _lastRawResult: 'lastRawResult', _lastValue: 'lastValue', _lastError: 'lastError', _records: 'records', _resources: 'resources',
    _resultsByExtension: 'resultsByExtension', _cameraStreams: 'cameraStreams',
});

function stringValue(value, fallback = '') {
    const text = Cast.toString(value ?? '').trim();
    return text || fallback;
}

function jsonValue(value, fallback = value) {
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch (_) { return fallback; }
}

function bytesLength(value) {
    if (value instanceof Uint8Array) return value.byteLength;
    return new TextEncoder().encode(String(value ?? '')).byteLength;
}

class Scratch3XEduAI {
    constructor (runtime, moduleKey = null) {
        this.runtime = runtime;
        this.moduleKey = moduleKey;
        const state = getSharedState(runtime);
        for (const [property, stateKey] of Object.entries(SHARED_PROPERTIES)) {
            Object.defineProperty(this, property, {
                configurable: true,
                get: () => state[stateKey],
                set: value => { state[stateKey] = value; },
            });
        }
        if (runtime && typeof runtime === 'object' && typeof runtime.__xeduReleaseCameraResources !== 'function') {
            runtime.__xeduReleaseCameraResources = () => {
                this._releaseCameraResources();
            };
            runtime.on?.('PROJECT_STOP_ALL', runtime.__xeduReleaseCameraResources);
        }
    }

    getInfo () {
        const descriptor = this.moduleKey ? createXEduBlockInfoForModule(this.moduleKey) : createXEduBlockInfo();
        const isSensing = SENSING_DEFINITIONS.some(module => module.key === this.moduleKey);
        const blocks = descriptor.blocks.map(block => block === '---' ? block : ({
            opcode: block.opcode,
            text: block.text,
            blockType: block.blockType === 'boolean' ? BlockType.BOOLEAN : block.blockType === 'reporter' ? BlockType.REPORTER : BlockType.COMMAND,
            ...(block.hideFromPalette ? {hideFromPalette: true} : {}),
            arguments: Object.fromEntries(Object.entries(block.arguments || {}).map(([name, argument]) => [name, {
                type: ArgumentType.STRING,
                defaultValue: argument.defaultValue,
                ...(argument.menu || MENU_NAMES[name] ? {menu: argument.menu || MENU_NAMES[name]} : {}),
            }])),
        }));
        if (!this.moduleKey || this.moduleKey === 'vision') {
            blocks.unshift({
                opcode: 'runTask', text: '运行识别 [TASK] 图像 [IMAGE]', blockType: BlockType.REPORTER,
                ...(this.moduleKey === 'vision' ? {hideFromPalette: true} : {}),
                arguments: {TASK: {type: ArgumentType.STRING, menu: 'tasks', defaultValue: 'det_body'}, IMAGE: {type: ArgumentType.STRING, defaultValue: 'demo.jpg'}},
            });
        }
        if (!this.moduleKey || this.moduleKey === 'results') {
            blocks.unshift(
                {opcode: 'lastResult', text: '最近一次 XEdu 结果', blockType: BlockType.REPORTER, arguments: {}},
                {opcode: 'resultContains', text: '结果包含 [TEXT]?', blockType: BlockType.BOOLEAN, arguments: {TEXT: {type: ArgumentType.STRING, defaultValue: '人体'}}},
            );
        }
        const iconUri = descriptor.iconURI || fallbackIconUri;
        return {
            id: descriptor.id, name: descriptor.name, ...(!isSensing ? {blockIconURI: iconUri} : {}), menuIconURI: iconUri,
            color1: descriptor.color1, color2: descriptor.color2, color3: descriptor.color3, blocks,
            menus: {tasks: Object.keys(TASKS).map(taskId => ({text: TASKS[taskId].label, value: taskId})), ...MENU_ITEMS},
        };
    }

    runTask (args) {
        return this._runTask(args.TASK, args);
    }

    lastResult () {
        return this._lastResult;
    }

    resultContains (args) {
        const needle = stringValue(args.TEXT).toLowerCase();
        return Boolean(needle && this._lastResult.toLowerCase().includes(needle));
    }

    enableClassification () { return this._enableSensing(); }
    classificationReady () { return this._sensingReady(); }
    classificationLabel () { return this._classification().label; }
    classificationConfidence () { return this._classification().confidence; }
    classificationIs (args) { return this._classification().label.toLowerCase() === stringValue(args.TARGET).toLowerCase(); }

    enableObjectSensing () { return this._enableSensing(); }
    objectReady () { return this._sensingReady(); }
    objectDetected (args) { return this._detections(args.TARGET).length > 0; }
    objectCount (args) { return this._detections(args.TARGET).length; }
    objectField (args) {
        const item = this._detections('*')[this._oneBasedIndex(args.INDEX)];
        return args.FIELD === 'confidence' ? this._detectionConfidence(item) : this._detectionLabel(item);
    }
    objectPosition (args) { return this._boxPosition(this._detectionBox(this._detections('*')[this._oneBasedIndex(args.INDEX)]), args.POSITION); }

    enableFaceSensing () { return this._enableSensing(); }
    faceReady () { return this._sensingReady(); }
    faceDetected () { return this._detections('*').length > 0 || this._points().length > 0; }
    faceCount () { return this._detections('*').length || (this._points().length ? 1 : 0); }
    facePosition (args) { return this._boxPosition(this._detectionBox(this._detections('*')[this._oneBasedIndex(args.INDEX)]), args.POSITION); }
    facePointAxis (args) { return this._pointAxis(args.INDEX, args.AXIS); }
    showFaceKeypoints () { return this._setKeypointOverlay(true); }
    hideFaceKeypoints () { this._setKeypointOverlay(false); }

    enableBodySensing () { return this._enableSensing(); }
    bodyReady () { return this._sensingReady(); }
    bodyDetected () { return this._detections('*').length > 0 || this._points().length > 0; }
    bodyCount () { return this._detections('*').length || (this._points().length ? 1 : 0); }
    bodyPosition (args) { return this._boxPosition(this._detectionBox(this._detections('*')[this._oneBasedIndex(args.INDEX)]), args.POSITION); }
    bodyPointAxis (args) { return this._pointAxis(args.POINT, args.AXIS); }
    showBodyKeypoints () { return this._setKeypointOverlay(true); }
    hideBodyKeypoints () { this._setKeypointOverlay(false); }

    enableHandSensing () { return this._enableSensing(); }
    handReady () { return this._sensingReady(); }
    handDetected () { return this._detections('*').length > 0 || this._points().length > 0; }
    handCount () { return this._detections('*').length || (this._points().length ? 1 : 0); }
    handPosition (args) { return this._boxPosition(this._detectionBox(this._detections('*')[this._oneBasedIndex(args.INDEX)]), args.POSITION); }
    handPointAxis (args) { return this._pointAxis(args.POINT, args.AXIS); }
    showHandKeypoints () { return this._setKeypointOverlay(true); }
    hideHandKeypoints () { this._setKeypointOverlay(false); }

    enableTextRecognition () { return this._enableSensing(); }
    textReady () { return this._sensingReady(); }
    textRecognized () { return this._texts().length > 0; }
    textCount () { return this._texts().length; }
    textBlock (args) { return this._texts()[this._oneBasedIndex(args.INDEX)] || ''; }
    allRecognizedText () { return this._texts().join('\n'); }

    enableSegmentation () { return this._enableSensing(); }
    segmentationReady () { return this._sensingReady(); }
    segmentationFound () { return this.segmentationCount() > 0; }
    segmentationCount () { return Number(this._keyFields()['掩码数']) || this._resultList('掩码', 'masks').length; }
    enableDepthSensing () { return this._enableSensing(); }
    depthReady () { return this._sensingReady(); }
    depthValue (args) {
        const depth = this._resultValue('深度图', 'depth', 'depthMap');
        if (!Array.isArray(depth) || !depth.length || !Array.isArray(depth[0])) return 0;
        const y = Math.max(0, Math.min(depth.length - 1, Math.round((180 - (Number(args.Y) || 0)) / 360 * (depth.length - 1))));
        const x = Math.max(0, Math.min(depth[0].length - 1, Math.round(((Number(args.X) || 0) + 240) / 480 * (depth[0].length - 1))));
        return Number(depth[y]?.[x]) || 0;
    }
    enableCamera () { this._sensingSession()._video()?.enableVideo?.(); }
    disableCamera () { this._sensingSession().disableCamera(); }
    showCameraPreview (args) { this._sensingSession().setPreviewVisible(args.DISPLAY !== 'hidden'); }
    setCameraTransparency (args) { this._sensingSession().setPreviewTransparency(args.TRANSPARENCY); }

    [Symbol.for('xedu-extension-dispatch')] () {}

    _dispatch (opcode, args = {}, util) {
        const taskId = TASK_BLOCKS[opcode];
        if (taskId) return this._runTask(taskId, args);
        switch (opcode) {
        case 'xeduhub_set_input':
        case 'xeduhub_flow_set_input':
        case 'xeduhub_set_input_resource':
            this._input = stringValue(args.INPUT, this._input); return this._input;
        case 'xeduhub_set_input_list':
            this._input = jsonValue(args.INPUTS, stringValue(args.INPUTS)); return this._input;
        case 'xeduhub_input_image': return this._input || stringValue(args.INPUT, 'demo.jpg');
        case 'xeduhub_load_image_to_var': this._lastValue = stringValue(args.INPUT, this._input); return this._lastValue;
        case 'xeduhub_workflow_create':
        case 'xeduhub_workflow_create_var':
            this._workflowTask = canonicalTaskId(args.TASK_ID || args.TASK || 'cls_imagenet'); return this._workflowTask;
        case 'xeduhub_workflow_set_task': this._workflowTask = canonicalTaskId(args.TASK_ID); return this._workflowTask;
        case 'xeduhub_workflow_set_params': this._workflowParams = jsonValue(args.PARAMS, {}); return this._workflowParams;
        case 'xeduhub_workflow_infer':
        case 'xeduhub_workflow_infer_var':
        case 'xeduhub_workflow_infer_pair':
            return this._runTask(this._workflowTask, {
                IMAGE: args.INPUT_DATA || this._input, ...this._workflowParams, ...jsonValue(args.PARAMS, {}),
                BBOX: args.BBOX,
            });
        case 'xeduhub_classify_run': return this._runTask('cls_imagenet', {IMAGE: this._input, MODEL: args.MODEL});
        case 'xeduhub_detect_run': return this._runTask(args.MODEL || 'det_body', {IMAGE: this._input});
        case 'xeduhub_ocr_run': return this._runTask('ocr', {IMAGE: this._input});
        case 'xeduhub_run_vision': return this._runTask(args.TASK || args.MODEL, {INPUT: args.INPUT});
        case 'xeduhub_raw_inference': return this._runTask(args.MODEL, {INPUT: args.INPUT});
        case 'xeduhub_raw_create_workflow':
        case 'xeduhub_create_flow':
        case 'xeduhub_create_workflow':
        case 'xeduhub_set_model': this._workflowTask = canonicalTaskId(args.TASK || args.MODEL); return this._workflowTask;
        case 'xeduhub_execute_workflow':
        case 'xeduhub_flow_execute': return this._runTask(this._workflowTask, {IMAGE: this._input});
        case 'xeduhub_show_result':
        case 'xeduhub_show_result_card': return this._lastResult;
        case 'xeduhub_show_result_image': return this._lastRawResult?.result_artifacts?.preview_image || this._lastValue || '';
        case 'xeduhub_run_and_record':
            this._records.push({note: stringValue(args.NOTE), result: this._lastRawResult, at: new Date().toISOString()}); return this._lastResult;
        case 'xeduhub_clear_result': this._lastResult = ''; this._lastRawResult = null; this._lastError = ''; return '';
        case 'xeduhub_get_result_field': return this._readResultField(args.RESULT, args.FIELD);
        case 'xeduhub_result_first_box': return this._firstBox(args.RESULT || this._lastRawResult);
        case 'xeduhub_bbox_center_x': { const box = this._firstBox(args.BOX || this._lastRawResult); return box ? (Number(box[0]) + Number(box[2])) / 2 : 0; }
        case 'xeduhub_ocr_first_text': return this._firstText(args.RESULT || this._lastRawResult);
        case 'xeduhub_keypoint_axis': return this._keypointAxis(args.POINTS, args.INDEX, args.AXIS);
        case 'xeduhub_math_distance': return evaluateMathBlock('distance', {x1: args.X1, y1: args.Y1, x2: args.X2, y2: args.Y2});
        case 'xeduhub_quadratic_fit': return evaluateMathBlock('quadraticFit', {x: jsonValue(args.X_VALUES, []), y: jsonValue(args.Y_VALUES, [])});
        case 'xeduhub_polyfit_quadratic': this._lastValue = this._dispatch('xeduhub_quadratic_fit', args); return this._lastValue;
        case 'xeduhub_quadratic_eval': return evaluateMathBlock('quadraticEval', {coeffs: jsonValue(args.COEFFS, []), x: args.X});
        case 'xeduhub_chunk_over_size': return bytesLength(args.CHUNK) > Number(args.SIZE || 0);
        case 'xeduhub_http_get': return this._httpGet(args.URL);
        case 'xeduhub_http_open_stream': return this._httpGet(args.URL, true);
        case 'xeduhub_http_iter_chunks': return this._lastValue;
        case 'xeduhub_http_loop_stream_frames': return this._lastValue;
        case 'xeduhub_http_send_command': return this._sendDeviceCommand(args);
        case 'xeduhub_k10_gpio_write': return this._sendDeviceCommand({BASE_URL: this._deviceBase(), CMD: {pin: args.PIN, value: args.VALUE}});
        case 'xeduhub_k10_pwm_write': return this._sendDeviceCommand({BASE_URL: this._deviceBase(), CMD: {pin: args.PIN, duty: args.DUTY, frequency: args.FREQ}});
        case 'xeduhub_k10_uart_send': return this._sendDeviceCommand({BASE_URL: this._deviceBase(), CMD: {port: args.PORT, text: args.TEXT}});
        case 'xeduhub_servo_setup': this._lastValue = {board: args.BOARD, pin: args.PIN, type: 'servo'}; return this._lastValue;
        case 'xeduhub_servo_write_angle': return this._sendDeviceCommand({BASE_URL: this._deviceBase(), CMD: {servo: args.SERVO_VAR, angle: args.ANGLE}});
        case 'xeduhub_cv_open_camera': return this._openCamera(args.SOURCE);
        case 'xeduhub_cv_open_video': this._lastValue = {type: 'video', source: stringValue(args.SOURCE)}; return this._lastValue;
        case 'xeduhub_cv_loop_frames': return this._lastValue;
        case 'xeduhub_cv_show_frame': return this._lastValue = args.FRAME;
        case 'xeduhub_cv_decode_chunk': this._lastValue = this._decodeChunk(args.CHUNK); return this._lastValue;
        case 'xeduhub_decode_chunk_image': return this._decodeChunk(args.CHUNK);
        case 'xeduhub_cv_draw_boxes': this._lastValue = {operation: 'draw_boxes', image: args.IMAGE, boxes: args.BOXES}; return this._lastValue;
        case 'xeduhub_draw_boxes_image': return {operation: 'draw_boxes', image: args.IMAGE, boxes: args.BOXES};
        case 'xeduhub_cv_cvt_color': return this._imageOperation('cvtColor', args);
        case 'xeduhub_cv_resize_image': return this._imageOperation('resize', args);
        case 'xeduhub_cv_crop_image': return this._imageOperation('crop', args);
        case 'xeduhub_cv_flip_image': return this._imageOperation('flip', args);
        case 'xeduhub_cv_rotate_image': return this._imageOperation('rotate', args);
        case 'xeduhub_cv_gaussian_blur': return this._imageOperation('gaussianBlur', args);
        case 'xeduhub_cv_canny': return this._imageOperation('canny', args);
        case 'xeduhub_cv_threshold': return this._imageOperation('threshold', args);
        case 'xeduhub_cv_put_text': return this._imageOperation('putText', args);
        case 'xeduhub_cv_save_image': return this._lastValue = {operation: 'save', image: args.IMAGE, path: args.PATH};
        case 'xeduhub_media_frames_to_video': return this._lastValue = {operation: 'framesToVideo', directory: args.OUTPUT_DIR, output: args.OUTPUT_VIDEO, fps: args.FPS};
        case 'xeduhub_debug_print':
        case 'xeduhub_print_status': this._lastValue = args.VALUE || 'XEduHub workflow ready'; return this._lastValue;
        case 'xeduhub_catch_error': return this._lastError;
        default: return this._lastValue;
        }
    }

    _apiBase () {
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search || '');
            const value = params.get('apiBase') || window.xeduApiBase;
            if (value) return String(value).replace(/\/$/, '');
            if (window.location.origin && window.location.origin !== 'null') return window.location.origin;
        }
        return 'http://127.0.0.1:5123';
    }

    _projectRoot () {
        if (typeof window === 'undefined') return '';
        return new URLSearchParams(window.location.search || '').get('projectRoot') || '';
    }

    async _runTask (requestedTaskId, args = {}) {
        const taskId = LEGACY_TASK_ALIASES[stringValue(requestedTaskId).toLowerCase()] || requestedTaskId;
        const spec = buildTaskSpec(taskId, {...args, IMAGE: args.IMAGE || args.INPUT || args.INPUT_DATA || this._input});
        try {
            const response = await requestXEduApi(`${this._apiBase()}/api/resources/xeduhub/execute`, {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({code: '', spec, project_root: this._projectRoot()}),
            });
            const payload = await response.json();
            this._lastRawResult = payload;
            this._lastResult = summarizeXEduPayload(payload);
            if (this.moduleKey) this._resultsByExtension[this.moduleKey] = payload;
            this._lastError = payload.success === false ? this._lastResult : '';
            return this._lastResult;
        } catch (error) {
            this._lastRawResult = null;
            this._lastError = error?.message || 'XEdu 请求失败';
            this._lastResult = this._lastError;
            return this._lastResult;
        }
    }

    _modulePayload () {
        if (SENSING_TASKS[this.moduleKey]) return this._sensingSession().result(SENSING_TASKS[this.moduleKey]);
        return this._resultsByExtension[this.moduleKey] || null;
    }

    _sensingSession () {
        return getStageSensingSession(this.runtime, {apiBase: () => this._apiBase(), projectRoot: () => this._projectRoot()});
    }

    _enableSensing () {
        const taskId = SENSING_TASKS[this.moduleKey];
        return taskId ? this._sensingSession().enable(taskId) : '';
    }

    _sensingReady () {
        const taskId = SENSING_TASKS[this.moduleKey];
        return taskId ? this._sensingSession().isReady(taskId) : false;
    }

    _setKeypointOverlay (visible) {
        const taskId = SENSING_TASKS[this.moduleKey];
        if (!taskId) return '';
        if (visible) return this._sensingSession().showKeypoints(taskId);
        this._sensingSession().hideKeypoints(taskId);
        return '';
    }

    _moduleSummary () {
        const payload = this._modulePayload();
        return payload ? summarizeXEduPayload(payload) : '';
    }

    _modulePreview () {
        const payload = this._modulePayload();
        return payload?.result_artifacts?.preview_image || payload?.artifacts?.image_data || '';
    }

    _output () {
        const payload = this._modulePayload();
        return payload?.result?.output ?? payload?.output ?? payload?.result ?? null;
    }

    _keyFields () {
        return this._modulePayload()?.result_artifacts?.key_fields || {};
    }

    _resultValue (...keys) {
        const output = this._output();
        if (!output || typeof output !== 'object' || Array.isArray(output)) return undefined;
        for (const key of keys) {
            if (output[key] !== undefined) return output[key];
        }
        return undefined;
    }

    _resultList (...keys) {
        const output = this._output();
        if (Array.isArray(output)) return output;
        const value = this._resultValue(...keys);
        return Array.isArray(value) ? value : [];
    }

    _oneBasedIndex (value) {
        return Math.max(0, Math.floor(Number(value) || 1) - 1);
    }

    _classification () {
        const fields = this._keyFields();
        const output = this._output();
        const first = Array.isArray(output) ? output[0] : output;
        const source = first && typeof first === 'object' ? first : {};
        return {
            label: String(fields['预测类别'] ?? source['预测类别'] ?? source.label ?? source.class ?? ''),
            confidence: Number(fields['分数'] ?? source['分数'] ?? source.score ?? source.confidence ?? 0) || 0,
        };
    }

    _detections (target = '*') {
        const output = this._output();
        let values = Array.isArray(output) ? output : this._resultList('检测框', 'boxes', 'bboxes', 'predictions', 'detections');
        const requested = stringValue(target, '*').toLowerCase();
        if (requested === '*' || requested === '全部' || requested === '所有') return values;
        values = values.filter(item => this._detectionLabel(item).toLowerCase() === requested);
        return values;
    }

    _detectionLabel (item) {
        if (!item || typeof item !== 'object') return '';
        return String(item.label ?? item.class ?? item.className ?? item.name ?? item['类别'] ?? '');
    }

    _detectionConfidence (item) {
        if (!item || typeof item !== 'object') return 0;
        return Number(item.score ?? item.confidence ?? item.probability ?? item['置信度'] ?? 0) || 0;
    }

    _detectionBox (item) {
        if (Array.isArray(item)) return item;
        if (!item || typeof item !== 'object') return [];
        return item.bbox || item.box || item['检测框'] || [item.x1, item.y1, item.x2, item.y2];
    }

    _boxPosition (box, position) {
        if (!Array.isArray(box) || box.length < 4) return 0;
        const [x1, y1, x2, y2] = box.map(value => Number(value) || 0);
        switch (position) {
        case 'centerY': return this._toStageY((y1 + y2) / 2);
        case 'width': return this._toStageWidth(Math.abs(x2 - x1));
        case 'height': return this._toStageHeight(Math.abs(y2 - y1));
        default: return this._toStageX((x1 + x2) / 2);
        }
    }

    _points () {
        const points = this._resultList('关键点坐标', '关键点', 'keypoints', 'points');
        if (points.length === 1 && Array.isArray(points[0])) return points[0];
        return points;
    }

    _pointAxis (index, axis) {
        const point = this._points()[this._oneBasedIndex(index)];
        const value = Array.isArray(point) ? Number(point[String(axis).toLowerCase() === 'y' ? 1 : 0]) || 0 : Number(point?.[String(axis).toLowerCase()]) || 0;
        return String(axis).toLowerCase() === 'y' ? this._toStageY(value) : this._toStageX(value);
    }

    _frameSize () {
        const taskId = SENSING_TASKS[this.moduleKey];
        return taskId ? this._sensingSession().frameSize(taskId) : {width: 0, height: 0};
    }

    _toStageX (value) {
        const {width} = this._frameSize();
        return width ? (Number(value) / width) * 480 - 240 : Number(value) || 0;
    }

    _toStageY (value) {
        const {height} = this._frameSize();
        return height ? 180 - (Number(value) / height) * 360 : Number(value) || 0;
    }

    _toStageWidth (value) {
        const {width} = this._frameSize();
        return width ? (Number(value) / width) * 480 : Number(value) || 0;
    }

    _toStageHeight (value) {
        const {height} = this._frameSize();
        return height ? (Number(value) / height) * 360 : Number(value) || 0;
    }

    _texts () {
        const output = this._output();
        const values = Array.isArray(output) ? output : this._resultList('文本', 'texts', 'text');
        return values.map(item => {
            if (typeof item === 'string') return item;
            if (Array.isArray(item)) return String(item[0] ?? '');
            return String(item?.text ?? item?.['文字'] ?? '');
        }).filter(Boolean);
    }

    _readResultField (result, field) {
        const source = result || this._lastRawResult || {};
        return String(field || 'result_summary').split('.').reduce((value, key) => value == null ? '' : value[key], source) ?? '';
    }

    _firstBox (result) {
        const source = result?.result ?? result?.output ?? result;
        if (Array.isArray(source)) return source[0] || '';
        return source?.boxes?.[0] || source?.predictions?.[0]?.bbox || '';
    }

    _firstText (result) {
        const source = result?.result ?? result?.output ?? result;
        if (Array.isArray(source)) return String(source[0] || '');
        return String(source?.texts?.[0] || source?.text?.[0] || source?.text || '');
    }

    _keypointAxis (points, index, axis) {
        const value = jsonValue(points, []);
        const point = Array.isArray(value) ? value[Number(index) || 0] : null;
        if (Array.isArray(point)) return Number(point[String(axis).toLowerCase() === 'y' ? 1 : 0]) || 0;
        return Number(point?.[String(axis).toLowerCase()]) || 0;
    }

    _imageOperation (operation, args) {
        const value = {operation, source: args.IMAGE || '', ...args};
        this._lastValue = value;
        return value;
    }

    _decodeChunk (chunk) {
        const text = stringValue(chunk);
        if (!text) return '';
        if (text.startsWith('data:')) return text;
        const base64 = typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(text))) : '';
        return base64 ? `data:image/jpeg;base64,${base64}` : text;
    }

    async _httpGet (url, stream = false) {
        try {
            const response = await fetch(stringValue(url));
            const value = stream ? {type: 'stream', url: stringValue(url), status: response.status} : await response.text();
            this._lastValue = value;
            return value;
        } catch (error) {
            this._lastError = error?.message || '网络请求失败';
            return this._lastError;
        }
    }

    async _sendDeviceCommand (args) {
        const base = stringValue(args.BASE_URL || this._deviceBase());
        if (!base) return '';
        try {
            const response = await fetch(base.replace(/\/$/, '') + '/command', {
                method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({command: args.CMD}),
            });
            this._lastValue = await response.text();
            return this._lastValue;
        } catch (error) {
            this._lastError = error?.message || '设备指令失败';
            return this._lastError;
        }
    }

    _deviceBase () {
        if (typeof window === 'undefined') return '';
        return new URLSearchParams(window.location.search || '').get('deviceBase') || '';
    }

    _stopMediaStream (stream) {
        if (!stream || typeof stream.getTracks !== 'function') return;
        for (const track of stream.getTracks()) {
            try {
                track.stop();
            } catch (_) {
                // ignore individual track shutdown failures
            }
        }
    }

    _releaseTrackedCameraStreams () {
        if (!(this._cameraStreams instanceof Set)) return;
        for (const stream of this._cameraStreams) {
            this._stopMediaStream(stream);
        }
        this._cameraStreams.clear();
    }

    _releaseCameraResources () {
        this._sensingSession().disableCamera();
        const streams = new Set();
        if (this._lastValue?.stream) {
            streams.add(this._lastValue.stream);
        }
        if (this._cameraStreams instanceof Set) {
            for (const stream of this._cameraStreams) {
                streams.add(stream);
            }
            this._cameraStreams.clear();
        }
        for (const stream of streams) {
            this._stopMediaStream(stream);
        }
        if (this._lastValue?.type === 'camera') {
            this._lastValue = {type: 'camera', source: this._lastValue.source};
        }
    }

    async _openCamera (source) {
        if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
            try {
                this._releaseTrackedCameraStreams();
                const stream = await navigator.mediaDevices.getUserMedia({video: {deviceId: String(source || 0)}});
                this._cameraStreams.add(stream);
                this._lastValue = {type: 'camera', source, stream};
                return this._lastValue;
            } catch (error) {
                this._lastError = error?.message || '摄像头不可用';
            }
        }
        this._lastValue = {type: 'camera', source};
        return this._lastValue;
    }
}

for (const opcode of [...Object.keys(TASK_BLOCKS), ...createXEduBlockInfo().blocks.map(block => block.opcode)]) {
    if (!Scratch3XEduAI.prototype[opcode]) {
        Scratch3XEduAI.prototype[opcode] = function (args, util) {
            return this._dispatch(opcode, args, util);
        };
    }
}

module.exports = Scratch3XEduAI;
