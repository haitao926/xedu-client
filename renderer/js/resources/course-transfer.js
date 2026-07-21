const POLL_PHASE_STATES = new Set(['preparing', 'downloading', 'extracting', 'validating']);
const WRITING_PHASE_STATES = new Set(['backing_up', 'writing']);

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function operationMessage(operation) {
  const parts = [];
  if (operation?.message) parts.push(operation.message);
  if (Number.isFinite(operation?.percent)) parts.push(`${operation.percent}%`);
  if (operation?.total_files) {
    parts.push(`${operation.completed_files || 0}/${operation.total_files} 个文件`);
  }
  return parts.join(' · ') || '正在处理课程...';
}

function operationUiState(operation) {
  if (WRITING_PHASE_STATES.has(operation?.phase)) return 'writing';
  if (POLL_PHASE_STATES.has(operation?.phase)) return 'downloading';
  return 'downloading';
}

function errorMessage(error, fallback) {
  if (typeof error?.details === 'string' && error.details) {
    try {
      const payload = JSON.parse(error.details);
      if (typeof payload?.message === 'string' && payload.message.trim()) {
        return payload.message.trim();
      }
    } catch (_) {
      // Keep the original error when details are not JSON.
    }
  }
  return error?.message || fallback;
}

export async function runCourseTransferFlow({
  apiClient,
  endpoint,
  payload = {},
  setImportStatus = () => {},
  pollIntervalMs = 500,
  maxPollErrors = 3,
  initialStatus = null,
  sleep = delay,
} = {}) {
  const response = await apiClient.post(endpoint, { ...payload, async: true });
  if (!response?.success) {
    throw new Error(response?.message || '课程导入失败');
  }
  if (!response.operation_id) {
    if (Array.isArray(initialStatus) && initialStatus.length >= 2) {
      setImportStatus(initialStatus[0], initialStatus[1]);
    }
    return response;
  }
  if (typeof apiClient.get !== 'function') {
    throw new Error('当前 API 客户端不支持查询导入进度');
  }

  let pollErrors = 0;
  while (true) {
    let pollResponse;
    try {
      pollResponse = await apiClient.get(
        `/api/resources/operations/${encodeURIComponent(response.operation_id)}`,
      );
      pollErrors = 0;
    } catch (error) {
      pollErrors += 1;
      if (pollErrors > maxPollErrors) {
        throw new Error(errorMessage(error, '查询课程导入进度失败'));
      }
      await sleep(pollIntervalMs);
      continue;
    }

    if (!pollResponse?.success || !pollResponse.operation) {
      throw new Error(pollResponse?.message || '查询课程导入进度失败');
    }
    const operation = pollResponse.operation;
    if (operation.state === 'success') {
      if (!operation.result?.success) {
        throw new Error(operation.error || operation.message || '课程导入失败');
      }
      return operation.result;
    }
    if (operation.state === 'error') {
      throw new Error(operation.error || operation.message || '课程导入失败');
    }

    setImportStatus(operationUiState(operation), operationMessage(operation), operation);
    await sleep(pollIntervalMs);
  }
}

export function getCourseTransferStatusState(operation) {
  return operationUiState(operation);
}
