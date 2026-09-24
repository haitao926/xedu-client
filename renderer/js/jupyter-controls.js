export const STUDENT_JUPYTER_CONTROLS_CLASS = "student-jupyter-controls-open";

export function studentJupyterControlsAreOpen(classList) {
    return Boolean(classList?.contains?.(STUDENT_JUPYTER_CONTROLS_CLASS));
}

export function applyStudentJupyterControls(documentRef, open) {
    const shown = Boolean(open);
    documentRef?.body?.classList?.toggle(STUDENT_JUPYTER_CONTROLS_CLASS, shown);
    const button = documentRef?.getElementById?.("jupyter-controls-toggle");
    if (!button) return shown;
    const label = shown ? "收起" : "控制";
    const description = shown ? "收起实验控制" : "显示实验控制";
    button.textContent = label;
    button.title = description;
    button.setAttribute("aria-label", description);
    button.setAttribute("aria-expanded", shown ? "true" : "false");
    return shown;
}
