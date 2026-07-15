const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const guiRoot = path.join(root, 'node_modules', '@scratch', 'scratch-gui');
const xeduExtensionAssetSourceDir = path.join(root, 'src', 'assets', 'xedu-extensions');
const xeduExtensionAssetTargetDir = path.join(guiRoot, 'src', 'lib', 'libraries', 'extensions', 'xedu');
const xeduExtensions = [
  {
    id: 'xeduCamera', name: 'XEdu 摄像头', description: '在舞台上开启和显示摄像头画面。',
    asset: 'xedu-camera.png', importName: 'xeduCameraIconURL', insetSymbol: 'camera', color: '#0EA5A4',
    moduleFile: 'xedu_camera.js',
    tags: ['xedu']
  },
  {
    id: 'xeduImageClassification', name: 'XEdu 图像分类', description: '识别图像类别和置信度。',
    asset: 'xedu-image-classification.png', importName: 'xeduImageClassificationIconURL', insetSymbol: 'classification', color: '#2563EB',
    moduleFile: 'xedu_image_classification.js',
    tags: ['xedu']
  },
  {
    id: 'xeduObjectSensing', name: 'XEdu 物体感知', description: '检测物体、数量和位置。',
    asset: 'xedu-object-sensing.png', importName: 'xeduObjectSensingIconURL', insetSymbol: 'object', color: '#F97316',
    moduleFile: 'xedu_object_sensing.js',
    tags: ['xedu']
  },
  {
    id: 'xeduFaceSensing', name: 'XEdu 人脸感知', description: '检测人脸并读取面部关键点。',
    asset: 'xedu-face-sensing.png', importName: 'xeduFaceSensingIconURL', insetSymbol: 'face', color: '#F43F5E',
    moduleFile: 'xedu_face_sensing.js',
    tags: ['xedu']
  },
  {
    id: 'xeduBodySensing', name: 'XEdu 人体感知', description: '检测人体并感知身体姿态。',
    asset: 'xedu-body-sensing.png', importName: 'xeduBodySensingIconURL', insetSymbol: 'body', color: '#4F46E5',
    moduleFile: 'xedu_body_sensing.js',
    tags: ['xedu']
  },
  {
    id: 'xeduHandSensing', name: 'XEdu 手部感知', description: '检测手部并读取手部关键点。',
    asset: 'xedu-hand-sensing.png', importName: 'xeduHandSensingIconURL', insetSymbol: 'hand', color: '#D97706',
    moduleFile: 'xedu_hand_sensing.js',
    tags: ['xedu']
  },
  {
    id: 'xeduTextRecognition', name: 'XEdu 文字识别', description: '读取图像中的文字内容。',
    asset: 'xedu-text-recognition.png', importName: 'xeduTextRecognitionIconURL', insetSymbol: 'text', color: '#0D9488',
    moduleFile: 'xedu_text_recognition.js',
    tags: ['xedu']
  },
  {
    id: 'xeduImageSegmentation', name: 'XEdu 图像分割', description: '根据提示分割图像区域。',
    asset: 'xedu-image-segmentation.png', importName: 'xeduImageSegmentationIconURL', insetSymbol: 'segmentation', color: '#16A34A',
    moduleFile: 'xedu_image_segmentation.js',
    tags: ['xedu']
  },
  {
    id: 'xeduDepthSensing', name: 'XEdu 深度感知', description: '估计图像中物体的相对远近。',
    asset: 'xedu-depth-sensing.png', importName: 'xeduDepthSensingIconURL', insetSymbol: 'depth', color: '#0F766E',
    moduleFile: 'xedu_depth_sensing.js',
    tags: ['xedu']
  },
  {
    id: 'xeduDevice',
    name: '行空板 K10',
    description: '控制引脚、PWM、串口和舵机。',
    asset: 'xedu-device.png',
    importName: 'xeduDeviceIconURL',
    insetSymbol: 'device',
    color: '#F97316',
    moduleFile: 'xedu_device.js',
    tags: ['xedu']
  }
];

const xeduInsetIcon = (symbol, color) => {
  const symbols = {
    camera: '<rect x="7" y="13" width="19" height="14" rx="3"/><path d="m26 17 7-4v14l-7-4z"/>',
    classification: '<rect x="8" y="9" width="24" height="22" rx="3"/><circle cx="15" cy="16" r="3"/><path d="m21 13 7 7m-7 0 7-7m-13 11h13"/>',
    object: '<path d="M14 7H8v6m24 0V7h-6M8 27v6h6m12 0h6v-6"/><rect x="14" y="14" width="12" height="12" rx="2"/>',
    face: '<path d="M20 7c7 0 11 5 11 12s-4 14-11 14S9 26 9 19 13 7 20 7Z"/><circle cx="16" cy="18" r="1"/><circle cx="24" cy="18" r="1"/><path d="M15 25c3 2 7 2 10 0"/>',
    body: '<circle cx="20" cy="8" r="4"/><path d="M20 12v11m0-7-8 5m8-5 8 5m-8 2-6 10m6-10 6 10"/>',
    hand: '<path d="M13 20v-8a2 2 0 0 1 4 0v7m0-9a2 2 0 0 1 4 0v9m0-7a2 2 0 0 1 4 0v7m0-5a2 2 0 0 1 4 0v8c0 6-4 10-10 10-5 0-9-4-9-9v-3a2 2 0 0 1 3-2Z"/>',
    text: '<rect x="10" y="6" width="20" height="28" rx="3"/><path d="M15 14h10m-10 6h10m-10 6h7"/>',
    segmentation: '<path d="M14 8H8v6m24 0V8h-6M8 26v6h6m12 0h6v-6"/><circle cx="20" cy="20" r="7"/>',
    depth: '<path d="M8 12h24v7H8zm4 7h16v7H12zm4 7h8v7h-8z"/>',
    device: '<rect x="9" y="11" width="22" height="18" rx="3"/><path d="M14 7v4m6-4v4m6-4v4m-12 18v4m6-4v4m6-4v4M15 17h10v6H15z"/>'
  };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <rect width="40" height="40" rx="10" fill="${color}" stroke="none"/>
    ${symbols[symbol] || symbols.camera}
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};
const vmRoots = [
  path.join(root, 'node_modules', '@scratch', 'scratch-vm'),
  path.join(guiRoot, 'node_modules', '@scratch', 'scratch-vm'),
].filter((vmRoot, index, all) => fs.existsSync(vmRoot) && all.indexOf(vmRoot) === index);

function ensureFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf8') === content) {
    return;
  }
  fs.writeFileSync(filePath, content, 'utf8');
}

function patchFile(filePath, transform) {
  const original = fs.readFileSync(filePath, 'utf8');
  const next = transform(original);
  if (next !== original) {
    fs.writeFileSync(filePath, next, 'utf8');
  }
}

function assertExists(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Expected Scratch file not found: ${filePath}`);
  }
}

const extensionSourceDir = path.join(root, 'src', 'extensions', 'scratch3_xedu_ai');
const extensionFiles = ['index.js', 'descriptor.js', 'stage-sensing.js'];
const moduleExtensionFiles = xeduExtensions
  .filter(extension => extension.moduleFile)
  .map(extension => [extension.moduleFile, extension.moduleFile]);
const removedModuleFiles = [
  'xedu_vision.js', 'xedu_workflow.js', 'xedu_image.js', 'xedu_media.js', 'xedu_math.js', 'xedu_results.js',
];
if (!vmRoots.length) {
  throw new Error('Expected at least one Scratch VM package under scratch-editor/node_modules');
}
for (const vmRoot of vmRoots) {
  for (const fileName of extensionFiles) {
    ensureFile(
      path.join(vmRoot, 'src', 'extensions', 'scratch3_xedu_ai', fileName),
      fs.readFileSync(path.join(extensionSourceDir, fileName), 'utf8')
    );
  }
  for (const [sourceName, destinationName] of moduleExtensionFiles) {
    ensureFile(
      path.join(vmRoot, 'src', 'extensions', destinationName),
      fs.readFileSync(path.join(root, 'src', 'extensions', sourceName), 'utf8')
    );
  }
  for (const fileName of removedModuleFiles) {
    fs.rmSync(path.join(vmRoot, 'src', 'extensions', fileName), {force: true});
  }

  const extensionManager = path.join(vmRoot, 'src', 'extension-support', 'extension-manager.js');
  assertExists(extensionManager);
  patchFile(extensionManager, (text) => {
    const registrations = xeduExtensions
      .filter(extension => extension.moduleFile)
      .map(extension => `    ${extension.id}: () => require('../extensions/${path.basename(extension.moduleFile, '.js')}')`)
      .join(',\n');
    const existingRegistrations = /^    xedu(?:AI|Vision|Workflow|Image|Media|Device|Math|Results|Camera|ImageClassification|ObjectSensing|FaceSensing|BodySensing|HandSensing|TextRecognition|ImageSegmentation|DepthSensing): .*\n?/gm;
    const withoutXEdu = text.replace(existingRegistrations, '');
    return withoutXEdu.replace(
      /    faceSensing: \(\) => require\('\.\.\/extensions\/scratch3_face_sensing'\),?/,
      "    faceSensing: () => require('../extensions/scratch3_face_sensing'),\n" + registrations + ','
    );
  });
}

fs.mkdirSync(xeduExtensionAssetTargetDir, {recursive: true});
for (const extension of xeduExtensions) {
  const source = path.join(xeduExtensionAssetSourceDir, extension.asset);
  const target = path.join(xeduExtensionAssetTargetDir, extension.asset);
  assertExists(source);
  if (!fs.existsSync(target) || fs.readFileSync(target).compare(fs.readFileSync(source)) !== 0) {
    fs.copyFileSync(source, target);
  }
}

const extensionLibrary = path.join(guiRoot, 'src', 'lib', 'libraries', 'extensions', 'index.jsx');
assertExists(extensionLibrary);
patchFile(extensionLibrary, (text) => {
  const xeduImports = xeduExtensions
    .map(extension => `import ${extension.importName} from './xedu/${extension.asset}';`)
    .join('\n');
  const items = xeduExtensions.map(extension => {
    const insetIcon = xeduInsetIcon(extension.insetSymbol, extension.color);
    const tagList = extension.tags.map(tag => `'${tag}'`).join(', ');
    return `    {\n        name: '${extension.name}',\n        extensionId: '${extension.id}',\n        iconURL: ${extension.importName},\n        insetIconURL: '${insetIcon}',\n        description: '${extension.description}',\n        featured: true,\n        tags: [${tagList}]\n    },\n`;
  }).join('');
  const existingXEduItems = /\s*\{\s*name: '[^']+',\s*extensionId: 'xedu[^']+',[\s\S]*?tags: \['xedu'\]\s*\},?/g;
  const legacyItem = /\s*\{\n\s*name: 'XEdu AI',[\s\S]*?featured: true\n\s*\},\n/;
  const restoreOfficialPenIcon = source => source.replace(
    /(        extensionId: 'pen',\n)\s*iconURL: 'data:image\/svg\+xml[^']+',\n\s*insetIconURL: 'data:image\/svg\+xml[^']+',/,
    `$1        iconURL: penIconURL,\n        insetIconURL: penInsetIconURL,`
  );
  let next = text;
  next = next.replace(/^import xedu[A-Za-z]+IconURL from '\.\/xedu\/[^']+';\n/gm, '');
  next = next.replace(
    "import faceSensingInsetIconURL from './faceSensing/faceSensing-small.svg';\n",
    `import faceSensingInsetIconURL from './faceSensing/faceSensing-small.svg';\n\n${xeduImports}\n`
  );
  next = next.replace(existingXEduItems, '');
  next = next.replace(legacyItem, '');
  next = next.replace(/export default \[\s*/, `export default [\n${items}`);
  return restoreOfficialPenIcon(next);
});

const extensionLibraryContainer = path.join(guiRoot, 'src', 'containers', 'extension-library.jsx');
assertExists(extensionLibraryContainer);
patchFile(extensionLibraryContainer, (text) => {
  let next = text;
  const tagBlock = `const extensionLibraryTags = [
    {
        tag: 'xedu',
        intlLabel: {
            id: 'xedu.extensionLibrary.tags.xedu',
            defaultMessage: 'XEdu',
            description: 'Tag for XEdu extensions'
        }
    },
    {
        tag: 'scratch',
        intlLabel: {
            id: 'xedu.extensionLibrary.tags.scratch',
            defaultMessage: 'Scratch 官方',
            description: 'Tag for built-in Scratch extensions'
        }
    }
];`;
  if (next.includes('const extensionLibraryTags = [')) {
    next = next.replace(
      /const extensionLibraryTags = \[[\s\S]*?\];\n\nconst withExtensionTags/,
      `${tagBlock}\n\nconst withExtensionTags`
    );
  } else {
    next = next.replace(
      'class ExtensionLibrary extends React.PureComponent {',
      `${tagBlock}

const withExtensionTags = extension => {
    const sourceTags = Array.isArray(extension.tags) ? extension.tags : [];
    const namespaceTag = String(extension.extensionId || '').startsWith('xedu') ? 'xedu' : 'scratch';
    return {
        ...extension,
        tags: Array.from(new Set([namespaceTag, ...sourceTags]))
    };
};

class ExtensionLibrary extends React.PureComponent {`
    );
  }
  next = next.replace(
    `        const extensionLibraryThumbnailData = extensionLibraryContent.map(extension => ({
            rawURL: extension.iconURL || extensionIcon,
            ...extension
        }));`,
    `        const extensionLibraryThumbnailData = extensionLibraryContent.map(extension => withExtensionTags({
            rawURL: extension.iconURL || extensionIcon,
            ...extension
        }));`
  );
  next = next.replace(
    `                filterable={false}
                id="extensionLibrary"`,
    `                filterable
                defaultTag="xedu"
                hideAllTag
                tags={extensionLibraryTags}
                id="extensionLibrary"`
  );
  next = next.replace(
    `                filterable
                tags={extensionLibraryTags}
                id="extensionLibrary"`,
    `                filterable
                defaultTag="xedu"
                hideAllTag
                tags={extensionLibraryTags}
                id="extensionLibrary"`
  );
  next = next.replace(
    `                filterable
                defaultTag="xedu"
                tags={extensionLibraryTags}
                id="extensionLibrary"`,
    `                filterable
                defaultTag="xedu"
                hideAllTag
                tags={extensionLibraryTags}
                id="extensionLibrary"`
  );
  return next;
});

const blocksContainer = path.join(guiRoot, 'src', 'containers', 'blocks.jsx');
assertExists(blocksContainer);
patchFile(blocksContainer, (text) => text.replace(
  'if (this.props.colorMode !== DEFAULT_MODE) {',
  "if (this.props.colorMode !== DEFAULT_MODE && !String(categoryInfo.id).startsWith('xedu')) {"
));

const colorModeBlockHelpers = path.join(guiRoot, 'src', 'lib', 'settings', 'color-mode', 'blockHelpers.js');
assertExists(colorModeBlockHelpers);
patchFile(colorModeBlockHelpers, (text) => {
  if (text.includes("if (String(extension.id).startsWith('xedu')) return extension;")) return text;
  return text.replace(
    '    return dynamicBlockXML.map(extension => {\n        const dom = parser.parseFromString(extension.xml, \'text/xml\');',
    "    return dynamicBlockXML.map(extension => {\n        if (String(extension.id).startsWith('xedu')) return extension;\n        const dom = parser.parseFromString(extension.xml, 'text/xml');"
  );
});

const libraryComponent = path.join(guiRoot, 'src', 'components', 'library', 'library.jsx');
assertExists(libraryComponent);
patchFile(libraryComponent, (text) => {
  let next = text;
  next = next.replace(
    `            selectedTag: ALL_TAG.tag,`,
    `            selectedTag: props.defaultTag || ALL_TAG.tag,`
  );
  if (!next.includes('defaultTag: PropTypes.string')) {
    next = next.replace(
      `    data: PropTypes.arrayOf(`,
      `    defaultTag: PropTypes.string,\n    data: PropTypes.arrayOf(`
    );
  }
  if (!next.includes('hideAllTag: PropTypes.bool')) {
    next = next.replace(
      `    filterable: PropTypes.bool,`,
      `    filterable: PropTypes.bool,\n    hideAllTag: PropTypes.bool,`
    );
  }
  next = next.replace(
    `tagListPrefix.concat(this.props.tags, this.state.memberTags).map`,
    `(this.props.hideAllTag ? [] : tagListPrefix).concat(this.props.tags, this.state.memberTags).map`
  );
  next = next.replace(
    `LibraryComponent.defaultProps = {
    filterable: true,`,
    `LibraryComponent.defaultProps = {
    defaultTag: ALL_TAG.tag,
    hideAllTag: false,
    filterable: true,`
  );
  next = next.replace(
    `LibraryComponent.defaultProps = {
    defaultTag: ALL_TAG.tag,
    filterable: true,`,
    `LibraryComponent.defaultProps = {
    defaultTag: ALL_TAG.tag,
    hideAllTag: false,
    filterable: true,`
  );
  return next;
});

const tagButtonComponent = path.join(guiRoot, 'src', 'components', 'tag-button', 'tag-button.jsx');
assertExists(tagButtonComponent);
patchFile(tagButtonComponent, (text) => {
  if (text.includes('data-active={active}')) return text;
  return text.replace(
    `    <Button
        className={classNames(`,
    `    <Button
        data-active={active}
        data-tag={tag}
        className={classNames(`
  );
});

const libraryItemComponent = path.join(guiRoot, 'src', 'components', 'library-item', 'library-item.jsx');
assertExists(libraryItemComponent);
patchFile(libraryItemComponent, (text) => {
  let next = text;
  if (!next.includes('const isXEduExtension = typeof this.props.extensionId')) {
    next = next.replace(
      `    render () {
        return this.props.featured ? (`,
      `    render () {
        const isXEduExtension = typeof this.props.extensionId === 'string' &&
            this.props.extensionId.startsWith('xedu');
        return this.props.featured ? (`
    );
  }
  next = next.replace(
    `                    this.props.extensionId ? styles.libraryItemExtension : null,
                    this.props.hidden ? styles.hidden : null`,
    `                    this.props.extensionId ? styles.libraryItemExtension : null,
                    isXEduExtension ? styles.xeduExtensionItem : null,
                    this.props.hidden ? styles.hidden : null`
  );
  next = next.replace(
    `<div className={styles.contentWrapper}>`,
    `<div className={classNames(styles.contentWrapper, isXEduExtension ? styles.xeduContentWrapper : null)}>`
  );
  next = next.replace(
    `<div className={styles.featuredImageContainer}>`,
    `<div className={classNames(styles.featuredImageContainer, isXEduExtension ? styles.xeduFeaturedImageContainer : null)}>`
  );
  next = next.replace(
    `this.renderImage(styles.featuredImage, this.props.iconSource)`,
    `this.renderImage(classNames(styles.featuredImage, isXEduExtension ? styles.xeduFeaturedImage : null), this.props.iconSource)`
  );
  next = next.replace(
    `<div className={styles.libraryItemInsetImageContainer}>`,
    `<div className={classNames(styles.libraryItemInsetImageContainer, isXEduExtension ? styles.xeduInsetImageContainer : null)}>`
  );
  next = next.replace(
    `className={this.props.extensionId ?
                            classNames(styles.featuredExtensionText, styles.featuredText) : styles.featuredText
                        }`,
    `className={classNames(
                            this.props.extensionId ? styles.featuredExtensionText : null,
                            styles.featuredText,
                            isXEduExtension ? styles.xeduFeaturedText : null
                        )}`
  );
  return next;
});

const libraryItemCss = path.join(guiRoot, 'src', 'components', 'library-item', 'library-item.css');
assertExists(libraryItemCss);
patchFile(libraryItemCss, (text) => {
  const xeduLibraryItemCss = `

.xedu-extension-item {
    border-color: hsla(194, 85%, 46%, .42);
    box-shadow: 0 .25rem .75rem hsla(194, 70%, 36%, .08);
}

.xedu-extension-item:hover {
    border-color: hsla(194, 95%, 42%, .92);
    box-shadow: 0 .5rem 1rem hsla(194, 74%, 34%, .16);
    transform: translateY(-1px);
}

.xedu-content-wrapper {
    background: linear-gradient(180deg, hsla(194, 100%, 99%, 1), hsla(0, 100%, 100%, 1));
}

.xedu-featured-image-container {
    overflow: hidden;
}

.xedu-featured-image {
    object-fit: cover;
}

.xedu-inset-image-container {
    background-color: hsla(194, 94%, 42%, 1);
}

.xedu-featured-text {
    color: hsla(215, 30%, 24%, 1);
}

.xedu-featured-text .featured-description {
    color: hsla(215, 20%, 34%, 1);
}
`;
  const xeduItemPattern = /\n\.xedu-extension-item \{[\s\S]*?\.xedu-featured-text \.featured-description \{[\s\S]*?\n\}\n/;
  if (xeduItemPattern.test(text)) {
    return text.replace(xeduItemPattern, xeduLibraryItemCss);
  }
  return `${text}${xeduLibraryItemCss}`;
});

const libraryCss = path.join(guiRoot, 'src', 'components', 'library', 'library.css');
assertExists(libraryCss);
patchFile(libraryCss, (text) => {
  const extensionLibraryCss = `

#extensionLibrary .filter-bar {
    align-items: center;
    gap: .75rem;
    padding: .75rem 1rem;
    background: linear-gradient(90deg, hsla(202, 70%, 96%, 1), hsla(38, 100%, 96%, 1));
    border-bottom: 1px solid hsla(205, 28%, 76%, .55);
    box-shadow: 0 .5rem 1.25rem hsla(214, 30%, 34%, .07);
}

#extensionLibrary .filter-bar-item {
    margin-right: 0;
}

#extensionLibrary .filter {
    flex: 0 0 17rem;
    box-shadow: inset 0 0 0 1px hsla(205, 28%, 72%, .65);
}

#extensionLibrary .filter-input,
#extensionLibrary .filter-input:focus,
#extensionLibrary .filter-input:not([value=""]) {
    width: 17rem;
}

#extensionLibrary .divider {
    opacity: .35;
}

#extensionLibrary .tag-wrapper {
    gap: .5rem;
    align-items: center;
}

#extensionLibrary .tag-button {
    height: 2.25rem;
    padding: .5rem .875rem;
    border: 1px solid hsla(205, 32%, 72%, .65);
    border-radius: 999px;
    background: hsla(0, 100%, 100%, .86);
    color: hsla(215, 30%, 28%, 1);
    box-shadow: 0 .25rem .75rem hsla(214, 28%, 48%, .08);
}

#extensionLibrary [data-tag="xedu"] {
    border-color: hsla(194, 90%, 42%, .55);
    background: hsla(190, 94%, 94%, .92);
    color: hsla(194, 74%, 26%, 1);
}

#extensionLibrary [data-tag="scratch"] {
    border-color: hsla(31, 92%, 52%, .55);
    background: hsla(38, 100%, 93%, .95);
    color: hsla(24, 84%, 33%, 1);
}

#extensionLibrary [data-tag="xedu"][data-active="true"] {
    border-color: hsla(194, 95%, 40%, .95);
    background: linear-gradient(135deg, hsla(194, 94%, 42%, 1), hsla(217, 91%, 60%, 1));
    color: $ui-white;
    box-shadow: 0 .45rem 1rem hsla(194, 75%, 34%, .22);
}

#extensionLibrary [data-tag="scratch"][data-active="true"] {
    border-color: hsla(31, 94%, 45%, .95);
    background: linear-gradient(135deg, hsla(31, 96%, 55%, 1), hsla(48, 96%, 53%, 1));
    color: $ui-white;
    box-shadow: 0 .45rem 1rem hsla(31, 78%, 38%, .22);
}

#extensionLibrary .library-scroll-grid.withFilterBar {
    padding: .75rem 1rem 1.25rem;
    gap: .625rem;
    background: linear-gradient(180deg, hsla(210, 52%, 93%, 1), hsla(206, 56%, 96%, 1));
}

@media (max-width: 48rem) {
    #extensionLibrary .filter-bar {
        flex-direction: column;
    }

    #extensionLibrary .filter {
        flex: 0 0 auto;
        width: 100%;
    }

    #extensionLibrary .filter-input,
    #extensionLibrary .filter-input:focus,
    #extensionLibrary .filter-input:not([value=""]) {
        width: 100%;
    }
}
`;
  if (text.includes('#extensionLibrary .filter-bar')) {
    return text.replace(/\n#extensionLibrary \.filter-bar \{[\s\S]*$/, extensionLibraryCss);
  }
  return `${text}${extensionLibraryCss}`;
});

const standaloneRenderer = path.join(guiRoot, 'src', 'playground', 'render-gui-standalone.jsx');
assertExists(standaloneRenderer);
patchFile(standaloneRenderer, (text) => {
  if (text.includes('getXEduScratchProjectInfo') && text.includes('saveXEduScratchProject')) {
    return text;
  }
  const helper = `
const getXEduScratchParams = () => new URLSearchParams(window.location.search || '');

const getXEduApiBase = () => {
    const params = getXEduScratchParams();
    const explicit = params.get('apiBase');
    if (explicit) return explicit.replace(/\\/$/, '');
    if (window.location.origin && window.location.origin !== 'null') return window.location.origin;
    return 'http://127.0.0.1:5123';
};

const getXEduScratchProjectUrl = () => {
    const info = getXEduScratchProjectInfo();
    if (!info) return '';
    return \`\${info.host}/\${info.id}\`;
};

const getXEduScratchProjectInfo = () => {
    const params = getXEduScratchParams();
    const rootToken = params.get('rootToken');
    const project = (params.get('project') || '').replace(/^\\/+/, '');
    if (!rootToken || !project || !project.toLowerCase().endsWith('.sb3')) return null;
    return {
        host: \`\${getXEduApiBase()}/api/resources/scratch-project/\${encodeURIComponent(rootToken)}\`,
        id: project.split('/').map(encodeURIComponent).join('/')
    };
};

const saveXEduScratchProject = (id, vmState, params, vm) => {
    const projectUrl = getXEduScratchProjectUrl();
    if (!projectUrl || !vm || !vm.saveProjectSb3) return Promise.resolve({id: id || '0'});
    return vm.saveProjectSb3()
        .then(blob => fetch(projectUrl, {
            method: 'PUT',
            headers: {'Content-Type': 'application/x.scratch.sb3'},
            body: blob
        }))
        .then(response => response.json().then(payload => ({response, payload})))
        .then(({response, payload}) => {
            if (!response.ok || !payload.success) {
                throw new Error(payload.message || \`Failed to save Scratch project: HTTP \${response.status}\`);
            }
            return {id: id || '0'};
        });
};

`;
  const withHelper = text.replace("const onClickLogo = () => {", `${helper}\nconst onClickLogo = () => {`);
  const withProjectInfo = withHelper.replace(
    "    const state = new EditorState({\n        showTelemetryModal: simulateScratchDesktop\n    });",
    "    const xeduProjectInfo = getXEduScratchProjectInfo();\n    const state = new EditorState({\n        showTelemetryModal: simulateScratchDesktop\n    });"
  );
  const renderProps = `            canSave: Boolean(xeduProjectInfo),\n            projectHost: xeduProjectInfo ? xeduProjectInfo.host : undefined,\n            projectId: xeduProjectInfo ? xeduProjectInfo.id : '0',\n            onUpdateProjectData: (id, vmState, params) => saveXEduScratchProject(id, vmState, params, state.store.getState().scratchGui.vm),`;
  return withProjectInfo
    .replace(
      "            canSave: false,\n            onTelemetryModalCancel:",
      `${renderProps}\n            onTelemetryModalCancel:`
    )
    .replace(
      "            canSave: false,\n            onClickLogo",
      `${renderProps}\n            onClickLogo`
    );
});

patchFile(standaloneRenderer, (text) => {
  let next = text;
  if (!next.includes('requestNewProject')) {
    next = next.replace(
      "import {EditorState, createStandaloneRoot, setAppElement} from '../index-standalone';",
      "import {EditorState, createStandaloneRoot, setAppElement, requestNewProject} from '../index-standalone';"
    );
  }
  if (!next.includes("import {setProjectTitle} from '../reducers/project-title';")) {
    next = next.replace(
      "import {PLATFORM} from '../lib/platform.js';",
      "import {PLATFORM} from '../lib/platform.js';\nimport {setProjectTitle} from '../reducers/project-title';\nimport {setProjectUnchanged} from '../reducers/project-changed';\nimport {requestProjectUpload, onLoadedProject} from '../reducers/project-state';\nimport {openLoadingProject, closeLoadingProject} from '../reducers/modals';\nimport {getProjectTitleFromFilename} from '../lib/sb-file-uploader-utils';"
    );
  }
  if (!next.includes("import {setProjectUnchanged} from '../reducers/project-changed';")) {
    next = next.replace(
      "import {setProjectTitle} from '../reducers/project-title';",
      "import {setProjectTitle} from '../reducers/project-title';\nimport {setProjectUnchanged} from '../reducers/project-changed';"
    );
  }
  if (!next.includes('const createXEduScratchBridge = state => ({')) {
    next = next.replace(
      "const onClickLogo = () => {",
      `const getScratchProjectTitle = state => {
    const title = String(state.store.getState().scratchGui.projectTitle || '').trim();
    return title || 'Scratch作品';
};

const downloadScratchBlob = (filename, blob) => {
    const downloadLink = document.createElement('a');
    document.body.appendChild(downloadLink);
    const url = window.URL.createObjectURL(blob);
    downloadLink.href = url;
    downloadLink.download = filename;
    downloadLink.type = blob.type;
    downloadLink.click();
    window.setTimeout(() => {
        document.body.removeChild(downloadLink);
        window.URL.revokeObjectURL(url);
    }, 1000);
};

const saveScratchProjectToCurrentFile = async state => {
    const projectInfo = getXEduScratchProjectInfo();
    if (!projectInfo) {
        throw new Error('当前 Scratch 页面没有绑定可保存的项目文件。');
    }
    const vm = state.store.getState().scratchGui.vm;
    await saveXEduScratchProject(projectInfo.id, null, null, vm);
    state.store.dispatch(setProjectUnchanged());
    return true;
};

const createNewScratchProject = async state => {
    const projectChanged = Boolean(state.store.getState().scratchGui.projectChanged);
    if (projectChanged) {
        const confirmed = window.confirm('新建项目会替换当前内容，是否继续？');
        if (!confirmed) return false;
    }
    state.store.dispatch(requestNewProject(false));
    return true;
};

const uploadScratchProjectFromComputer = state => new Promise((resolve, reject) => {
    const scratchState = state.store.getState().scratchGui;
    if (!scratchState?.vm) {
        reject(new Error('Scratch 还没有准备好。'));
        return;
    }
    const projectChanged = Boolean(scratchState.projectChanged);
    if (projectChanged) {
        const confirmed = window.confirm('从电脑打开会替换当前内容，是否继续？');
        if (!confirmed) {
            resolve(false);
            return;
        }
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.sb,.sb2,.sb3';
    input.style.display = 'none';
    document.body.appendChild(input);
    const cleanup = () => {
        input.value = '';
        if (input.parentNode) {
            input.parentNode.removeChild(input);
        }
    };
    input.addEventListener('change', async () => {
        const file = input.files && input.files[0];
        if (!file) {
            cleanup();
            resolve(false);
            return;
        }
        const currentLoadingState = state.store.getState().scratchGui.projectState.loadingState;
        const uploadAction = requestProjectUpload(currentLoadingState);
        if (uploadAction) {
            state.store.dispatch(uploadAction);
        }
        const uploadLoadingState = state.store.getState().scratchGui.projectState.loadingState;
        state.store.dispatch(openLoadingProject());
        let success = false;
        try {
            const buffer = await file.arrayBuffer();
            await state.store.getState().scratchGui.vm.loadProject(buffer);
            const uploadedProjectTitle = getProjectTitleFromFilename(file.name);
            if (uploadedProjectTitle) {
                state.store.dispatch(setProjectTitle(uploadedProjectTitle));
            }
            success = true;
            resolve(true);
        } catch (error) {
            window.alert('项目文件加载失败，请确认选择的是有效的 Scratch 项目。');
            reject(error);
        } finally {
            const loadedAction = onLoadedProject(
                uploadLoadingState,
                Boolean(getXEduScratchProjectInfo()),
                success
            );
            if (loadedAction) {
                state.store.dispatch(loadedAction);
            }
            state.store.dispatch(closeLoadingProject());
            cleanup();
        }
    }, {once: true});
    input.click();
});

const downloadScratchProjectToComputer = async state => {
    const vm = state.store.getState().scratchGui.vm;
    if (!vm || !vm.saveProjectSb3) {
        throw new Error('Scratch 还没有准备好。');
    }
    const content = await vm.saveProjectSb3();
    downloadScratchBlob(\`\${getScratchProjectTitle(state)}.sb3\`, content);
    return true;
};

const createXEduScratchBridge = state => ({
    getState: () => ({
        canSave: Boolean(getXEduScratchProjectInfo()),
        projectTitle: getScratchProjectTitle(state)
    }),
    newProject: () => createNewScratchProject(state),
    saveProject: () => saveScratchProjectToCurrentFile(state),
    uploadProject: () => uploadScratchProjectFromComputer(state),
    downloadProject: () => downloadScratchProjectToComputer(state)
});

const onClickLogo = () => {`
    );
  }
  if (!next.includes('window.__xeduScratchBridge__ = createXEduScratchBridge(state);')) {
    next = next.replace(
      "    const gui = createStandaloneRoot(state, appTarget, {\n        wrappers: [HashParserHOC]\n    });",
      "    const gui = createStandaloneRoot(state, appTarget, {\n        wrappers: [HashParserHOC]\n    });\n    window.__xeduScratchBridge__ = createXEduScratchBridge(state);"
    );
  }
  next = next.replace(
    "            showTelemetryModal: true,\n            canSave: Boolean(xeduProjectInfo),",
    "            showTelemetryModal: true,\n            menuBarHidden: true,\n            canSave: Boolean(xeduProjectInfo),"
  );
  next = next.replace(
    "            backpackVisible: true,\n            showComingSoon: true,",
    "            backpackVisible: true,\n            menuBarHidden: true,\n            showComingSoon: true,"
  );
  return next;
});

const projectSaverHOC = path.join(guiRoot, 'src', 'lib', 'project-saver-hoc.jsx');
assertExists(projectSaverHOC);
patchFile(projectSaverHOC, (text) => {
  if (text.includes('const assetStorePromise = this.props.onUpdateProjectData')) {
    return text;
  }
  return text.replace(
    `            return Promise.all(this.props.vm.assets
                .filter(asset => !asset.clean)
                .map(
                    asset => scratchStorage.store(
                        asset.assetType,
                        asset.dataFormat,
                        asset.data,
                        asset.assetId
                    ).then(response => {
                        // Asset servers respond with {status: ok} for successful POSTs
                        if (response.status !== 'ok') {
                            // Errors include a \`code\` property, e.g. "Forbidden"
                            return Promise.reject(response.code);
                        }
                        asset.clean = true;
                    })
                )
            )
                .then(() => saveProject(projectId, savedVMState, requestParams))`,
    `            const assetStorePromise = this.props.onUpdateProjectData ?
                Promise.resolve() :
                Promise.all(this.props.vm.assets
                    .filter(asset => !asset.clean)
                    .map(
                        asset => scratchStorage.store(
                            asset.assetType,
                            asset.dataFormat,
                            asset.data,
                            asset.assetId
                        ).then(response => {
                            // Asset servers respond with {status: ok} for successful POSTs
                            if (response.status !== 'ok') {
                                // Errors include a \`code\` property, e.g. "Forbidden"
                                return Promise.reject(response.code);
                            }
                            asset.clean = true;
                        })
                    )
                );

            return assetStorePromise
                .then(() => saveProject(projectId, savedVMState, requestParams))`
  );
});

const detectLocaleFile = path.join(guiRoot, 'src', 'lib', 'detect-locale.js');
assertExists(detectLocaleFile);
patchFile(detectLocaleFile, (text) => {
  if (text.includes("const defaultLocale = supportedLocales.includes('zh-cn') ? 'zh-cn' : 'en';")) {
    return text;
  }
  return text.replace(
    `const detectLocale = supportedLocales => {
    let locale = 'en'; // default
    let browserLocale = window.navigator.userLanguage || window.navigator.language;
    browserLocale = browserLocale.toLowerCase();
    // try to set locale from browserLocale
    if (supportedLocales.includes(browserLocale)) {
        locale = browserLocale;
    } else {
        browserLocale = browserLocale.split('-')[0];
        if (supportedLocales.includes(browserLocale)) {
            locale = browserLocale;
        }
    }

    const queryParams = queryString.parse(location.search);
    // Flatten potential arrays and remove falsy values
    const potentialLocales = [].concat(queryParams.locale, queryParams.lang).filter(l => l);
    if (!potentialLocales.length) {
        return locale;
    }

    const urlLocale = potentialLocales[0].toLowerCase();
    if (supportedLocales.includes(urlLocale)) {
        return urlLocale;
    }

    return locale;
};`,
    `const detectLocale = supportedLocales => {
    const defaultLocale = supportedLocales.includes('zh-cn') ? 'zh-cn' : 'en';

    const queryParams = queryString.parse(location.search);
    // Flatten potential arrays and remove falsy values
    const potentialLocales = [].concat(queryParams.locale, queryParams.lang).filter(l => l);
    if (!potentialLocales.length) {
        return defaultLocale;
    }

    const urlLocale = potentialLocales[0].toLowerCase();
    if (supportedLocales.includes(urlLocale)) {
        return urlLocale;
    }

    return defaultLocale;
};`
  );
});

const colorModePersistence = path.join(guiRoot, 'src', 'lib', 'settings', 'color-mode', 'persistence.js');
assertExists(colorModePersistence);
patchFile(colorModePersistence, (text) => {
  if (text.includes("const detectColorMode = () => HIGH_CONTRAST_MODE;")) {
    return text;
  }
  return text.replace(
    `const detectColorMode = () => {
    const obj = cookie.parse(document.cookie) || {};
    const colorModeCookie = obj.scratchtheme;

    if (isValidColorMode(colorModeCookie)) return colorModeCookie;

    // No cookie set. Fall back to system preferences
    return systemPreferencesColorMode();
};`,
    `const detectColorMode = () => HIGH_CONTRAST_MODE;`
  );
});

const themePersistence = path.join(guiRoot, 'src', 'lib', 'settings', 'theme', 'persistence.js');
assertExists(themePersistence);
patchFile(themePersistence, (text) => {
  if (text.includes("const detectTheme = () => CAT_BLOCKS_THEME;")) {
    return text;
  }
  return text.replace(
    `const detectTheme = () => {
    const obj = cookie.parse(document.cookie) || {};
    const themeCookie = obj[COOKIE_KEY];

    if (isValidTheme(themeCookie)) return themeCookie;

    return DEFAULT_THEME;
};`,
    `const detectTheme = () => CAT_BLOCKS_THEME;`
  );
});

const menuBar = path.join(guiRoot, 'src', 'components', 'menu-bar', 'menu-bar.jsx');
assertExists(menuBar);
patchFile(menuBar, (text) => {
  let next = text;
  if (!next.includes('{false && (<SettingsMenu')) {
    next = next.replace(
      `{(this.props.canChangeColorMode || this.props.canChangeLanguage || this.props.canChangeTheme) &&
                        (<SettingsMenu
                            canChangeLanguage={this.props.canChangeLanguage}
                            canChangeColorMode={this.props.canChangeColorMode}
                            canChangeTheme={this.props.canChangeTheme}
                            hasActiveMembership={this.props.hasActiveMembership}
                            isRtl={this.props.isRtl}
                            depth={1}
                        />)}`,
      `{false && (<SettingsMenu
                            canChangeLanguage={this.props.canChangeLanguage}
                            canChangeColorMode={this.props.canChangeColorMode}
                            canChangeTheme={this.props.canChangeTheme}
                            hasActiveMembership={this.props.hasActiveMembership}
                            isRtl={this.props.isRtl}
                            depth={1}
                        />)}`
    );
  }
  if (!next.includes('{false && ((this.props.canManageFiles) && (<FileMenu')) {
    next = next.replace(
      `{(this.props.canManageFiles) && (<FileMenu
                            onStartSelectingFileUpload={this.props.onStartSelectingFileUpload}
                            onClickNew={this.handleClickNew}
                            onClickRemix={this.props.onClickRemix}
                            onClickSave={this.props.onClickSave}
                            getSaveToComputerHandler={this.getSaveToComputerHandler}
                            canSave={this.props.canSave}
                            canCreateCopy={this.props.canCreateCopy}
                            canRemix={this.props.canRemix}
                            intl={this.props.intl}
                            isRtl={this.props.isRtl}
                            remixMessage={remixMessage}
                            depth={1}
                        />)}`,
      `{false && ((this.props.canManageFiles) && (<FileMenu
                            onStartSelectingFileUpload={this.props.onStartSelectingFileUpload}
                            onClickNew={this.handleClickNew}
                            onClickRemix={this.props.onClickRemix}
                            onClickSave={this.props.onClickSave}
                            getSaveToComputerHandler={this.getSaveToComputerHandler}
                            canSave={this.props.canSave}
                            canCreateCopy={this.props.canCreateCopy}
                            canRemix={this.props.canRemix}
                            intl={this.props.intl}
                            isRtl={this.props.isRtl}
                            remixMessage={remixMessage}
                            depth={1}
                        />))}`
    );
  }
  if (!next.includes('{false && <EditMenu')) {
    next = next.replace(
      `<EditMenu
                            isRtl={this.props.isRtl}
                            onRestoreOption={this.handleRestoreOption}
                            restoreOptionMessage={this.restoreOptionMessage}
                            depth={1}
                        />`,
      `{false && <EditMenu
                            isRtl={this.props.isRtl}
                            onRestoreOption={this.handleRestoreOption}
                            restoreOptionMessage={this.restoreOptionMessage}
                            depth={1}
                        />}`
    );
  }
  if (!next.includes('{false && (this.props.canEditTitle ? (')) {
    next = next.replace(
      `{this.props.canEditTitle ? (
                        <div className={classNames(styles.menuBarItem, styles.growable)}>
                            <MenuBarItemTooltip
                                enable
                                id="title-field"
                            >
                                <ProjectTitleInput
                                    className={classNames(styles.titleFieldGrowable)}
                                />
                            </MenuBarItemTooltip>
                        </div>
                    ) : ((this.props.authorUsername && this.props.authorUsername !== this.props.username) ? (
                        <AuthorInfo
                            className={styles.authorInfo}
                            imageUrl={this.props.authorThumbnailUrl}
                            projectTitle={this.props.projectTitle}
                            userId={this.props.authorId}
                            username={this.props.authorUsername}
                            avatarBadge={this.props.authorAvatarBadge}
                        />
                    ) : null)}`,
      `{false && (this.props.canEditTitle ? (
                        <div className={classNames(styles.menuBarItem, styles.growable)}>
                            <MenuBarItemTooltip
                                enable
                                id="title-field"
                            >
                                <ProjectTitleInput
                                    className={classNames(styles.titleFieldGrowable)}
                                />
                            </MenuBarItemTooltip>
                        </div>
                    ) : ((this.props.authorUsername && this.props.authorUsername !== this.props.username) ? (
                        <AuthorInfo
                            className={styles.authorInfo}
                            imageUrl={this.props.authorThumbnailUrl}
                            projectTitle={this.props.projectTitle}
                            userId={this.props.authorId}
                            username={this.props.authorUsername}
                            avatarBadge={this.props.authorAvatarBadge}
                        />
                    ) : null))}`
    );
  }
  if (!next.includes('{false && <div className={styles.fileGroup}>')) {
    next = next.replace(
      `<div className={styles.fileGroup}>
                        <button
                            aria-label={this.props.intl.formatMessage(ariaMessages.tutorials)}
                            className={
                                classNames(styles.menuBarItem, styles.noOffset, styles.hoverable, 'tutorials-button')
                            }
                            onClick={this.props.onOpenTipLibrary}
                        >
                            <img
                                className={styles.helpIcon}
                                src={helpIcon}
                            />
                            <span className={styles.tutorialsLabel}>
                                <FormattedMessage {...ariaMessages.tutorials} />
                            </span>
                        </button>
                        <button
                            aria-label={this.props.intl.formatMessage(ariaMessages.debug)}
                            className={classNames(styles.menuBarItem, styles.noOffset, styles.hoverable)}
                            onClick={this.props.onOpenDebugModal}
                        >
                            <img
                                className={styles.helpIcon}
                                src={debugIcon}
                            />
                            <span className={styles.debugLabel}>
                                <FormattedMessage {...ariaMessages.debug} />
                            </span>
                        </button>
                    </div>`,
      `{false && <div className={styles.fileGroup}>
                        <button
                            aria-label={this.props.intl.formatMessage(ariaMessages.tutorials)}
                            className={
                                classNames(styles.menuBarItem, styles.noOffset, styles.hoverable, 'tutorials-button')
                            }
                            onClick={this.props.onOpenTipLibrary}
                        >
                            <img
                                className={styles.helpIcon}
                                src={helpIcon}
                            />
                            <span className={styles.tutorialsLabel}>
                                <FormattedMessage {...ariaMessages.tutorials} />
                            </span>
                        </button>
                        <button
                            aria-label={this.props.intl.formatMessage(ariaMessages.debug)}
                            className={classNames(styles.menuBarItem, styles.noOffset, styles.hoverable)}
                            onClick={this.props.onOpenDebugModal}
                        >
                            <img
                                className={styles.helpIcon}
                                src={debugIcon}
                            />
                            <span className={styles.debugLabel}>
                                <FormattedMessage {...ariaMessages.debug} />
                            </span>
                        </button>
                    </div>}`
    );
  }
  return next;
});

console.log('[xedu-scratch] patched Scratch GUI/VM with XEdu AI extension');
