import { access, stat } from 'node:fs/promises';
import path from 'node:path';

const REQUIRED_FILES = [
  'checkpoint/body17.onnx',
  'checkpoint/body17_l.onnx',
  'checkpoint/body26.onnx',
  'checkpoint/bodydetect.onnx',
  'checkpoint/cls_imagenet.onnx',
  'checkpoint/cocodetect.onnx',
  'checkpoint/depth_anything.onnx',
  'checkpoint/det_coco_l.onnx',
  'checkpoint/drive_perception.onnx',
  'checkpoint/embedding_audio.onnx',
  'checkpoint/embedding_image.onnx',
  'checkpoint/embedding_text.onnx',
  'checkpoint/face106.onnx',
  'checkpoint/face_detection_yunet_2023mar.onnx',
  'checkpoint/face_landmark106_mobilenet.onnx',
  'checkpoint/gen_color.onnx',
  'checkpoint/gen_style_candy.onnx',
  'checkpoint/gen_style_mosaic.onnx',
  'checkpoint/gen_style_pointilism.onnx',
  'checkpoint/gen_style_rain-princess.onnx',
  'checkpoint/gen_style_udnie.onnx',
  'checkpoint/hand21.onnx',
  'checkpoint/handdetect.onnx',
  'checkpoint/imagenet1k.onnx',
  'checkpoint/nlp_qa.onnx',
  'checkpoint/palm_detection_full_inf_post_192x192.onnx',
  'checkpoint/pose_wholebody133.onnx',
  'checkpoint/seg_sam_decoder.onnx',
  'checkpoint/seg_sam_encoder.onnx',
  'checkpoint/whole133.onnx',
];

const missing = [];
let totalBytes = 0;
for (const relativePath of REQUIRED_FILES) {
  const target = path.resolve(relativePath);
  try {
    const details = await stat(target);
    if (!details.isFile() || details.size === 0) {
      missing.push(`${relativePath} (missing or empty)`);
      continue;
    }
    totalBytes += details.size;
  } catch {
    missing.push(relativePath);
  }
}

if (missing.length > 0) {
  console.error('Official release model assets are incomplete. Provision the pinned checkpoint bundle before building:');
  for (const item of missing) console.error(`- ${item}`);
  console.error('The checkpoint directory is intentionally ignored by Git because it is too large for source control.');
  process.exitCode = 1;
} else {
  console.log(`Release inputs verified: ${REQUIRED_FILES.length} checkpoint files (${totalBytes} bytes).`);
}
