# Scratch Lab

Use current XEdu Scratch registrations as the authority. Inspect the editor extension registry and block descriptors before creating or changing project blocks.

## Design

- Prefer a visible flow: start, prepare input or camera, enable the capability, wait for readiness, read or test the result, and show feedback on stage.
- Make feedback observable through a sprite, backdrop, costume, speech, variable, list, sound, or motion.
- Use native Scratch events, control, motion, looks, sound, data, operators, and sensing where appropriate.
- Include only registered XEdu extensions and exact opcodes with matching arguments and behavior.
- State camera permission, local XEduHub, model, network, and hardware dependencies.

## Existing `.sb3` Or `.ib`

For `.sb3`, inspect `project.json`, extensions, every used opcode, menus, fields, inputs, assets, and monitor state. Opening the archive is only structural validation.

For SenseInnoBlocks `.ib`, do not rename blocks by resemblance. Send it to `xedu-package-course` for an opcode-level `scratch-compatibility.json`. Custom training/model blocks are not equivalent to generic XEdu classification or hand-keypoint sensing without matching model artifacts and behavior.

## Verification

Open, start, exercise the learner path, save, close, and reopen in the current XEdu Scratch editor. Confirm every extension and opcode exists in the current registration source and that runtime-dependent paths are actually tested or clearly marked unverified.
