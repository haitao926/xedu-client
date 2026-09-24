export const MICROPYTHON_RUNTIME = "micropython-esp32";
export const MICROPYTHON_LAUNCH_QUERY = "xedu-micropython";

export function isMicroPythonExperiment(experiment) {
  const runtime = String(experiment?.runtime || "").trim().toLowerCase();
  return runtime === MICROPYTHON_RUNTIME || runtime === "micropython";
}

export function selectMicroPythonEntryPath(experiment, files = []) {
  if (!isMicroPythonExperiment(experiment)) return "";
  const pyFiles = (Array.isArray(files) ? files : []).filter((file) => {
    const path = String(file?.path || file?.name || "");
    return path.toLowerCase().endsWith(".py");
  });
  const entry = String(experiment?.entry_file || experiment?.entryFile || "")
    .trim()
    .replace(/\\/g, "/");
  if (entry) {
    const match = pyFiles.find((file) => {
      const path = String(file.path || file.name || "").replace(/\\/g, "/");
      return path === entry || path.endsWith(`/${entry}`);
    });
    if (match) return match.path || match.name || entry;
    return entry;
  }
  const main = pyFiles.find((file) => {
    const path = String(file.path || file.name || "").replace(/\\/g, "/");
    return path === "main.py" || path.endsWith("/main.py");
  });
  if (main) return main.path || main.name || "main.py";
  if (pyFiles[0]) return pyFiles[0].path || pyFiles[0].name || "";
  return "main.py";
}

export function appendMicroPythonLaunchQuery(url, enabled) {
  if (!enabled || !url) return url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.set(MICROPYTHON_LAUNCH_QUERY, "1");
    return parsed.toString();
  } catch {
    if (new RegExp(`[?&]${MICROPYTHON_LAUNCH_QUERY}=`).test(url)) return url;
    const joiner = url.includes("?") ? "&" : "?";
    return `${url}${joiner}${MICROPYTHON_LAUNCH_QUERY}=1`;
  }
}
