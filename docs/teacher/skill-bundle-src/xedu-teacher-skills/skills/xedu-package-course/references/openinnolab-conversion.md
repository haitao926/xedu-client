# OpenInnoLab Conversion

## SenseInnoBlocks

Preserve the source `.ib`. Generate an inventory first:

```bash
python3 scripts/xedu_package.py scratch-audit \
  --project source.ib \
  --catalog current-xedu-scratch-catalog.json \
  --mappings reviewed-mappings.json \
  --output scratch-compatibility.json
```

The catalog must be derived from the current XEdu Scratch extension registration and block descriptors, not memory. Each catalog opcode is the full project opcode, such as `xeduCamera_enableCamera`. A mapping requires target opcode, argument/value transforms, runtime dependencies, and source evidence.

Classify every used opcode:

- `exact-match`: same opcode, arguments, values, and behavior.
- `renamed-mappable`: a deterministic rewrite preserves behavior.
- `unsupported`: no proven behavior-preserving target or required model asset exists.
- `runtime-dependency`: compatibility also depends on camera, XEduHub, model, network, or hardware.

Any `unsupported` entry makes `blocking: true`; do not emit a converted `.sb3`. Similar names are not evidence. In particular, custom image or gesture training is not equivalent to ImageNet classification or hand keypoints when labels, training behavior, and model assets differ.

After a non-blocking audit, apply only reviewed transforms to a copy, preserve media assets, change extension declarations consistently, then open, run, save, and reopen the result in the current XEdu Scratch editor. Attach the report beside the converted project.

Catalog shape:

```json
{"extensions":{"xeduCamera":{"opcodes":["xeduCamera_enableCamera"],"runtime_dependencies":["camera-permission"]}}}
```

Mappings shape:

```json
{"mappings":{"source_opcode":{"target_opcodes":["target_opcode"],"conditions":["argument transform"],"runtime_dependencies":[],"evidence":"current source path and block descriptor"}}}
```

## Jupyter

Preserve every notebook and supporting file. Record:

1. learner entrypoint notebook or notebooks;
2. imports and evidenced package/version requirements;
3. XEduHub, model, network, camera, or hardware services;
4. relative local assets referenced by notebooks and Python files;
5. key-path execution evidence and unresolved runtime gaps.

Add the intact project subtree to one experiment in `course.json`; do not flatten it or copy only the first notebook.
