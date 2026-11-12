async function saveCurrentJupyterProject() {
    const widget = window.jupyterapp?.shell?.currentWidget;
    if (widget?.id === 'xedu-micropython-panel') {
        if (typeof widget.exportForSubmission !== 'function') {
            throw new Error('当前 MicroPython 编辑器尚未支持作品提交，请更新客户端后重试。');
        }
        return widget.exportForSubmission();
    }
    const context = widget?.context;
    if (!context || typeof context.save !== 'function') {
        throw new Error('The current Jupyter widget has no saveable document context.');
    }

    function documentType(path) {
        if (typeof path !== 'string' || !/\.(ipynb|py)$/.test(path)) {
            throw new Error('The current Jupyter document must have an .ipynb or .py path.');
        }
        return path.endsWith('.ipynb') ? 'notebook' : 'python';
    }

    documentType(context.path);
    await context.ready;
    await context.save();

    const path = context.path;
    const type = documentType(path);
    const model = context.model;
    let content;
    let mime;
    if (type === 'notebook') {
        if (!model || typeof model.toJSON !== 'function') {
            throw new Error('The current notebook model cannot be serialized as JSON.');
        }
        content = JSON.stringify(model.toJSON());
        mime = 'application/x-ipynb+json';
    } else {
        if (!model || typeof model.toString !== 'function' || model.toString === Object.prototype.toString) {
            throw new Error('The current Python model cannot be serialized as text.');
        }
        content = model.toString();
        mime = 'text/x-python';
    }
    if (typeof content !== 'string') {
        throw new Error('The current Jupyter model did not serialize to document content.');
    }

    return {
        bytes: Array.from(new TextEncoder().encode(content)),
        filename: path.split('/').pop(),
        mime,
    };
}

module.exports = { saveCurrentJupyterProject };
