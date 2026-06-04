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
      <defs>
        <linearGradient id="xeduIconSurface" x1="3" y1="2" x2="15" y2="16" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#ffffff" stop-opacity=".98"/>
          <stop offset=".52" stop-color="#f4f8fd" stop-opacity=".96"/>
          <stop offset="1" stop-color="#dce8f8" stop-opacity=".98"/>
        </linearGradient>
        <linearGradient id="xeduIconRim" x1="2.8" y1="2" x2="14.7" y2="16" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="rgba(255,255,255,0.95)"/>
          <stop offset="1" stop-color="rgba(148, 163, 184, 0.5)"/>
        </linearGradient>
        <filter id="xeduIconShadow" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">
          <feDropShadow dx="0" dy="1.1" stdDeviation="1.1" flood-color="#1e293b" flood-opacity=".16"/>
        </filter>
      </defs>
      <g filter="url(#xeduIconShadow)">
        <rect x="1.8" y="1.8" width="14.4" height="14.4" rx="4.6" fill="url(#xeduIconSurface)"/>
        <rect x="1.8" y="1.8" width="14.4" height="14.4" rx="4.6" stroke="url(#xeduIconRim)" stroke-width=".72"/>
        <path d="M4.2 4.4h5.4" stroke="#ffffff" stroke-opacity=".82" stroke-width=".8" stroke-linecap="round"/>
      </g>
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
  blocks: makeCategoryImageIcon(THREE_D_ICON_ASSETS.blocks),
  spark: makeCategoryImageIcon(THREE_D_ICON_ASSETS.spark),
  layers: makeCategoryImageIcon(THREE_D_ICON_ASSETS.layers),
  media: makeCategoryImageIcon(THREE_D_ICON_ASSETS.media),
  detect: makeCategoryImageIcon(THREE_D_ICON_ASSETS.detect),
  nodes: makeCategoryImageIcon(THREE_D_ICON_ASSETS.nodes),
  text: makeCategoryImageIcon(THREE_D_ICON_ASSETS.text),
  list: makeCategoryImageIcon(THREE_D_ICON_ASSETS.blocks),
  variable: makeCategoryImageIcon(THREE_D_ICON_ASSETS.blocks),
  function: makeCategoryImageIcon(THREE_D_ICON_ASSETS.blocks),
  math: makeCategoryImageIcon(THREE_D_ICON_ASSETS.blocks),
  flow: makeCategoryImageIcon(THREE_D_ICON_ASSETS.blocks),
  result: makeCategoryImageIcon(THREE_D_ICON_ASSETS.result),
  debug: makeCategoryImageIcon(THREE_D_ICON_ASSETS.blocks),
  comms: makeCategoryImageIcon(THREE_D_ICON_ASSETS.blocks),
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
  图像分类: ICON_CLUSTER.result,
  目标检测: ICON_CLUSTER.detect,
  关键点识别: ICON_CLUSTER.nodes,
  OCR: ICON_CLUSTER.text,
  内容生成: ICON_CLUSTER.spark,
  图像分割: ICON_CLUSTER.layers,
  深度估计: ICON_CLUSTER.depth,
  通信控制: ICON_CLUSTER.comms,
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
