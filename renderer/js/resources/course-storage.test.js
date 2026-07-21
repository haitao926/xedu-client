import assert from "node:assert/strict";
import test from "node:test";

import {
    persistLocalCourses,
    stripRemovedIntegrationMetadata,
} from "./course-storage.js";

const legacyCourse = {
    id: "legacy-course",
    quickform_defaults: { enabled: true },
    sections: [{
        title: "第一课",
        experiments: [{ title: "实验", quickform: { submit_url: "https://example.invalid" } }],
    }],
};

test("stripRemovedIntegrationMetadata removes legacy course integration fields", () => {
    const cleaned = stripRemovedIntegrationMetadata(legacyCourse);

    assert.equal("quickform_defaults" in cleaned, false);
    assert.equal("quickform" in cleaned.sections[0].experiments[0], false);
    assert.equal("quickform_defaults" in legacyCourse, true);
});

test("persistLocalCourses does not regenerate removed metadata", () => {
    let saved = null;
    let syncCalls = 0;
    persistLocalCourses([legacyCourse], (courses) => { saved = courses; }, () => { syncCalls += 1; });

    assert.equal("quickform_defaults" in saved[0], false);
    assert.equal("quickform" in saved[0].sections[0].experiments[0], false);
    assert.equal(syncCalls, 1);
});
