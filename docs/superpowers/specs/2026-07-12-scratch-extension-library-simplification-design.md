# Scratch Extension Library Simplification

## Goal

Make the XEdu extension picker follow Scratch's capability-first pattern: show only student-facing AI tasks and the named K10 hardware extension.

## Visible Library

The XEdu tab contains nine cards: image classification, object detection, face recognition, body pose, hand recognition, text recognition, image segmentation, depth sensing, and `行空板 K10`.

## Hidden Compatibility Modules

`xeduAI`, `xeduVision`, `xeduWorkflow`, `xeduImage`, `xeduMedia`, `xeduMath`, and `xeduResults` are removed from Scratch VM registration. Their wrapper modules are deleted. `xeduDevice` remains registered and is presented as the `行空板 K10` card.

Course `.sb3` files are migrated to task-specific extensions before the generic ids are removed. Current body-detection lessons become an `xeduBodySensing_detectBodies` command followed by the `xeduBodySensing_bodyLastResult` reporter that feeds the existing result variable.

## Copy Rules

Card names describe a single visible ability. Descriptions state the outcome in plain language. The K10 description must not promise unsupported sensor or connection workflows; it names GPIO, serial, PWM, and servo control.
