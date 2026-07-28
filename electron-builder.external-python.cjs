const bundledPythonConfig = require('./electron-builder.bundled-python-no-models.cjs');

module.exports = {
    ...bundledPythonConfig,
    directories: {
        ...bundledPythonConfig.directories,
        output: 'dist-external-python',
    },
    extraResources: bundledPythonConfig.extraResources.filter(
        ({ to }) => to !== 'python_env',
    ),
    nsis: {
        ...bundledPythonConfig.nsis,
        artifactName: '${productName}-${version}-external-python-${arch}.${ext}',
    },
    win: {
        ...bundledPythonConfig.win,
        artifactName: '${productName}-${version}-external-python-${arch}.${ext}',
    },
    mac: {
        ...bundledPythonConfig.mac,
        identity: '-',
        artifactName: '${productName}-${version}-external-python-${arch}.${ext}',
    },
};
