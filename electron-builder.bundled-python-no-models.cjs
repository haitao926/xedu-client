const { build: baseBuildConfig } = require('./package.json');

const distributableDocs = [
    'index.json',
    'overview/project-map.md',
    'overview/xedu-introduction.md',
    'overview/quickstart.md',
    'components/**/*',
    'teacher/**/*',
];
const modelFreeResources = baseBuildConfig.extraResources
    .filter(({ from }) => !['checkpoint', 'python_env', 'python_env_win'].includes(from))
    .map((resource) => resource.from === 'docs'
        ? { ...resource, filter: distributableDocs }
        : resource);
const portablePythonFilter = [
    '**/*',
    '!**/checkpoint',
    '!**/checkpoint/**/*',
    '!**/*.onnx',
    '!**/*.pt',
    '!**/*.pth',
    '!**/*.safetensors',
    '!**/__pycache__',
    '!**/__pycache__/**/*',
    '!**/*.pyc',
    '!**/.pytest_cache',
    '!**/.pytest_cache/**/*',
    '!include',
    '!include/**/*',
    '!share/man',
    '!share/man/**/*',
    '!share/icons',
    '!share/icons/**/*',
    '!share/applications',
    '!share/applications/**/*',
];

module.exports = {
    ...baseBuildConfig,
    directories: {
        ...baseBuildConfig.directories,
        output: 'dist-portable',
    },
    extraResources: [
        ...modelFreeResources,
        {
            from: 'python_env_minimal',
            to: 'python_env',
            filter: portablePythonFilter,
        },
    ],
    nsis: {
        ...baseBuildConfig.nsis,
        artifactName: '${productName}-${version}-portable-${arch}.${ext}',
    },
    win: {
        ...baseBuildConfig.win,
        artifactName: '${productName}-${version}-portable-${arch}.${ext}',
    },
    mac: {
        ...baseBuildConfig.mac,
        artifactName: '${productName}-${version}-portable-${arch}.${ext}',
        target: [
            {
                target: 'dmg',
                arch: ['arm64'],
            },
            {
                target: 'zip',
                arch: ['arm64'],
            },
        ],
    },
};
