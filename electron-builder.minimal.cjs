const portableConfig = require('./electron-builder.bundled-python-no-models.cjs');

module.exports = {
    ...portableConfig,
    directories: {
        ...portableConfig.directories,
        output: 'dist-minimal',
    },
    nsis: {
        ...portableConfig.nsis,
        artifactName: '${productName}-${version}-minimal-${arch}.${ext}',
    },
    win: {
        ...portableConfig.win,
        artifactName: '${productName}-${version}-minimal-${arch}.${ext}',
    },
    mac: {
        ...portableConfig.mac,
        artifactName: '${productName}-${version}-minimal-${arch}.${ext}',
    },
};
