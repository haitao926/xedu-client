const APP_KEY = '__xeduAppContext__';

if (!window[APP_KEY]) {
    window[APP_KEY] = {
        ui: {},
        jupyter: {},
        ai: {},
        docs: {},
        system: {},
        internal: {}
    };
}
window.app = window[APP_KEY];

export function getAppContext() {
    return window[APP_KEY];
}

export function registerNamespace(namespace, apiObject) {
    const ctx = getAppContext();
    ctx[namespace] = {
        ...(ctx[namespace] || {}),
        ...apiObject
    };
}
