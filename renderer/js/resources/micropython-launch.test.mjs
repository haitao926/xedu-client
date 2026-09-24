import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  appendMicroPythonLaunchQuery,
  isMicroPythonExperiment,
  selectMicroPythonEntryPath,
} from "./micropython-launch.js";

const resourcesSource = readFileSync(new URL("../resources.js", import.meta.url), "utf8");

test("MicroPython experiments keep their runtime and open code mode", () => {
  assert.equal(isMicroPythonExperiment({ runtime: "micropython-esp32" }), true);
  assert.equal(isMicroPythonExperiment({ runtime: "micropython" }), true);
  assert.equal(isMicroPythonExperiment({ runtime: "python" }), false);
  assert.equal(
    selectMicroPythonEntryPath(
      { runtime: "micropython-esp32", entry_file: "src/main.py" },
      [{ path: "lesson/blink.py" }, { path: "lesson/src/main.py" }],
    ),
    "lesson/src/main.py",
  );
  assert.equal(
    selectMicroPythonEntryPath(
      { runtime: "micropython-esp32" },
      [{ path: "lesson/util.py" }, { path: "lesson/main.py" }],
    ),
    "lesson/main.py",
  );
  assert.equal(
    appendMicroPythonLaunchQuery("http://127.0.0.1:8888/lab/tree/lesson/main.py", true),
    "http://127.0.0.1:8888/lab/tree/lesson/main.py?xedu-micropython=1",
  );
  assert.equal(appendMicroPythonLaunchQuery("http://127.0.0.1:8888/lab", false), "http://127.0.0.1:8888/lab");
  assert.match(resourcesSource, /normalized\.runtime = runtime/);
  assert.match(resourcesSource, /micropython,/);
  assert.match(resourcesSource, /打开 MicroPython/);
});
