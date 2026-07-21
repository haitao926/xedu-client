import assert from "node:assert/strict";
import test from "node:test";

import apiClient from "../api.js";
import { createWorkspaceController } from "./workspace-context.js";

function createClassList(initial = []) {
  const values = new Set(initial);
  return {
    add(...tokens) {
      tokens.forEach((token) => values.add(token));
    },
    remove(...tokens) {
      tokens.forEach((token) => values.delete(token));
    },
    contains(token) {
      return values.has(token);
    },
    toggle(token, force) {
      if (force === undefined) {
        if (values.has(token)) {
          values.delete(token);
          return false;
        }
        values.add(token);
        return true;
      }
      if (force) {
        values.add(token);
        return true;
      }
      values.delete(token);
      return false;
    },
  };
}

function createElement(id, options = {}) {
  const listeners = new Map();
  const attributes = new Map();
  let innerHTML = "";
  let placeholderButton = null;
  const element = {
    id,
    style: {},
    dataset: {},
    hidden: false,
    open: false,
    disabled: false,
    textContent: "",
    contentWindow: options.contentWindow || null,
    classList: createClassList(options.classNames || []),
    addEventListener(type, handler, opts = {}) {
      const existing = listeners.get(type) || [];
      existing.push({ handler, once: Boolean(opts?.once) });
      listeners.set(type, existing);
    },
    dispatchEvent(type, event = {}) {
      const existing = listeners.get(type) || [];
      const keep = [];
      for (const entry of existing) {
        entry.handler({ target: element, currentTarget: element, ...event });
        if (!entry.once) {
          keep.push(entry);
        }
      }
      listeners.set(type, keep);
    },
    click() {
      element.dispatchEvent("click");
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    getAttribute(name) {
      return attributes.get(name) ?? null;
    },
    removeAttribute(name) {
      attributes.delete(name);
    },
    contains(target) {
      return target === element || target === placeholderButton;
    },
    querySelector(selector) {
      if (selector === "[data-scratch-placeholder-action]") {
        return placeholderButton;
      }
      return null;
    },
  };

  Object.defineProperty(element, "innerHTML", {
    get() {
      return innerHTML;
    },
    set(value) {
      innerHTML = String(value);
      placeholderButton = null;
      if (innerHTML.includes("data-scratch-placeholder-action")) {
        placeholderButton = createElement(`${id}-placeholder-button`);
        placeholderButton.disabled = /data-scratch-placeholder-action\s+disabled/.test(innerHTML);
      }
    },
  });

  return element;
}

function createFakeDocument() {
  const elements = new Map();
  const body = { classList: createClassList() };

  return {
    body,
    register(element) {
      elements.set(element.id, element);
      return element;
    },
    getElementById(id) {
      return elements.get(id) || null;
    },
    querySelectorAll(selector) {
      if (selector === "[data-scratch-host-action]") {
        return Array.from(elements.values()).filter((element) =>
          typeof element.getAttribute === "function"
          && element.getAttribute("data-scratch-host-action") !== null
        );
      }
      if (selector === ".nav-item") {
        return Array.from(elements.values()).filter((element) => element.classList.contains("nav-item"));
      }
      return [];
    },
    addEventListener() {},
  };
}

function createFakeTimers() {
  let nextId = 1;
  const tasks = new Map();

  return {
    install() {
      const originalSetTimeout = globalThis.setTimeout;
      const originalClearTimeout = globalThis.clearTimeout;
      globalThis.setTimeout = (callback, delay = 0) => {
        const id = nextId++;
        tasks.set(id, { callback, delay });
        return id;
      };
      globalThis.clearTimeout = (id) => {
        tasks.delete(id);
      };
      return () => {
        globalThis.setTimeout = originalSetTimeout;
        globalThis.clearTimeout = originalClearTimeout;
      };
    },
    findByDelay(predicate) {
      for (const [id, task] of tasks.entries()) {
        if (predicate(task.delay)) {
          return { id, ...task };
        }
      }
      return null;
    },
    countByDelay(delay) {
      return Array.from(tasks.values()).filter((task) => task.delay === delay).length;
    },
    has(id) {
      return tasks.has(id);
    },
    run(id) {
      const task = tasks.get(id);
      assert.ok(task, `Timer ${id} should exist`);
      tasks.delete(id);
      task.callback();
    },
  };
}

function createScratchHarness(options = {}) {
  const document = createFakeDocument();
  const frame = document.register(createElement("scratch-workspace-frame", {
    contentWindow: options.contentWindow || { postMessage() {} },
  }));
  const empty = document.register(createElement("scratch-workspace-empty"));
  const workspace = document.register(createElement("scratch-workspace", { classNames: ["active"] }));
  const navScratch = document.register(createElement("nav-scratch-item", { classNames: ["nav-item"] }));
  navScratch.style.display = "flex";
  document.register(createElement("nav-student-visual-item", { classNames: ["nav-item"] }));
  document.register(createElement("page-title"));
  document.register(createElement("page-subtitle"));
  document.register(createElement("top-bar-actions"));
  document.register(createElement("scratch-host-file-menu"));
  for (const action of options.scratchHostActions || []) {
    const item = createElement(`scratch-host-${action}`);
    item.setAttribute("data-scratch-host-action", action);
    document.register(item);
  }

  const windowListeners = new Map();
  const windowObject = {
    addEventListener(type, handler) {
      const handlers = windowListeners.get(type) || [];
      handlers.push(handler);
      windowListeners.set(type, handlers);
    },
    app: { ui: { showToast() {} } },
    xeduConfig: { apiBase: "http://127.0.0.1:5123" },
    electronAPI: options.electronAPI,
  };

  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  globalThis.window = windowObject;
  globalThis.document = document;

  const controller = createWorkspaceController({
    showTab(tabId) {
      workspace.classList.toggle("active", tabId === "scratch-workspace");
    },
    openNotebookFile: async () => {},
  });

  return {
    controller,
    document,
    empty,
    frame,
    window: windowObject,
    dispatchWindowMessage(event) {
      for (const handler of windowListeners.get("message") || []) {
        handler(event);
      }
    },
    restore() {
      globalThis.window = previousWindow;
      globalThis.document = previousDocument;
    },
  };
}

async function flushAsyncWork() {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
  await new Promise((resolve) => setImmediate(resolve));
}

test("Scratch iframe load timeout shows feedback and schedules an automatic retry", async () => {
  const timers = createFakeTimers();
  const restoreTimers = timers.install();
  const harness = createScratchHarness();
  const originalRequest = apiClient.request;

  apiClient.request = async () => new Response("{}", { status: 200 });

  try {
    harness.controller.openScratchWorkspace({ sourceLabel: "课程任务中心" });
    await flushAsyncWork();

    const loadTimeout = timers.findByDelay((delay) => delay > 2000);
    assert.ok(loadTimeout, "expected a load timeout timer for Scratch iframe");
    timers.run(loadTimeout.id);

    assert.equal(harness.frame.style.display, "none");
    assert.equal(harness.empty.style.display, "flex");
    assert.match(harness.empty.innerHTML, /Scratch 加载超时/);
    assert.match(harness.empty.innerHTML, /立即重试/);
    assert.equal(timers.countByDelay(2000), 1);
  } finally {
    apiClient.request = originalRequest;
    harness.restore();
    restoreTimers();
  }
});

test("Scratch iframe successful load clears the pending load timeout", async () => {
  const timers = createFakeTimers();
  const restoreTimers = timers.install();
  const harness = createScratchHarness();
  const originalRequest = apiClient.request;

  apiClient.request = async () => new Response("{}", { status: 200 });

  try {
    harness.controller.openScratchWorkspace({ sourceLabel: "课程任务中心" });
    await flushAsyncWork();

    const loadTimeout = timers.findByDelay((delay) => delay > 2000);
    assert.ok(loadTimeout, "expected a load timeout timer for Scratch iframe");

    harness.frame.dispatchEvent("load");

    assert.equal(harness.empty.style.display, "none");
    assert.equal(harness.frame.style.display, "block");
    assert.equal(harness.frame.classList.contains("is-loading"), false);
    assert.equal(timers.has(loadTimeout.id), false);
    assert.equal(timers.countByDelay(2000), 0);
  } finally {
    apiClient.request = originalRequest;
    harness.restore();
    restoreTimers();
  }
});

test("Scratch iframe explicitly allows camera access for the embedded editor", async () => {
  const timers = createFakeTimers();
  const restoreTimers = timers.install();
  const harness = createScratchHarness();
  const originalRequest = apiClient.request;

  apiClient.request = async () => new Response("{}", { status: 200 });

  try {
    harness.controller.openScratchWorkspace({ sourceLabel: "课程任务中心" });
    await flushAsyncWork();

    assert.equal(harness.frame.getAttribute("allow"), "camera *");
  } finally {
    apiClient.request = originalRequest;
    harness.restore();
    restoreTimers();
  }
});

test("Scratch reissues a project handle after the embedded editor reports an expired handle", async () => {
  const postedMessages = [];
  const childWindow = {
    postMessage(message, targetOrigin) {
      postedMessages.push({message, targetOrigin});
    },
  };
  const harness = createScratchHarness({contentWindow: childWindow});
  const originalRequest = apiClient.request;
  let handleRequests = 0;

  apiClient.request = async (path) => {
    if (path === "/api/resources/scratch-workspace") {
      handleRequests += 1;
      return new Response(JSON.stringify({
        success: true,
        project_handle: `project-handle-${handleRequests}`,
      }), {status: 200});
    }
    return new Response("{}", {status: 200});
  };

  try {
    harness.controller.openScratchWorkspace({
      localPath: "/tmp/xedu-course",
      projectPath: "lesson1/demo.sb3",
      sourceLabel: "课程任务中心",
    });
    await flushAsyncWork();
    harness.frame.dispatchEvent("load");
    const bridgeToken = postedMessages.find(({message}) =>
      message.type === "xedu:scratch-host-state-request"
    )?.message.bridgeToken;
    assert.ok(bridgeToken, "expected the host bridge token");

    harness.dispatchWindowMessage({
      source: childWindow,
      origin: "http://127.0.0.1:5123",
      data: {type: "xedu:scratch-project-access-expired", bridgeToken},
    });
    await flushAsyncWork();
    harness.frame.dispatchEvent("load");

    assert.equal(handleRequests, 2);
    assert.match(harness.frame.getAttribute("src"), /rootToken=project-handle-2/);
  } finally {
    apiClient.request = originalRequest;
    harness.restore();
  }
});

test("Scratch host controls communicate with a cross-origin iframe through postMessage", async () => {
  const postedMessages = [];
  const childWindow = new Proxy({
    postMessage(message, targetOrigin) {
      postedMessages.push({ message, targetOrigin });
    },
  }, {
    get(target, property) {
      if (property === "postMessage") return target.postMessage;
      throw new Error(`Blocked cross-origin property access: ${String(property)}`);
    },
  });
  const harness = createScratchHarness({ contentWindow: childWindow });
  const originalRequest = apiClient.request;
  apiClient.request = async () => new Response("{}", { status: 200 });

  try {
    harness.controller.openScratchWorkspace({ sourceLabel: "课程任务中心" });
    await flushAsyncWork();
    assert.doesNotThrow(() => harness.frame.dispatchEvent("load"));
    assert.ok(postedMessages.some(({ message }) => message.type === "xedu:scratch-host-state-request"));
  } finally {
    apiClient.request = originalRequest;
    harness.restore();
  }
});

test("Scratch upload uses a host-side file picker and sends the project buffer to the iframe", async () => {
  const postedMessages = [];
  const childWindow = {
    postMessage(message, targetOrigin) {
      postedMessages.push({ message, targetOrigin });
    },
  };
  const harness = createScratchHarness({
    contentWindow: childWindow,
    scratchHostActions: ["upload"],
  });
  const originalRequest = apiClient.request;
  apiClient.request = async () => new Response("{}", { status: 200 });
  harness.window.electronAPI = {
    selectScratchProjectFile: async () => ({
      fileName: "demo.sb3",
      buffer: new Uint8Array([1, 2, 3, 4]).buffer,
    }),
  };

  try {
    harness.controller.openScratchWorkspace({ sourceLabel: "课程任务中心" });
    await flushAsyncWork();
    harness.frame.dispatchEvent("load");

    const bridgeToken = postedMessages.find(({ message }) =>
      message.type === "xedu:scratch-host-state-request"
    )?.message.bridgeToken;
    assert.ok(bridgeToken, "expected the host bridge token");

    harness.dispatchWindowMessage({
      source: childWindow,
      origin: "http://127.0.0.1:5123",
      data: {
        type: "xedu:scratch-host-state",
        bridgeToken,
        state: { canSave: true },
      },
    });
    await flushAsyncWork();

    const uploadItem = harness.document.getElementById("scratch-host-upload");
    assert.ok(uploadItem, "upload menu item should exist");
    uploadItem.click();
    await flushAsyncWork();

    const uploadMessage = postedMessages.find(({ message }) =>
      message.type === "xedu:scratch-host-upload-project"
    )?.message;
    assert.ok(uploadMessage, "expected a host upload request");
    assert.equal(uploadMessage.fileName, "demo.sb3");
    assert.ok(uploadMessage.buffer instanceof ArrayBuffer);

    harness.dispatchWindowMessage({
      source: childWindow,
      origin: "http://127.0.0.1:5123",
      data: {
        type: "xedu:scratch-host-action-result",
        bridgeToken,
        requestId: uploadMessage.requestId,
        result: true,
      },
    });
    await flushAsyncWork();
  } finally {
    apiClient.request = originalRequest;
    harness.restore();
  }
});

test("Scratch workspace releases camera resources when the page is no longer active", async () => {
  const postedMessages = [];
  const childWindow = new Proxy({
    postMessage(message, targetOrigin) {
      postedMessages.push({message, targetOrigin});
    },
  }, {
    get(target, property) {
      if (property === "postMessage") return target.postMessage;
      throw new Error(`Blocked cross-origin property access: ${String(property)}`);
    },
  });
  const harness = createScratchHarness({contentWindow: childWindow});
  const originalRequest = apiClient.request;
  apiClient.request = async () => new Response("{}", {status: 200});

  try {
    harness.controller.openScratchWorkspace({sourceLabel: "课程任务中心"});
    await flushAsyncWork();
    harness.frame.dispatchEvent("load");

    harness.document.getElementById("scratch-workspace").classList.remove("active");
    harness.controller.renderWorkspacePages();

    assert.ok(postedMessages.some(({message}) =>
      message.type === "xedu:scratch-host-lifecycle" && message.active === false
    ));
  } finally {
    apiClient.request = originalRequest;
    harness.restore();
  }
});

test("Scratch host menu disables iframe pointer events while the dropdown is open", async () => {
  const harness = createScratchHarness();
  const originalRequest = apiClient.request;
  apiClient.request = async () => new Response("{}", { status: 200 });

  try {
    harness.controller.openScratchWorkspace({ sourceLabel: "课程任务中心" });
    await flushAsyncWork();
    harness.frame.dispatchEvent("load");

    const menu = harness.document.getElementById("scratch-host-file-menu");
    assert.ok(menu, "scratch host menu should exist");

    menu.open = true;
    menu.dispatchEvent("toggle");
    assert.equal(harness.frame.style.pointerEvents, "none");

    menu.open = false;
    menu.dispatchEvent("toggle");
    assert.equal(harness.frame.style.pointerEvents, "auto");
  } finally {
    apiClient.request = originalRequest;
    harness.restore();
  }
});

test("manual retry after a timeout clears stale retry timers and rechecks backend health", async () => {
  const timers = createFakeTimers();
  const restoreTimers = timers.install();
  const harness = createScratchHarness();
  const originalRequest = apiClient.request;
  let requestCount = 0;

  apiClient.request = async () => {
    requestCount += 1;
    return new Response("{}", { status: 200 });
  };

  try {
    harness.controller.openScratchWorkspace({ sourceLabel: "课程任务中心" });
    await flushAsyncWork();

    const firstLoadTimeout = timers.findByDelay((delay) => delay > 2000);
    assert.ok(firstLoadTimeout, "expected first load timeout timer");
    timers.run(firstLoadTimeout.id);
    assert.equal(requestCount, 1);
    assert.equal(timers.countByDelay(2000), 1);

    const retryButton = harness.empty.querySelector("[data-scratch-placeholder-action]");
    assert.ok(retryButton, "retry button should exist after timeout");
    retryButton.click();
    await flushAsyncWork();

    assert.equal(requestCount, 2);
    assert.equal(timers.countByDelay(2000), 0);
    assert.ok(timers.findByDelay((delay) => delay > 2000), "expected a fresh load timeout after retry");
  } finally {
    apiClient.request = originalRequest;
    harness.restore();
    restoreTimers();
  }
});

test("Scratch backend unavailable placeholder can retry managed backend startup", async () => {
  const timers = createFakeTimers();
  const restoreTimers = timers.install();
  let healthRequestCount = 0;
  let retryCount = 0;
  const harness = createScratchHarness({
    electronAPI: {
      async getBackendStartupState() {
        return {
          state: {
            status: "error",
            message: "后端进程已退出，未能启动服务",
            canRetry: true,
          },
        };
      },
      async retryBackendStartup() {
        retryCount += 1;
        return {
          success: true,
          state: {
            status: "starting",
            message: "正在重试后端启动…",
            canRetry: false,
          },
        };
      },
    },
  });
  const originalRequest = apiClient.request;
  apiClient.request = async () => {
    healthRequestCount += 1;
    if (healthRequestCount === 1) {
      return new Response("{}", { status: 502 });
    }
    return new Response("{}", { status: 200 });
  };

  try {
    harness.controller.openScratchWorkspace({ sourceLabel: "课程任务中心" });
    await flushAsyncWork();

    assert.match(harness.empty.innerHTML, /重试启动后端/);
    const retryButton = harness.empty.querySelector("[data-scratch-placeholder-action]");
    assert.ok(retryButton, "retry backend button should exist");

    retryButton.click();
    await flushAsyncWork();

    assert.equal(retryCount, 1);
    assert.equal(healthRequestCount, 2);
  } finally {
    apiClient.request = originalRequest;
    harness.restore();
    restoreTimers();
  }
});
