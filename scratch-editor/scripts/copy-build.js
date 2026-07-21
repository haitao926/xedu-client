const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const guiRoot = path.join(root, 'node_modules', '@scratch', 'scratch-gui');
const sourceBuild = path.join(guiRoot, 'dist');
const targetBuild = path.join(root, 'build');
const stagingBuild = path.join(root, `.build-staging-${process.pid}`);
const staleBuild = path.join(root, `.build-stale-${process.pid}-${Date.now()}`);
const scratchPublicPath = '/api/scratch-editor/';

if (!fs.existsSync(sourceBuild)) {
  throw new Error(`Scratch GUI build output not found: ${sourceBuild}`);
}

const shouldCopy = (source) => {
  const relative = path.relative(sourceBuild, source).replace(/\\/g, '/');
  if (!relative) return true;
  if (relative.endsWith('.map')) return false;
  if (relative === 'scratch-gui.js' || relative === 'scratch-gui.js.LICENSE.txt') return false;
  return true;
};

const linkBuildTree = (source, target) => {
  if (!shouldCopy(source)) return;
  const entry = fs.lstatSync(source);
  if (entry.isDirectory()) {
    fs.mkdirSync(target, { recursive: true });
    for (const child of fs.readdirSync(source)) {
      linkBuildTree(path.join(source, child), path.join(target, child));
    }
    return;
  }
  if (source.endsWith('.js') || source.endsWith('.css')) {
    fs.copyFileSync(source, target);
    return;
  }
  try {
    fs.linkSync(source, target);
  } catch (error) {
    if (!['EXDEV', 'EPERM', 'EEXIST'].includes(error?.code)) throw error;
    fs.copyFileSync(source, target);
  }
};

const walkFiles = (directory) => {
  const files = [];
  for (const name of fs.readdirSync(directory)) {
    const target = path.join(directory, name);
    const entry = fs.lstatSync(target);
    if (entry.isDirectory()) files.push(...walkFiles(target));
    else files.push(target);
  }
  return files;
};

const stripExternalSourceMapReferences = (content) => content
  .replace(/(?:\r?\n)?\/\/[#@]\s*sourceMappingURL=(?!data:)[^\r\n]*/g, '')
  .replace(/(?:\r?\n)?\/\*[#@]\s*sourceMappingURL=(?!data:)[^*]+\*\//g, '');

const patchScratchRuntime = (bundlePath) => {
  let content = fs.readFileSync(bundlePath, 'utf8');
  const workerRuntimePattern = /(__nested_webpack_require_\d+__)\.u\s*=\s*function\s*\([^)]*\)\s*\{\s*return\s*["'](chunks\/fetch-worker\.[^"']+\.js)["'];?\s*\}/g;
  const workerRuntimeIds = [...content.matchAll(workerRuntimePattern)].map((match) => match[1]);
  if (!workerRuntimeIds.length) {
    throw new Error('Scratch fetch-worker runtime structure was not recognized');
  }

  for (const runtimeId of new Set(workerRuntimeIds)) {
    const escapedRuntimeId = runtimeId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const publicPathPattern = new RegExp(`(${escapedRuntimeId}\\.p\\s*=\\s*)(["'])\\/\\2`, 'g');
    let replacementCount = 0;
    content = content.replace(publicPathPattern, (_match, prefix, quote) => {
      replacementCount += 1;
      return `${prefix}${quote}${scratchPublicPath}${quote}`;
    });
    if (replacementCount !== 1) {
      throw new Error(`Scratch fetch-worker public path was expected once for ${runtimeId}, found ${replacementCount}`);
    }
  }

  content = content.replace(
    /(solutionPath\s*:\s*)(["'])\/chunks\/mediapipe\/face_detection\2/g,
    (_match, prefix, quote) => `${prefix}${quote}${scratchPublicPath}chunks/mediapipe/face_detection${quote}`,
  );
  fs.writeFileSync(bundlePath, stripExternalSourceMapReferences(content), 'utf8');
};

fs.rmSync(stagingBuild, { recursive: true, force: true });
linkBuildTree(sourceBuild, stagingBuild);
const standaloneBundle = path.join(stagingBuild, 'scratch-gui-standalone.js');
if (!fs.existsSync(standaloneBundle)) {
  throw new Error(`Scratch standalone bundle not found: ${standaloneBundle}`);
}
patchScratchRuntime(standaloneBundle);
for (const assetPath of walkFiles(stagingBuild)) {
  if (assetPath === standaloneBundle || (!assetPath.endsWith('.js') && !assetPath.endsWith('.css'))) continue;
  const content = fs.readFileSync(assetPath, 'utf8');
  const cleaned = stripExternalSourceMapReferences(content);
  if (cleaned !== content) fs.writeFileSync(assetPath, cleaned, 'utf8');
}
fs.writeFileSync(path.join(stagingBuild, 'index.html'), `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>XEdu Scratch</title>
  <style>
    html, body, #app { width: 100%; height: 100%; margin: 0; overflow: hidden; }
    body { background: #4d97ff; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    #app [class*="gui_menu-bar-position_"],
    #app [class*="menu-bar_menu-bar_"] { display: none !important; height: 0 !important; min-height: 0 !important; overflow: hidden !important; }
    #app [class*="gui_body-wrapper_"] { height: 100% !important; }
    #xedu-scratch-status { position: fixed; right: 16px; bottom: 16px; z-index: 10000; max-width: 360px; padding: 10px 12px; border-radius: 10px; background: rgba(15, 23, 42, .9); color: #fff; font-size: 13px; box-shadow: 0 12px 28px rgba(15, 23, 42, .25); display: none; }
    #xedu-scratch-status.is-visible { display: block; }
  </style>
</head>
<body>
  <div id="app"></div>
  <div id="xedu-scratch-status" role="status"></div>
  <script src="./scratch-gui-standalone.js"></script>
  <script>
  (() => {
    const params = new URLSearchParams(window.location.search || '');
    const statusEl = document.getElementById('xedu-scratch-status');
    const showStatus = (message, timeout = 2600) => {
      if (!statusEl || !message) return;
      statusEl.textContent = message;
      statusEl.classList.add('is-visible');
      if (timeout > 0) window.setTimeout(() => statusEl.classList.remove('is-visible'), timeout);
    };
    const getApiBase = () => {
      const explicit = params.get('apiBase');
      if (explicit) return explicit.replace(/\\/$/, '');
      if (window.location.origin && window.location.origin !== 'null') return window.location.origin;
      return 'http://127.0.0.1:5123';
    };
    const getScratchAssetHost = () => getApiBase() + '/api/scratch-assets';
    const getProjectInfo = () => {
      const rootToken = params.get('rootToken');
      const project = (params.get('project') || '').replace(/^\\/+/, '');
      if (!rootToken || !project || !project.toLowerCase().endsWith('.sb3')) return null;
      return {
        host: getApiBase() + '/api/resources/scratch-project/' + encodeURIComponent(rootToken),
        id: project.split('/').map(encodeURIComponent).join('/')
      };
    };
    const getProjectUrl = () => {
      const info = getProjectInfo();
      return info ? info.host + '/' + info.id : '';
    };
    const notifyProjectAccessExpired = () => {
      const bridgeToken = params.get('bridgeToken');
      if (!bridgeToken || window.parent === window) return;
      window.parent.postMessage({
        type: 'xedu:scratch-project-access-expired',
        bridgeToken
      }, '*');
    };
    const verifyProjectAccess = async () => {
      const projectUrl = getProjectUrl();
      if (!projectUrl) return true;
      try {
        const response = await fetch(projectUrl, {method: 'HEAD', cache: 'no-store'});
        if (response.status === 410) {
          showStatus('Scratch 项目访问已过期，正在重新连接…', 0);
          notifyProjectAccessExpired();
          return false;
        }
        if (!response.ok) {
          showStatus('Scratch 项目加载失败（HTTP ' + response.status + '）', 0);
          return false;
        }
        return true;
      } catch (_) {
        showStatus('Scratch 项目连接失败，请返回课程后重新打开。', 0);
        return false;
      }
    };
    const saveXEduProject = (id, vmState, saveParams, state) => {
      void vmState;
      void saveParams;
      const projectUrl = getProjectUrl();
      const vm = state && state.store && state.store.getState().scratchGui.vm;
      if (!projectUrl || !vm || !vm.saveProjectSb3) return Promise.resolve({id: id || '0'});
      showStatus('正在保存 Scratch 项目…', 0);
      return vm.saveProjectSb3()
        .then(blob => fetch(projectUrl, {
          method: 'PUT',
          headers: {'Content-Type': 'application/x.scratch.sb3'},
          body: blob
        }))
        .then(response => response.json().then(payload => ({response, payload})))
        .then(({response, payload}) => {
          if (!response.ok || !payload.success) {
            throw new Error(payload.message || 'Scratch 项目保存失败');
          }
          showStatus('Scratch 项目已保存');
          return {id: id || '0'};
        })
        .catch(error => {
          showStatus(error && error.message ? error.message : 'Scratch 项目保存失败', 5000);
          throw error;
        });
    };
    // The standalone bundle is bootstrapped here instead of through Scratch's playground entry,
    // so the host file-operation bridge must be bound by this page.
    const getScratchProjectTitle = (state) => {
      const title = String(state.store.getState().scratchGui.projectTitle || '').trim();
      return title || 'Scratch作品';
    };
    const downloadScratchBlob = (filename, blob) => {
      const link = document.createElement('a');
      document.body.appendChild(link);
      const url = window.URL.createObjectURL(blob);
      link.href = url;
      link.download = filename;
      link.type = blob.type;
      link.click();
      window.setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }, 1000);
    };
    const saveScratchProjectToCurrentFile = async (state) => {
      const projectInfo = getProjectInfo();
      if (!projectInfo) throw new Error('当前 Scratch 页面没有绑定可保存的项目文件。');
      await saveXEduProject(projectInfo.id, null, null, state);
      return true;
    };
    const createNewScratchProject = async (state) => {
      if (Boolean(state.store.getState().scratchGui.projectChanged)) {
        if (!window.confirm('新建项目会替换当前内容，是否继续？')) return false;
      }
      if (typeof window.GUI?.requestNewProject !== 'function') {
        throw new Error('Scratch 新建项目功能不可用。');
      }
      state.store.dispatch(window.GUI.requestNewProject(false));
      return true;
    };
    const normalizeProjectBuffer = (buffer) => {
      if (buffer instanceof ArrayBuffer) return buffer;
      if (ArrayBuffer.isView(buffer)) {
        return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
      }
      return null;
    };
    const importScratchProject = async (state, { buffer, fileName = '' } = {}) => {
      const scratchState = state.store.getState().scratchGui;
      if (!scratchState?.vm) throw new Error('Scratch 还没有准备好。');
      const projectBuffer = normalizeProjectBuffer(buffer);
      if (!projectBuffer) throw new Error('Scratch 项目文件读取失败。');
      if (scratchState.projectChanged && !window.confirm('从电脑打开会替换当前内容，是否继续？')) {
        return false;
      }
      const GUI = window.GUI;
      const loadingState = scratchState.projectState.loadingState;
      const uploadAction = typeof GUI?.requestProjectUpload === 'function'
        ? GUI.requestProjectUpload(loadingState)
        : null;
      if (uploadAction) state.store.dispatch(uploadAction);
      const uploadLoadingState = state.store.getState().scratchGui.projectState.loadingState;
      if (typeof GUI?.openLoadingProject === 'function') state.store.dispatch(GUI.openLoadingProject());
      let success = false;
      try {
        await scratchState.vm.loadProject(projectBuffer);
        success = true;
        return true;
      } catch (error) {
        showStatus('项目文件加载失败，请确认选择的是有效的 Scratch 项目。', 5000);
        throw error;
      } finally {
        if (typeof GUI?.onLoadedProject === 'function') {
          const loadedAction = GUI.onLoadedProject(uploadLoadingState, Boolean(getProjectInfo()), success);
          if (loadedAction) state.store.dispatch(loadedAction);
        }
        if (typeof GUI?.closeLoadingProject === 'function') state.store.dispatch(GUI.closeLoadingProject());
      }
    };
    const uploadScratchProjectFromComputer = (state) => new Promise((resolve, reject) => {
      const scratchState = state.store.getState().scratchGui;
      if (!scratchState?.vm) {
        reject(new Error('Scratch 还没有准备好。'));
        return;
      }
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.sb,.sb2,.sb3';
      input.style.display = 'none';
      document.body.appendChild(input);
      const cleanup = () => {
        input.value = '';
        input.remove();
      };
      input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file) {
          cleanup();
          resolve(false);
          return;
        }
        try {
          resolve(await importScratchProject(state, {
            buffer: await file.arrayBuffer(),
            fileName: file.name,
          }));
        } catch (error) {
          reject(error);
        } finally {
          cleanup();
        }
      }, {once: true});
      input.click();
    });
    const downloadScratchProjectToComputer = async (state) => {
      const vm = state.store.getState().scratchGui.vm;
      if (!vm?.saveProjectSb3) throw new Error('Scratch 还没有准备好。');
      downloadScratchBlob(getScratchProjectTitle(state) + '.sb3', await vm.saveProjectSb3());
      return true;
    };
    const createXEduScratchBridge = (state) => ({
      getState: () => ({
        canSave: Boolean(getProjectInfo()),
        projectTitle: getScratchProjectTitle(state)
      }),
      newProject: () => createNewScratchProject(state),
      saveProject: () => saveScratchProjectToCurrentFile(state),
      uploadProject: () => uploadScratchProjectFromComputer(state),
      downloadProject: () => downloadScratchProjectToComputer(state),
      importProjectFromHost: ({ buffer, fileName }) => importScratchProject(state, { buffer, fileName })
    });
    const bindXEduScratchHostBridge = (state, bridge) => {
      const bridgeToken = params.get('bridgeToken') || '';
      if (!bridgeToken || window.parent === window) return;
      const send = (payload) => window.parent.postMessage({...payload, bridgeToken}, '*');
      const sendState = () => send({type: 'xedu:scratch-host-state', state: bridge.getState()});
      window.addEventListener('message', async (event) => {
        const request = event.data;
        if (event.source !== window.parent || request?.bridgeToken !== bridgeToken) return;
        if (request?.type === 'xedu:scratch-host-state-request') {
          sendState();
          return;
        }
        if (request?.type === 'xedu:scratch-host-upload-project') {
          try {
            const result = await bridge.importProjectFromHost({
              buffer: request.buffer,
              fileName: request.fileName,
            });
            send({type: 'xedu:scratch-host-action-result', requestId: request.requestId, result});
            sendState();
          } catch (error) {
            send({type: 'xedu:scratch-host-action-result', requestId: request.requestId, error: error?.message || 'Scratch 文件操作失败'});
          }
          return;
        }
        if (request?.type !== 'xedu:scratch-host-action') return;
        const actionMap = {new: 'newProject', save: 'saveProject', upload: 'uploadProject', download: 'downloadProject'};
        const handler = bridge[actionMap[request.action]];
        if (typeof handler !== 'function') {
          send({type: 'xedu:scratch-host-action-result', requestId: request.requestId, error: '当前 Scratch 页面暂不支持这个操作。'});
          return;
        }
        try {
          const result = await handler();
          send({type: 'xedu:scratch-host-action-result', requestId: request.requestId, result});
          sendState();
        } catch (error) {
          send({type: 'xedu:scratch-host-action-result', requestId: request.requestId, error: error?.message || 'Scratch 文件操作失败'});
        }
      });
      sendState();
    };
    const boot = async () => {
      const GUI = window.GUI;
      if (!GUI) {
        showStatus('Scratch GUI 加载失败', 0);
        return;
      }
      const appTarget = document.getElementById('app');
      const projectInfo = getProjectInfo();
      if (!(await verifyProjectAccess())) return;
      window.__XEDU_SCRATCH_ASSET_HOST__ = getScratchAssetHost();
      GUI.setAppElement(appTarget);
      const state = new GUI.EditorState({});
      const root = GUI.createStandaloneRoot(state, appTarget);
      const xeduScratchBridge = createXEduScratchBridge(state);
      window.__xeduScratchBridge__ = xeduScratchBridge;
      bindXEduScratchHostBridge(state, xeduScratchBridge);
      root.render({
        canEditTitle: false,
        menuBarHidden: true,
        backpackVisible: false,
        showComingSoon: false,
        assetHost: getScratchAssetHost(),
        canSave: Boolean(projectInfo),
        projectHost: projectInfo ? projectInfo.host : undefined,
        projectId: projectInfo ? projectInfo.id : '0',
        onUpdateProjectData: (id, vmState, saveParams) => saveXEduProject(id, vmState, saveParams, state)
      });
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  })();
  </script>
</body>
</html>
`, 'utf8');
if (fs.existsSync(targetBuild)) {
  fs.renameSync(targetBuild, staleBuild);
}
fs.renameSync(stagingBuild, targetBuild);
if (fs.existsSync(staleBuild)) {
  const { spawn } = require('child_process');
  const cleanup = spawn(process.execPath, [
    '-e',
    'require("fs").rmSync(process.argv[1], { recursive: true, force: true });',
    staleBuild,
  ], { detached: true, stdio: 'ignore' });
  cleanup.unref();
}
console.log(`[xedu-scratch] copied ${sourceBuild} -> ${targetBuild}`);
