import assert from "node:assert/strict";
import test from "node:test";

import { escapeHtml } from "./html.js";

test("escapeHtml escapes the shared HTML-sensitive characters", () => {
  assert.equal(
    escapeHtml(`Tom & <Jerry> "quote" 'apostrophe'`),
    "Tom &amp; &lt;Jerry&gt; &quot;quote&quot; &#39;apostrophe&#39;",
  );
});

test("escapeHtml returns an empty string for nullish values", () => {
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(undefined), "");
});
