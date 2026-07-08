# Student AI Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refocus the in-app AI assistant into a student-only experiment help surface that never routes normal chat into teacher workflow agents.

**Architecture:** Keep the existing chat shell and AI service. Simplify `/api/ai/ask` so normal chat always goes through `AIService.ask_question`, with current experiment context passed through `request_context`; teacher workflow requests receive a short boundary answer instead of invoking QuickForm, XEdu Pack, or Blockly Builder agents. Freeze the frontend AI surface to the student learning configuration while leaving teacher mode untouched elsewhere.

**Tech Stack:** Flask route tests with `unittest`, Python backend services, vanilla JS frontend modules, existing Vite/Electron renderer structure.

## Global Constraints

- No new dependencies.
- Keep diffs small, reviewable, and reversible.
- QuickForm integration, course packaging, Blockly draft generation, and teacher-side operations stay outside the chat experience.
- The AI assistant should use current course and experiment context when available.
- Preserve existing teacher tool services; do not delete QuickForm, XEdu Pack, or Blockly Builder agent services.
- Existing unrelated workspace changes must not be reverted.

---

## File Structure

- Modify `backend/api/routes/ai.py`: remove normal chat routing into teacher agents; add student-safe boundary response for teacher-only operations.
- Modify `backend/services/ai_service.py`: strengthen student system prompt and include current experiment context in the prompt payload.
- Modify `backend/tests/test_ai_routing_api.py`: update route tests so teacher keywords do not invoke agent services and chat remains student-safe.
- Modify `renderer/js/ai.js`: freeze assistant config and surface mode to student mode; keep context payload.
- Modify `renderer/js/experience-config.js`: remove teacher AI chat copy by making teacher AI config reuse the student learning assistant copy, or make `ai.js` ignore it.
- Add or modify renderer tests only if an existing lightweight test path can validate the copy without introducing new tooling.

---

### Task 1: Route Chat Away From Teacher Agents

**Files:**
- Modify: `backend/api/routes/ai.py`
- Modify: `backend/tests/test_ai_routing_api.py`

**Interfaces:**
- Consumes: `AIService.ask_question(question, image_data, history, request_context=None) -> dict`
- Produces: `/api/ai/ask` response object with `success`, `answer`, and no teacher-agent `route` for QuickForm / pack / Blockly phrases.

- [ ] **Step 1: Replace routing tests with student-only expectations**

Update `backend/tests/test_ai_routing_api.py` so `_FakeAIService` records the request context and teacher agent services fail if called:

```python
class _FakeAIService:
    def __init__(self):
        self.config = SimpleNamespace(api_key="test-key")

    def ask_question(self, question, image_data, history, request_context=None):
        return {
            "success": True,
            "route": "default",
            "question": question,
            "request_context": request_context or {},
        }

    def test_connection(self):
        return {"success": True}


class _FailingAgentService:
    def __init__(self, route_name: str):
        self.route_name = route_name

    def chat(self, **kwargs):
        raise AssertionError(f"{self.route_name} agent should not be called from student chat")
```

Change `_build_services` to use `_FailingAgentService`:

```python
"build_quickform_agent_service": lambda overrides=None: _FailingAgentService("quickform"),
"build_xedu_pack_agent_service": lambda overrides=None: _FailingAgentService("xedu-pack"),
"build_blockly_builder_agent_service": lambda overrides=None: _FailingAgentService("blockly"),
```

Replace the old route-priority tests with:

```python
def test_quickform_phrase_returns_student_boundary_without_agent_route(self):
    client = self._build_client(
        looks_quickform=lambda text, history=None: True,
        looks_blockly=lambda text, history=None: True,
    )
    response = client.post("/api/ai/ask", json={"question": "帮我绑定 quickform"})
    self.assertEqual(response.status_code, 200)
    data = response.get_json()
    self.assertNotIn("route", data)
    self.assertIn("学生实验答疑", data["answer"])


def test_blockly_builder_phrase_returns_student_boundary_without_agent_route(self):
    client = self._build_client(
        looks_quickform=lambda text, history=None: False,
        looks_blockly=lambda text, history=None: True,
    )
    response = client.post("/api/ai/ask", json={"question": "生成积木实验"})
    self.assertEqual(response.status_code, 200)
    data = response.get_json()
    self.assertNotIn("route", data)
    self.assertIn("学生实验答疑", data["answer"])
```

Keep and adjust the fallback test:

```python
def test_fallback_to_default_ai_for_learning_question(self):
    client = self._build_client(
        looks_quickform=lambda text, history=None: False,
        looks_blockly=lambda text, history=None: False,
    )
    response = client.post("/api/ai/ask", json={"question": "你好"})
    self.assertEqual(response.status_code, 200)
    data = response.get_json()
    self.assertEqual(data["route"], "default")
```

Add a context preservation test:

```python
def test_experiment_context_is_passed_to_default_ai_service(self):
    client = self._build_client(
        looks_quickform=lambda text, history=None: False,
        looks_blockly=lambda text, history=None: False,
    )
    context = {
        "experience_mode": "student",
        "course": {"id": "demo", "title": "图像识别"},
        "experiment_context": {
            "experiment": {"title": "像素魔术师"},
            "entries": {"notebook": {"path": "lesson1/main.ipynb"}},
        },
    }
    response = client.post("/api/ai/ask", json={"question": "这个实验要做什么", "context": context})
    self.assertEqual(response.status_code, 200)
    data = response.get_json()
    self.assertEqual(data["route"], "default")
    self.assertEqual(data["request_context"]["context"]["course"]["title"], "图像识别")
    self.assertEqual(data["request_context"]["context"]["experiment_context"]["experiment"]["title"], "像素魔术师")
```

- [ ] **Step 2: Run route tests to verify they fail**

Run:

```bash
python3 -m unittest backend.tests.test_ai_routing_api -v
```

Expected: FAIL because `/api/ai/ask` still has teacher-agent routing and/or old boundary wording.

- [ ] **Step 3: Implement student-only route behavior**

In `backend/api/routes/ai.py`, replace `_teacher_navigation_answer` with a student boundary helper:

```python
    def _student_boundary_answer(question: str) -> str:
        lowered = (question or "").lower()
        if "quickform" in lowered or "表单" in question:
            return (
                "这个聊天助手现在聚焦学生实验答疑，不负责 QuickForm 接入或数据统计。"
                "如果你正在做实验，我可以帮你理解任务、分析报错、解释 Blockly 或 Python 步骤。"
            )
        if "pack" in lowered or "打包" in question or "发布" in question:
            return (
                "这个聊天助手现在聚焦学生实验答疑，不负责课程打包或发布。"
                "如果你是在学习当前实验，我可以帮你梳理实验目标、代码含义和下一步操作。"
            )
        if "blockly" in lowered or "积木" in question:
            return (
                "这个聊天助手现在聚焦学生实验答疑，不生成 Blockly 草稿或教师侧资源。"
                "你可以把当前积木运行结果、报错或不理解的步骤发给我，我会帮你分析。"
            )
        return (
            "这个聊天助手现在聚焦学生实验答疑。"
            "我可以帮你理解当前实验、解释概念、分析报错，或整理下一步学习操作。"
        )
```

Then simplify `ai_ask` after computing `matched_teacher_agent`:

```python
        if matched_teacher_agent:
            response = {
                "success": True,
                "answer": _student_boundary_answer(question),
            }
        else:
            response = service.ask_question(question, image_data, history, request_context=request_context)
```

Remove unused teacher-mode branching variables from the route body:

```python
        explicit_student_mode = ...
        explicit_teacher_mode = ...
        teacher_mode_unlocked = ...
        teacher_code_valid = ...
        is_teacher_mode = ...
```

Keep service dependencies in `register_ai_routes` for now if deleting them would require touching `backend/api/app.py` and route-service construction. The route simply should not call the builders.

- [ ] **Step 4: Run route tests to verify they pass**

Run:

```bash
python3 -m unittest backend.tests.test_ai_routing_api -v
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add backend/api/routes/ai.py backend/tests/test_ai_routing_api.py
git commit -m "Keep chat assistant focused on student help

The chat route no longer dispatches ordinary assistant questions into
teacher workflow agents. Teacher-only phrases now receive a short
student-safe boundary response, while learning questions continue through
the default AI service with context intact.

Constraint: QuickForm, packaging, and Blockly generation are handled outside chat
Rejected: Preserve keyword-based teacher routing | keeps the assistant ambiguous and brittle
Confidence: high
Scope-risk: narrow
Tested: python3 -m unittest backend.tests.test_ai_routing_api -v"
```

---

### Task 2: Ground the Student Prompt in Experiment Context

**Files:**
- Modify: `backend/services/ai_service.py`
- Create or modify: `backend/tests/test_ai_service.py`

**Interfaces:**
- Consumes: `request_context["context"]["experiment_context"]`
- Produces: messages passed to `_call_ai_api`, including a student system prompt and optional experiment context system message.

- [ ] **Step 1: Add a prompt-preparation test**

In `backend/tests/test_ai_service.py`, add a test class if needed or append this test to the existing one:

```python
def test_prepare_messages_includes_student_experiment_context(self):
    service = AIService(AIConfig(api_key="test-key"))
    messages = service._prepare_messages(
        "这个实验要做什么？",
        request_context={
            "experience_mode": "student",
            "context": {
                "course": {"id": "demo", "title": "图像识别"},
                "experiment_context": {
                    "section": {"title": "第1课"},
                    "experiment": {
                        "title": "像素魔术师",
                        "description": "理解像素和 RGB",
                    },
                    "entries": {
                        "html": {"path": "lesson1/exp1/index.html"},
                        "blockly": {"path": "lesson1/exp1/blockly/workspace.json"},
                        "notebook": {"path": "lesson1/exp1/main.ipynb"},
                        "python": None,
                    },
                },
            },
        },
    )
    joined = "\n".join(str(message.get("content", "")) for message in messages)
    self.assertIn("XEdu 学习助手", joined)
    self.assertIn("像素魔术师", joined)
    self.assertIn("lesson1/exp1/main.ipynb", joined)
    self.assertIn("不要执行教师管理", joined)
```

If `AIConfig(api_key="test-key")` is not valid for the local model type, instantiate `AIConfig()` and assign `api_key` after creation:

```python
config = AIConfig()
config.api_key = "test-key"
service = AIService(config)
```

- [ ] **Step 2: Run the prompt test to verify it fails**

Run:

```bash
python3 -m unittest backend.tests.test_ai_service -v
```

Expected: FAIL because current prompt does not include structured experiment context or the new teacher-boundary rule.

- [ ] **Step 3: Add context serialization helper**

In `backend/services/ai_service.py`, add a private helper near `_prepare_messages`:

```python
    def _build_student_context_prompt(self, request_context: Dict[str, Any]) -> str:
        context = request_context.get("context") if isinstance(request_context.get("context"), dict) else {}
        course = context.get("course") if isinstance(context.get("course"), dict) else {}
        experiment_context = context.get("experiment_context") if isinstance(context.get("experiment_context"), dict) else {}
        section = experiment_context.get("section") if isinstance(experiment_context.get("section"), dict) else {}
        experiment = experiment_context.get("experiment") if isinstance(experiment_context.get("experiment"), dict) else {}
        entries = experiment_context.get("entries") if isinstance(experiment_context.get("entries"), dict) else {}

        lines = []
        if course.get("title"):
            lines.append(f"当前课程：{course.get('title')}")
        if section.get("title"):
            lines.append(f"当前课节：{section.get('title')}")
        if experiment.get("title"):
            lines.append(f"当前实验：{experiment.get('title')}")
        if experiment.get("description"):
            lines.append(f"实验说明：{experiment.get('description')}")

        entry_labels = {
            "html": "HTML 体验页",
            "blockly": "Blockly 资源",
            "notebook": "Notebook 资源",
            "python": "Python 资源",
        }
        for key, label in entry_labels.items():
            entry = entries.get(key)
            if isinstance(entry, dict) and entry.get("path"):
                lines.append(f"{label}：{entry.get('path')}")

        if not lines:
            return ""
        return "当前学习上下文：\n" + "\n".join(f"- {line}" for line in lines)
```

- [ ] **Step 4: Strengthen the student system prompt**

In `_prepare_messages`, replace the student branch of `system_prompt` with:

```python
        system_prompt = (
            "你是 XEdu 教师助教，专门帮助教师完成课程整理、课堂准备、实验设计和教学支持。"
            "回答要优先围绕课程结构、实验组织、教学步骤、课堂执行和 AI 工具使用。"
        ) if is_teacher else (
            "你是 XEdu 学习助手，专门帮助学生理解当前课程、实验任务、Blockly 步骤、Python 代码和报错原因。"
            "回答必须面向学生，语言清晰、具体、鼓励式。"
            "优先结合当前学习上下文解释学生正在做什么，再给下一步。"
            "遇到报错时，先判断是否有足够的错误信息；缺少信息时请学生补充完整报错、代码或截图。"
            "不要执行教师管理、QuickForm 接入、课程打包、发布或 Blockly 草稿生成等操作。"
            "不要声称你已经修改、运行或发布了任何资源。"
        )
```

Then after appending the main system prompt, add:

```python
        student_context_prompt = ""
        if not is_teacher:
            student_context_prompt = self._build_student_context_prompt(request_context)
        if student_context_prompt:
            messages.append({
                "role": "system",
                "content": student_context_prompt,
            })
```

- [ ] **Step 5: Run AI service tests**

Run:

```bash
python3 -m unittest backend.tests.test_ai_service -v
```

Expected: PASS.

- [ ] **Step 6: Run route tests again**

Run:

```bash
python3 -m unittest backend.tests.test_ai_routing_api -v
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add backend/services/ai_service.py backend/tests/test_ai_service.py
git commit -m "Ground student AI answers in experiment context

The student assistant prompt now carries the current course, section,
experiment, and primary resource paths so answers can stay tied to the
student's active task instead of drifting into generic chat.

Constraint: Assistant must not claim teacher-side execution or resource mutation
Rejected: Read source files inside the chat request | too expensive and unnecessary for this first pass
Confidence: high
Scope-risk: narrow
Tested: python3 -m unittest backend.tests.test_ai_service -v
Tested: python3 -m unittest backend.tests.test_ai_routing_api -v"
```

---

### Task 3: Freeze Frontend AI Surface to Student Help

**Files:**
- Modify: `renderer/js/ai.js`
- Modify: `renderer/js/experience-config.js`
- Optional Test: `renderer/js/student-shell-contract.test.mjs` or a new lightweight JS test if existing tooling supports it.

**Interfaces:**
- Consumes: `getExperienceConfig(EXPERIENCE_MODES.STUDENT).ai`
- Produces: AI page header, suggestions, status text, and model badge always using student learning assistant copy.

- [ ] **Step 1: Add a frontend copy contract test if practical**

If `renderer/js/student-shell-contract.test.mjs` can import source files without DOM setup, add checks such as:

```javascript
import assert from "node:assert/strict";
import test from "node:test";
import { getExperienceConfig, EXPERIENCE_MODES } from "./experience-config.js";

test("AI assistant copy stays student-focused", () => {
  const studentAi = getExperienceConfig(EXPERIENCE_MODES.STUDENT).ai;
  assert.equal(studentAi.headerTitle, "学习助手");
  assert.match(studentAi.emptyState.primarySuggestion.prompt, /当前实验/);
  assert.doesNotMatch(JSON.stringify(studentAi), /QuickForm|打包|发布|教师侧/);
});
```

If import path from the test file differs, use the correct relative path from that file. If adding this test is too disruptive, skip this step and verify manually in Step 5.

- [ ] **Step 2: Make `ai.js` use student config unconditionally**

In `renderer/js/ai.js`, change the imports:

```javascript
import { EXPERIENCE_MODES, getExperienceConfig } from './experience-config.js';
```

Replace:

```javascript
function getAssistantConfig() {
    return getExperienceConfig(isTeacherModeUnlocked()).ai;
}

function getAssistantSurfaceMode() {
    return isTeacherModeUnlocked() ? 'teacher' : 'student';
}
```

with:

```javascript
function getAssistantConfig() {
    return getExperienceConfig(EXPERIENCE_MODES.STUDENT).ai;
}

function getAssistantSurfaceMode() {
    return EXPERIENCE_MODES.STUDENT;
}
```

Keep `isTeacherModeUnlocked()` only if `buildAgentContext()` still needs it. Otherwise remove it after Step 3.

- [ ] **Step 3: Send student experience mode from chat context**

In `buildAgentContext()`, keep the rich resource context but normalize chat mode to student:

```javascript
function buildAgentContext() {
    try {
        const ctx = window.app?.resources?.getChatContext?.();
        if (ctx && typeof ctx === 'object') {
            return {
                ...ctx,
                experience_mode: EXPERIENCE_MODES.STUDENT,
                teacher_mode: {
                    ...(ctx.teacher_mode || {}),
                    unlocked: false,
                    code: ''
                }
            };
        }
    } catch (error) {
        console.warn('读取聊天课程上下文失败:', error);
    }
    return {
        experience_mode: EXPERIENCE_MODES.STUDENT,
        teacher_mode: {
            unlocked: false,
            code: ''
        },
        course: null,
        experiment_context: null
    };
}
```

After this change, remove `isTeacherModeUnlocked()` if it has no callers.

- [ ] **Step 4: Remove teacher AI workflow copy**

In `renderer/js/experience-config.js`, change the teacher `ai` block so it mirrors student learning assistant copy or no longer advertises teacher workflows.

Minimal change:

```javascript
        ai: {
            sidebarTitle: '学习对话',
            headerTitle: '学习助手',
            sessionTitle: '当前对话',
            sessionDesc: '',
            subtitle: '围绕当前课程、实验任务和报错理解来提供支持',
            modelBadgeReady: '学习模型',
            modelBadgeEmpty: '学习模型',
            showModelIdentifier: false,
            contextFallback: '学习模式',
            contextTitle: '当前为学习助手',
            composerLabel: '直接提问',
            composerCaption: '',
            placeholder: '输入学习问题：实验目标、概念、报错、Blockly 或 Python 步骤',
            guard: '',
            status: {
                idle: '等待提问',
                working: '正在思考',
                'needs-action': '等待补充',
                success: '已回复',
            },
            emptyState: {
                eyebrow: '',
                text: '直接开始提问',
                desc: '',
                primarySuggestion: {
                    label: '理解当前实验',
                    prompt: '先帮我理解一下当前实验要做什么，我应该从哪里开始？',
                    submitOnClick: true,
                },
                secondaryLabel: '',
                suggestions: [
                    { label: '解释这个概念', prompt: '请用学生能听懂的话解释一下当前实验涉及的核心概念' },
                    { label: '帮我看报错', prompt: '帮我分析一下当前实验报错可能是什么原因' },
                    { label: '整理下一步', prompt: '帮我整理一下当前实验接下来应该怎么推进' },
                ],
                notes: [],
            },
        },
```

- [ ] **Step 5: Run frontend tests or manual static check**

Run the existing lightweight tests:

```bash
npm test -- --runInBand
```

If the project has no `test` script or this command is not supported, run:

```bash
node --test renderer/js/student-shell-contract.test.mjs
```

Expected: PASS, or report unsupported command and use static checks:

```bash
rg -n "QuickForm|打包|发布|教师侧问题|助教会话|生成 Blockly" renderer/js/experience-config.js renderer/js/ai.js
```

Expected: no AI-assistant copy advertising teacher workflows.

- [ ] **Step 6: Commit Task 3**

```bash
git add renderer/js/ai.js renderer/js/experience-config.js renderer/js/student-shell-contract.test.mjs
git commit -m "Present the AI assistant as student help only

The renderer now keeps the assistant surface in learning mode even when
teacher mode is available elsewhere. Chat context still includes the
current course and experiment, but the assistant no longer advertises
teacher workflow actions.

Constraint: Teacher mode remains available outside the AI assistant
Rejected: Add a second teacher assistant tab | expands scope instead of refocusing the feature
Confidence: high
Scope-risk: narrow
Tested: node --test renderer/js/student-shell-contract.test.mjs"
```

If the optional test file is not changed, omit it from `git add` and adjust `Tested`.

---

### Task 4: Final Verification

**Files:**
- No new implementation files unless a preceding task reveals a focused test gap.

**Interfaces:**
- Consumes: completed Tasks 1-3.
- Produces: evidence that student AI behavior is stable and teacher agent routing is absent from chat.

- [ ] **Step 1: Run backend AI route tests**

Run:

```bash
python3 -m unittest backend.tests.test_ai_routing_api -v
```

Expected: PASS.

- [ ] **Step 2: Run backend AI service tests**

Run:

```bash
python3 -m unittest backend.tests.test_ai_service -v
```

Expected: PASS.

- [ ] **Step 3: Run relevant frontend test**

Run:

```bash
node --test renderer/js/student-shell-contract.test.mjs
```

Expected: PASS.

- [ ] **Step 4: Run broader available checks**

Inspect `package.json` for scripts:

```bash
npm run
```

Then run the most relevant existing checks, likely:

```bash
npm test
```

Expected: PASS if supported. If unsupported or if unrelated pre-existing failures appear, capture exact output and do not hide it.

- [ ] **Step 5: Confirm teacher services were not deleted**

Run:

```bash
rg -n "class QuickFormAgentToolAdapter|class XEduPackToolAdapter|class BlocklyBuilderToolAdapter" backend/services
```

Expected: all three services still exist.

- [ ] **Step 6: Inspect final diff**

Run:

```bash
git diff -- backend/api/routes/ai.py backend/services/ai_service.py backend/tests/test_ai_routing_api.py backend/tests/test_ai_service.py renderer/js/ai.js renderer/js/experience-config.js renderer/js/student-shell-contract.test.mjs
```

Expected: only student-assistant refocus changes.

- [ ] **Step 7: Commit final verification notes if needed**

If no further code changes are needed, do not create an empty commit. If verification required a small test adjustment, commit it:

```bash
git add <changed-test-files>
git commit -m "Verify student assistant refocus

The test coverage now checks that chat stays on the student-help path and
that teacher workflow services remain outside normal assistant routing.

Confidence: high
Scope-risk: narrow
Tested: python3 -m unittest backend.tests.test_ai_routing_api -v
Tested: python3 -m unittest backend.tests.test_ai_service -v
Tested: node --test renderer/js/student-shell-contract.test.mjs"
```

---

## Plan Self-Review

- Spec coverage: route simplification is covered in Task 1; prompt/context grounding is covered in Task 2; frontend student-only presentation is covered in Task 3; verification is covered in Task 4.
- Placeholder scan: no unresolved placeholder markers are intentionally left.
- Type consistency: `request_context["context"]["experiment_context"]` matches current `renderer/js/resources.js#getChatContext()` payload shape.
