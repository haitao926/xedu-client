# Project Course Model

Use this reference when creating, repairing, or validating XEdu course folders.

## Structure

Use the existing model:

```text
course.json
sections[]
sections[].experiments[]
sections[].experiments[].files[]
```

Every referenced path is relative to the course root and stays inside it. Do not add a parallel schema to record experiment forms.

## Experiment Example

```json
{
  "title": "实验1：图像分类舞台",
  "description": "用 Scratch 摄像头感知识别物体并做舞台反馈。",
  "files": [
    {
      "path": "lesson1/exp1/scratch/classify.sb3",
      "type": "scratch",
      "name": "Scratch 实验"
    }
  ],
  "student_tasks": ["修改角色对识别结果的反馈。"]
}
```

## File Types

- `html`: `.html` or `.htm` interactive experiment
- `scratch`: `.sb3` Scratch project
- `ipynb`: Jupyter Notebook
- `blockly`: historical `.blockly.xml` or `.blockly.json`
- `file`: teacher notes, worksheets, data, images, audio, scripts, and other material

Use `lessonN/expM/scratch/*.sb3` for new Scratch projects. Preserve existing valid paths.

## Resource Status

There is no mandatory three-form loop. Determine intended forms from the course plan or handoff, then report which intended files are present or missing. Separately report `ready`/`partial`/`broken` file-existence results from `inspect_course()`. If an existing experiment has only Blockly, mark a Scratch migration gap; do not treat that as a reason to generate Blockly.

## Packaging

`xedu-pack` builds delivery copies and publishes courses. Treat `_xedu_pack/` as output, not source.
