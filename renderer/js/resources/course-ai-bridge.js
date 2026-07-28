const REQUEST_TYPE = 'xedu:course-ai-request';
const RESPONSE_TYPE = 'xedu:course-ai-response';
const POSE_TASK_ID = 'pose_body17';
const EXECUTE_PATH = '/api/resources/xeduhub/execute';
const MAX_FRAME_DATA_URL_LENGTH = 900 * 1024;

function resolveTrustedOrigin(frameUrl) {
  try {
    const parsed = new URL(String(frameUrl || ''));
    const localHost = ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname);
    return parsed.protocol === 'http:' && localHost ? parsed.origin : '';
  } catch (_) {
    return '';
  }
}

function validateRequest(request) {
  if (!request || request.type !== REQUEST_TYPE) return '';
  if (typeof request.requestId !== 'string' || !request.requestId || request.requestId.length > 128) {
    return '姿态请求标识无效';
  }
  if (request.taskId !== POSE_TASK_ID) return '课程桥接仅支持人体关键点 17 检测';
  if (
    typeof request.frame !== 'string' ||
    !/^data:image\/(?:png|jpe?g|webp);base64,[a-z0-9+/=\s]+$/i.test(request.frame) ||
    request.frame.length > MAX_FRAME_DATA_URL_LENGTH
  ) {
    return '摄像头画面格式或大小无效';
  }
  return null;
}

export function createCourseAiFrameBridge({ windowObject = globalThis.window, requestApi } = {}) {
  let activeFrame = null;
  let activeOrigin = '';
  let inFlight = false;

  function postResponse(targetWindow, payload) {
    if (!targetWindow || !activeOrigin) return;
    try {
      targetWindow.postMessage({ type: RESPONSE_TYPE, ...payload }, activeOrigin);
    } catch (_) {
      // The iframe may have navigated away while inference was running.
    }
  }

  async function handleMessage(event) {
    const frameWindow = activeFrame?.contentWindow || null;
    if (!frameWindow || event.source !== frameWindow || event.origin !== activeOrigin) return;
    const request = event.data;
    if (request?.type !== REQUEST_TYPE) return;

    const validationError = validateRequest(request);
    if (validationError) {
      postResponse(frameWindow, { requestId: request?.requestId || '', error: validationError });
      return;
    }
    if (inFlight) {
      postResponse(frameWindow, { requestId: request.requestId, error: '上一帧仍在检测，请稍候' });
      return;
    }
    if (typeof requestApi !== 'function') {
      postResponse(frameWindow, { requestId: request.requestId, error: '本地姿态检测桥接不可用' });
      return;
    }

    inFlight = true;
    try {
      const response = await requestApi({
        path: EXECUTE_PATH,
        method: 'POST',
        body: JSON.stringify({
          code: '',
          project_root: '',
          spec: { task_id: POSE_TASK_ID, input: request.frame, params: { img_type: '' } },
        }),
      });
      postResponse(frameWindow, {
        requestId: request.requestId,
        status: response?.status || 502,
        headers: response?.headers || {},
        body: response?.body || '',
      });
    } catch (error) {
      postResponse(frameWindow, { requestId: request.requestId, error: error?.message || '本地姿态检测失败' });
    } finally {
      inFlight = false;
    }
  }

  windowObject?.addEventListener?.('message', handleMessage);

  return {
    attach(frame, frameUrl) {
      activeFrame = frame || null;
      activeOrigin = resolveTrustedOrigin(frameUrl);
      inFlight = false;
      return Boolean(activeFrame && activeOrigin);
    },
    detach(frame = null) {
      if (frame && frame !== activeFrame) return;
      activeFrame = null;
      activeOrigin = '';
      inFlight = false;
    },
    dispose() {
      windowObject?.removeEventListener?.('message', handleMessage);
      activeFrame = null;
      activeOrigin = '';
      inFlight = false;
    },
  };
}
