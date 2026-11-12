const portableConfig = require(process.platform === 'win32'
    ? './electron-builder.bundled-python-no-models.win.cjs'
    : './electron-builder.bundled-python-no-models.cjs');
const { version } = require('./package.json');

module.exports = {
    ...portableConfig,
    directories: {
        ...portableConfig.directories,
        output: `output/releases/${version}`,
    },
    nsis: {
        ...portableConfig.nsis,
        artifactName: 'XEdu-Client-${version}-Setup-${arch}.${ext}',
    },
    win: {
        ...portableConfig.win,
        target: [{ target: 'nsis', arch: ['x64'] }],
    },
    mac: {
        ...portableConfig.mac,
        artifactName: 'XEdu-Client-${version}-${arch}.${ext}',
        target: [{ target: 'dmg', arch: ['arm64'] }],
    },
};
