const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const guiRoot = path.join(root, 'node_modules', '@scratch', 'scratch-gui');
const sourceBuild = path.join(guiRoot, 'dist');
const targetBuild = path.join(root, 'build');

if (!fs.existsSync(sourceBuild)) {
  throw new Error(`Scratch GUI build output not found: ${sourceBuild}`);
}

fs.rmSync(targetBuild, { recursive: true, force: true });
fs.cpSync(sourceBuild, targetBuild, {
  recursive: true,
  filter: (source) => {
    const relative = path.relative(sourceBuild, source).replace(/\\/g, '/');
    if (!relative) return true;
    if (relative.endsWith('.map')) return false;
    if (relative === 'scratch-gui.js' || relative === 'scratch-gui.js.LICENSE.txt') return false;
    return true;
  }
});
fs.writeFileSync(path.join(targetBuild, 'index.html'), `<!doctype html>
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
    const boot = () => {
      const GUI = window.GUI;
      if (!GUI) {
        showStatus('Scratch GUI 加载失败', 0);
        return;
      }
      const appTarget = document.getElementById('app');
      const projectInfo = getProjectInfo();
      GUI.setAppElement(appTarget);
      const state = new GUI.EditorState({});
      const root = GUI.createStandaloneRoot(state, appTarget);
      root.render({
        canEditTitle: false,
        menuBarHidden: true,
        backpackVisible: false,
        showComingSoon: false,
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
console.log(`[xedu-scratch] copied ${sourceBuild} -> ${targetBuild}`);
