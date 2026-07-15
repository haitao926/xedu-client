import blocklyColorContract from '../../../config/blockly-colors.json';
import {
  DEFAULT_BLOCKLY_IMAGE_INPUT,
  DEFAULT_BLOCKLY_IMAGE_INPUT_SEQUENCE,
} from './sample-assets.js';

const THREE_D_ICON_ASSETS = Object.freeze({
  detect: '/api/resources/frontend-assets/assets/3dicons-transparent/target.png',
  nodes: '/api/resources/frontend-assets/assets/3dicons-transparent/thumb-up.png',
  text: '/api/resources/frontend-assets/assets/3dicons-transparent/file-text.png',
  spark: '/api/resources/frontend-assets/assets/3dicons-transparent/magic-trick.png',
  media: '/api/resources/frontend-assets/assets/3dicons-transparent/camera.png',
  result: '/api/resources/frontend-assets/assets/3dicons-transparent/tick.png',
  layers: '/api/resources/frontend-assets/assets/3dicons-transparent/picture.png',
  depth: '/api/resources/frontend-assets/assets/3dicons-transparent/cube.png',
  blocks: '/api/resources/frontend-assets/assets/3dicons-transparent/setting.png',
});

export const DEFAULT_CATEGORY_COLOUR = blocklyColorContract.brand?.primary || '#5f6792';

function makeCategoryIconSvg(innerMarkup, { strokeWidth = 1.8, scale = 1.14 } = {}) {
  const inner = String(innerMarkup || '')
    .replace(/^<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '');
  const offset = ((18 - (18 * scale)) / 2).toFixed(2);
  return `
    <svg viewBox="0 0 18 18" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(${offset} ${offset}) scale(${scale})" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">
        ${inner}
      </g>
    </svg>
  `;
}

function makeCategoryImageIcon(imagePath) {
  return `
    <span class="xedu-3d-category-icon-shell" aria-hidden="true">
      <img class="xedu-3d-category-icon-image" src="${imagePath}" alt="">
    </span>
  `;
}

const ICON_CLUSTER = Object.freeze({
  blocks: makeCategoryIconSvg('<path d="M5.1 5.1h3.2v3.2H5.1zM9.7 5.1h3.2v3.2H9.7zM5.1 9.7h3.2v3.2H5.1zM9.7 9.7h3.2v3.2H9.7z"/>', { strokeWidth: 1.55, scale: 1.05 }),
  spark: makeCategoryImageIcon(THREE_D_ICON_ASSETS.spark),
  layers: makeCategoryImageIcon(THREE_D_ICON_ASSETS.layers),
  media: makeCategoryImageIcon(THREE_D_ICON_ASSETS.media),
  detect: makeCategoryImageIcon(THREE_D_ICON_ASSETS.detect),
  nodes: makeCategoryImageIcon(THREE_D_ICON_ASSETS.nodes),
  text: makeCategoryImageIcon(THREE_D_ICON_ASSETS.text),
  list: makeCategoryIconSvg('<path d="M5.2 5.2h.1M7.7 5.2h5.1M5.2 9h.1M7.7 9h5.1M5.2 12.8h.1M7.7 12.8h5.1"/>', { strokeWidth: 1.8, scale: 1.05 }),
  variable: makeCategoryIconSvg('<path d="M4.9 12.9 8 5.1h2l3.1 7.8M6.2 10h5.6"/>', { strokeWidth: 1.65, scale: 1.04 }),
  function: makeCategoryIconSvg('<path d="M11.8 5.1c-2.4 0-3.6 1.4-3.6 3.9v3.9M5.6 8.3h5.4M11.7 8.3h1.1"/>', { strokeWidth: 1.6, scale: 1.04 }),
  math: makeCategoryIconSvg('<path d="M5.1 6.4h7.8M5.1 11.6h7.8M9 4.8v3.2M9 10v3.2"/>', { strokeWidth: 1.75, scale: 1.05 }),
  flow: makeCategoryIconSvg('<path d="M6 4.8h6v3.1H6zM6 10.1h6v3.1H6zM9 7.9v2.2"/>', { strokeWidth: 1.6, scale: 1.05 }),
  result: makeCategoryImageIcon(THREE_D_ICON_ASSETS.result),
  debug: makeCategoryIconSvg('<path d="M6.2 6.3h5.6M6.2 9h5.6M7.4 11.8h3.2M5.1 4.9h7.8v8.2H5.1z"/>', { strokeWidth: 1.55, scale: 1.05 }),
  comms: makeCategoryIconSvg('<path d="M4.7 6.4c2.7-2.1 5.9-2.1 8.6 0M6.6 8.9c1.6-1.2 3.2-1.2 4.8 0M8.5 11.2h1"/>', { strokeWidth: 1.65, scale: 1.05 }),
  depth: makeCategoryImageIcon(THREE_D_ICON_ASSETS.depth),
});

export const CATEGORY_ICON_SVGS = Object.freeze({
  基础编程: ICON_CLUSTER.blocks,
  逻辑: ICON_CLUSTER.blocks,
  循环: ICON_CLUSTER.flow,
  数学: ICON_CLUSTER.math,
  文本: ICON_CLUSTER.text,
  列表: ICON_CLUSTER.list,
  变量: ICON_CLUSTER.variable,
  函数: ICON_CLUSTER.function,
  XEdu: ICON_CLUSTER.spark,
  'XEdu Hub': ICON_CLUSTER.spark,
  核心语法: ICON_CLUSTER.flow,
  AI流程: ICON_CLUSTER.flow,
  结果处理: ICON_CLUSTER.result,
  '媒体与设备': ICON_CLUSTER.media,
  图像视频: ICON_CLUSTER.media,
  图像与视频: ICON_CLUSTER.media,
  行空板K10: ICON_CLUSTER.media,
  K10: ICON_CLUSTER.media,
  图像分类: ICON_CLUSTER.result,
  目标检测: ICON_CLUSTER.detect,
  关键点识别: ICON_CLUSTER.nodes,
  OCR: ICON_CLUSTER.text,
  内容生成: ICON_CLUSTER.spark,
  图像分割: ICON_CLUSTER.layers,
  深度估计: ICON_CLUSTER.depth,
  通信控制: ICON_CLUSTER.comms,
  行空板K10: ICON_CLUSTER.media,
  K10: ICON_CLUSTER.media,
  '调试与扩展': ICON_CLUSTER.debug,
  调试扩展: ICON_CLUSTER.debug,
  进阶调试: ICON_CLUSTER.debug,
  扩展工具: ICON_CLUSTER.comms,
});

export const DEFAULT_CATEGORY_ICON_SVG = ICON_CLUSTER.blocks;
export const CATEGORY_COLOR_PALETTE = Object.freeze(blocklyColorContract.categoryPalette);

export function resolveCategoryColour(name, fallback = DEFAULT_CATEGORY_COLOUR) {
  const normalized = String(name || '').trim();
  return CATEGORY_COLOR_PALETTE[normalized] || fallback;
}

export const TASK_FIRST_CATEGORY_META = Object.freeze(blocklyColorContract.taskFirstCategories);
export const DEFAULT_INPUT_RESOURCE = DEFAULT_BLOCKLY_IMAGE_INPUT;
export const DEFAULT_INPUT_SEQUENCE = DEFAULT_BLOCKLY_IMAGE_INPUT_SEQUENCE;
