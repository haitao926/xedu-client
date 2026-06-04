import sampleAssetsConfig from '../../../config/sample-assets.json' with { type: 'json' };

const blocklySmoke = sampleAssetsConfig.blocklySmoke || {};
const aliases = blocklySmoke.inputAliases || {};

export const BLOCKLY_SMOKE_ROOT = blocklySmoke.root || 'courses/blockly-smoke';
export const DEFAULT_BLOCKLY_IMAGE_INPUT = blocklySmoke.image || `${BLOCKLY_SMOKE_ROOT}/demo.jpg`;
export const DEFAULT_BLOCKLY_VIDEO_INPUT = blocklySmoke.video || `${BLOCKLY_SMOKE_ROOT}/demo.mp4`;
export const DEFAULT_BLOCKLY_AUDIO_INPUT = blocklySmoke.audio || `${BLOCKLY_SMOKE_ROOT}/demo.wav`;
export const DEFAULT_BLOCKLY_VIDEO_POSTER = blocklySmoke.videoPoster || `${BLOCKLY_SMOKE_ROOT}/assets/xedu-test-scene-1.png`;
export const DEFAULT_BLOCKLY_IMAGE_INPUT_SEQUENCE = JSON.stringify([DEFAULT_BLOCKLY_IMAGE_INPUT, DEFAULT_BLOCKLY_IMAGE_INPUT]);
export const BLOCKLY_SMOKE_IMAGE_ALIASES = Object.freeze(Array.isArray(aliases.image) ? aliases.image.slice() : []);
export const BLOCKLY_SMOKE_VIDEO_ALIASES = Object.freeze(Array.isArray(aliases.video) ? aliases.video.slice() : []);
export const BLOCKLY_SMOKE_AUDIO_ALIASES = Object.freeze(Array.isArray(aliases.audio) ? aliases.audio.slice() : []);
