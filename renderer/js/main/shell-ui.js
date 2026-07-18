const SIDEBAR_COLLAPSE_KEY = 'xedu-sidebar-collapsed';

export function showSettingsTab(tab, documentRef = globalThis.document) {
    const tabs = documentRef?.querySelectorAll?.('.settings-tab') || [];
    const sections = documentRef?.querySelectorAll?.('[data-settings-tab]') || [];
    const targetTab = documentRef?.querySelector?.(`.settings-tab[data-tab="${tab}"]`);
    const activeTab = targetTab?.style.display === 'none' ? 'about' : tab;

    tabs.forEach((button) => {
        button.classList.toggle('active', button.dataset.tab === activeTab);
    });
    sections.forEach((section) => {
        section.classList.toggle('active', section.dataset.settingsTab === activeTab);
    });
}

function readSidebarCollapsed(storage) {
    try {
        return storage?.getItem(SIDEBAR_COLLAPSE_KEY) === '1';
    } catch (_) {
        return false;
    }
}

function writeSidebarCollapsed(storage, collapsed) {
    try {
        storage?.setItem(SIDEBAR_COLLAPSE_KEY, collapsed ? '1' : '0');
    } catch (_) {
        return false;
    }
    return true;
}

function applySidebarCollapsed(documentRef, collapsed) {
    documentRef?.body?.classList?.toggle('sidebar-collapsed', collapsed);
    const toggleButton = documentRef?.getElementById?.('sidebar-toggle-btn');
    if (!toggleButton) return;
    const label = collapsed ? '展开侧边栏' : '收起侧边栏';
    toggleButton.title = label;
    toggleButton.setAttribute('aria-label', label);
}

export function initSidebarCollapseToggle({
    documentRef = globalThis.document,
    storage = globalThis.localStorage,
} = {}) {
    const toggleButton = documentRef?.getElementById?.('sidebar-toggle-btn');
    if (!toggleButton) return;

    applySidebarCollapsed(documentRef, readSidebarCollapsed(storage));
    toggleButton.addEventListener('click', () => {
        const collapsed = !documentRef.body.classList.contains('sidebar-collapsed');
        applySidebarCollapsed(documentRef, collapsed);
        writeSidebarCollapsed(storage, collapsed);
    });
}
