# XEdu Scratch Editor

This subproject embeds the official Scratch editor for XEdu Client and patches in the first local `XEdu AI` extension.

## Commands

- `npm run install:scratch` from the repository root installs this subproject.
- `npm run build:scratch` from the repository root builds `scratch-editor/build`.

The build uses official `@scratch/scratch-gui@14.1.0` and `@scratch/scratch-vm@14.1.0`, then applies a small local patch:

- registers `xeduAI` as a built-in Scratch VM extension
- adds `XEdu AI` to the Scratch extension library
- provides minimal AI reporter blocks backed by `/api/resources/xeduhub/execute`
