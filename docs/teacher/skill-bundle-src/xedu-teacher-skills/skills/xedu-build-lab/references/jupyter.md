# Jupyter Lab

Build a readable, runnable notebook with its supporting project files intact.

## Structure

- Keep concise teaching cells: context, runnable code, observable output, interpretation, and a parameter/data challenge.
- Move repetitive utilities into local `.py` files when that improves the learner path.
- Preserve required datasets, images, models, configuration, and helper files beside the notebook using relative paths.
- Use verified Python and XEdu APIs. Do not fabricate package versions or successful outputs.

## Imported Project Dumps

Inventory every notebook and supporting file before selecting learner entrypoints. Identify Python dependencies from imports and available metadata, but do not infer exact versions without evidence. Record XEduHub, model, network, camera, or hardware services. Do not discard notebooks or assets merely because they are not the first entrypoint.

## Verification

Run the key learner path in the selected environment when available. Restart the kernel and run in order where practical. Confirm a meaningful input change affects a chart, table, image, model result, or other visible output. Report cells or dependencies that could not be executed.
