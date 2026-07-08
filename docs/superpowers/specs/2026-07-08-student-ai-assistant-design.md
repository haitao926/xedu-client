# Student AI Assistant Design

## Summary

Refocus the in-app AI assistant into a student-only experiment help surface.

The assistant should stop acting as a mixed student chat box plus teacher task router. It should instead answer questions inside the current course and experiment context: what the task is, how to start, what an error means, what to do next, and how the current HTML / Blockly / Notebook / Python resources relate to the learning goal.

QuickForm integration, course packaging, Blockly draft generation, and other teacher-side operations should remain outside the chat experience and be handled by dedicated skills or teacher tools.

## Problem

The current assistant has usable backend pieces, but the product shape is weak:

- the same chat surface tries to serve both students and teachers
- teacher-side agent routing is triggered by keyword guessing
- teacher operations appear inside a conversation product that looks like a general chat box
- the empty state and suggestions do not make the intended job explicit enough
- the assistant can answer without staying tightly grounded in the current experiment context

This makes the feature feel broad but not decisive.

## Goal

Make the assistant reliably useful for students during experiment work.

Success means:

- a student can ask what the current experiment is asking them to do
- a student can ask for concept explanations in the context of the current lesson
- a student can ask for help reading HTML / Blockly / Notebook / Python experiment resources
- a student can ask for help understanding an error and get next-step guidance
- the assistant does not expose teacher workflow behavior through the chat surface

## Non-Goals

- do not build teacher workflow orchestration in the AI assistant
- do not make the AI assistant create or bind QuickForm tasks
- do not make the AI assistant package or publish courses
- do not make the AI assistant generate Blockly drafts
- do not redesign the entire chat UI or add a new multi-agent framework

## Product Decision

The in-app AI assistant becomes a student help tool, not a teacher operations console.

Teacher-side automation stays available through dedicated tools and skills. If a user asks for teacher-only operations inside the chat surface, the assistant should answer with a short boundary message instead of attempting routing or execution.

## Context Model

The current frontend already has enough context to support grounded student help:

- course id and title
- section index and title
- experiment index, title, and description
- primary HTML entry
- primary Blockly entry
- primary Notebook entry
- primary Python entry
- file overview for the current experiment

This context should remain the main grounding payload sent with each AI request.

## UX Changes

### 1. Single assistant identity

Use one stable student-facing identity across the app:

- title and copy describe a learning helper
- no teacher-mode chat personality
- no teacher-task empty-state suggestions

### 2. Student-first suggestions

The first-screen suggestions should bias toward high-frequency student needs:

- understand the current experiment goal
- explain the core concept in simple language
- analyze an error or unexpected output
- explain the difference between the current HTML / Blockly / Python resources
- suggest the next concrete step

### 3. No teacher workflow affordances

Remove or suppress chat affordances that imply the assistant can perform teacher operations.

Examples:

- no QuickForm setup suggestions
- no packaging or publishing suggestions
- no Blockly draft generation suggestions
- no teacher action confirmations in normal student chat

### 4. Grounded answers over general chat

The assistant should answer as if it is attached to the current experiment, not as a floating general-purpose bot.

When current experiment context exists, the answer should explicitly use it.

When context is missing, the answer should say so briefly and ask the student to open a course or experiment before giving more specific help.

## Backend Changes

### 1. Simplify `/api/ai/ask`

Remove teacher agent routing from the normal chat request path.

Current route behavior mixes:

- default AI chat
- QuickForm agent
- XEdu pack agent
- Blockly builder agent

The student assistant path should instead:

- always use the normal AI service for chat answers
- pass the current experiment context through `request_context`
- return a plain answer payload

If the question is clearly about teacher-only operations, return a short explanatory answer without routing into agent services.

### 2. Keep teacher tool services, but out of chat

Do not delete:

- QuickForm agent service
- XEdu pack agent service
- Blockly builder agent service

They still have value, but they should not be part of the student chat path.

### 3. Strengthen the system prompt

The student prompt should explicitly instruct the model to:

- explain the current experiment goal first
- use the current course and experiment context when available
- give short, ordered steps
- help interpret errors before suggesting fixes
- avoid doing teacher-side management or publishing guidance
- avoid pretending it executed anything

### 4. Add context-aware fallback behavior

When the request has no experiment context:

- answer the general learning question if possible
- otherwise ask the student to open the current experiment or provide the error text

## Frontend Changes

### 1. Freeze the assistant surface to student mode

The AI page should keep the student learning presentation even if teacher mode is unlocked elsewhere.

This does not require removing teacher mode from the rest of the app. It only changes the AI surface identity and suggestions.

### 2. Preserve current experiment context wiring

Continue sending:

- course
- section
- experiment
- entries
- overview

This is already the right shape for grounded help.

### 3. Simplify agent-card behavior

Once teacher agent routing is removed from student chat, the confirmation-card path should no longer be a primary flow for the assistant.

Implementation can either:

- fully remove agent-card rendering from the student assistant path, or
- keep the renderer but stop producing those response types from `/api/ai/ask`

The second option is lower risk and preferred first.

## Copy Rules

The assistant should sound like a precise study helper.

Answer style requirements:

- explain in concrete terms
- prefer short steps
- quote or reference the current experiment title when relevant
- separate explanation from next action
- avoid teacher/admin instructions unless explicitly clarifying a boundary

## Error-Handling Rules

For error questions:

1. identify whether the student included enough evidence
2. if not, ask for the exact error message, screenshot, or code snippet
3. if enough context exists, explain the likely cause in plain language
4. give the next smallest verification step

For unsupported teacher-task questions:

- answer briefly that the chat assistant is focused on student experiment help
- point to the correct teacher-side tool category without pretending to execute it

## File Impact

Expected primary files:

- `backend/api/routes/ai.py`
- `backend/services/ai_service.py`
- `renderer/js/experience-config.js`
- `renderer/js/ai.js`

Possible secondary files if needed:

- tests covering `/api/ai/ask`
- tests covering student assistant UI copy or behavior

## Testing

Minimum verification:

1. student-mode chat request returns normal AI answer without teacher agent routing
2. teacher-operation phrases in chat do not trigger QuickForm / pack / Blockly agent execution
3. current experiment context is still included in the request payload
4. empty-state suggestions and header copy stay student-focused

Useful regression tests:

- route test for teacher-keyword questions falling back to normal student-safe response
- prompt-preparation test confirming experiment context is preserved
- frontend test for student assistant copy and empty-state chips

## Rollout

This should ship as a narrow refocus, not a large rewrite.

Recommended order:

1. remove teacher routing from the chat path
2. tighten student prompt and boundary responses
3. update frontend copy and suggestions
4. add tests for route behavior and student-focused UI state

## Open Assumptions

- teacher-side skills and tools will continue to exist outside the student chat surface
- current experiment context remains available from the resources workspace
- keeping the existing chat shell is acceptable for the first pass

## Decision

Do not expand the AI assistant into a broader agent console.

Shrink it into a context-aware student experiment helper and move teacher automation concerns out of the chat path.
