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
        return [];
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

function createScratchHarness() {
  const document = createFakeDocument();
  const frame = document.register(createElement("scratch-workspace-frame", { contentWindow: {} }));
  const empty = document.register(createElement("scratch-workspace-empty"));
  const workspace = document.register(createElement("scratch-workspace", { classNames: ["active"] }));
  const navScratch = document.register(createElement("nav-scratch-item", { classNames: ["nav-item"] }));
  navScratch.style.display = "flex";
  document.register(createElement("nav-student-visual-item", { classNames: ["nav-item"] }));
  document.register(createElement("page-title"));
  document.register(createElement("page-subtitle"));
  document.register(createElement("top-bar-actions"));
  document.register(createElement("scratch-host-file-menu"));

  const windowObject = {
    addEventListener() {},
    app: { ui: { showToast() {} } },
    xeduConfig: { apiBase: "http://127.0.0.1:5123" },
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
    restore() {
      globalThis.window = previousWindow;
      globalThis.document = previousDocument;
    },
  };
}

async function flushAsyncWork() {
  await Promise.resolve();
  await Promise.resolve();
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
