export function hasDesktopBridgeMethod(electronAPI, methodName) {
  return Boolean(
    electronAPI
    && (
      typeof electronAPI?.[methodName] === 'function'
      || typeof electronAPI?.invoke === 'function'
    )
  );
}

export async function selectFolderWithDesktopBridge(electronAPI = window.electronAPI) {
  if (typeof electronAPI?.selectFolder === 'function') {
    return electronAPI.selectFolder();
  }
  if (typeof electronAPI?.invoke === 'function') {
    return electronAPI.invoke('select-folder');
  }
  throw new Error('desktop-bridge-unavailable');
}

export async function selectCoursePackageWithDesktopBridge(electronAPI = window.electronAPI) {
  if (typeof electronAPI?.selectCoursePackage === 'function') {
    return electronAPI.selectCoursePackage();
  }
  if (typeof electronAPI?.invoke === 'function') {
    return electronAPI.invoke('select-course-package');
  }
  throw new Error('desktop-bridge-unavailable');
}

export async function getPathForFileWithDesktopBridge(file, electronAPI = window.electronAPI) {
  if (typeof electronAPI?.getPathForFile === 'function') {
    return electronAPI.getPathForFile(file);
  }
  throw new Error('desktop-file-path-unavailable');
}

export async function openPathWithDesktopBridge(targetPath, electronAPI = window.electronAPI) {
  if (typeof electronAPI?.openPath === 'function') {
    return electronAPI.openPath(targetPath);
  }
  if (typeof electronAPI?.invoke === 'function') {
    return electronAPI.invoke('open-path', targetPath);
  }
  throw new Error('desktop-bridge-unavailable');
}
