const NOTIFICATION_INTERVAL_MS = 1500;

function describeReason(reason) {
    if (reason instanceof Error) return reason.message || reason.name;
    if (typeof reason === 'string') return reason;
    if (reason && typeof reason.message === 'string') return reason.message;
    return '未知 Promise 异常';
}

export function installUnhandledRejectionHandler({
    target = globalThis.window,
    notify = () => {},
    logger = console,
    now = () => Date.now(),
} = {}) {
    if (!target?.addEventListener) return () => {};

    let lastNotificationAt = -Infinity;
    const onUnhandledRejection = (event) => {
        event?.preventDefault?.();
        const reason = event?.reason;
        logger?.error?.('[Renderer] 未处理的 Promise 异常:', describeReason(reason), reason);
        const currentTime = now();
        if (currentTime - lastNotificationAt < NOTIFICATION_INTERVAL_MS) return;
        lastNotificationAt = currentTime;
        notify('操作未完成，请重试。', 'error');
    };

    target.addEventListener('unhandledrejection', onUnhandledRejection);
    return () => target.removeEventListener?.('unhandledrejection', onUnhandledRejection);
}
