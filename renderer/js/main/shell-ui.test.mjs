import assert from 'node:assert/strict';
import test from 'node:test';
import { initSidebarCollapseToggle, showSettingsTab } from './shell-ui.js';

function createClassList() {
    const values = new Set();
    return {
        add(value) { values.add(value); },
        contains(value) { return values.has(value); },
        toggle(value, force) {
            if (force) values.add(value);
            else values.delete(value);
        },
    };
}

function createElement(dataset = {}) {
    const listeners = new Map();
    return {
        dataset,
        style: {},
        classList: createClassList(),
        addEventListener(type, listener) { listeners.set(type, listener); },
        click() { listeners.get('click')?.(); },
        setAttribute() {},
    };
}

test('settings tab selection and hidden-tab fallback stay deterministic', () => {
    const tabs = [createElement({ tab: 'ai' }), createElement({ tab: 'python' })];
    const sections = [createElement({ settingsTab: 'ai' }), createElement({ settingsTab: 'python' })];
    tabs[1].style.display = 'none';
    const documentRef = {
        querySelectorAll(selector) { return selector === '.settings-tab' ? tabs : sections; },
        querySelector() { return tabs[1]; },
    };

    showSettingsTab('python', documentRef);

    assert.equal(tabs[0].classList.contains('active'), true);
    assert.equal(tabs[1].classList.contains('active'), false);
    assert.equal(sections[0].classList.contains('active'), true);
});

test('sidebar collapse persists and updates its accessible label', () => {
    const button = createElement();
    const body = { classList: createClassList() };
    const values = new Map([['xedu-sidebar-collapsed', '1']]);
    const storage = {
        getItem(key) { return values.get(key) || null; },
        setItem(key, value) { values.set(key, value); },
    };
    const documentRef = {
        body,
        getElementById() { return button; },
    };

    initSidebarCollapseToggle({ documentRef, storage });
    assert.equal(body.classList.contains('sidebar-collapsed'), true);
    button.click();
    assert.equal(body.classList.contains('sidebar-collapsed'), false);
    assert.equal(values.get('xedu-sidebar-collapsed'), '0');
});
