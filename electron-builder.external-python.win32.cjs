const externalPythonConfig = require('./electron-builder.external-python.cjs');

module.exports = {
    ...externalPythonConfig,
    directories: {
        ...externalPythonConfig.directories,
        output: 'dist-external-python-win32',
    },
    nsis: {
        ...externalPythonConfig.nsis,
        artifactName: '${productName}-${version}-external-python-win32.${ext}',
    },
    win: {
        ...externalPythonConfig.win,
        target: [
            {
                target: 'nsis',
                arch: ['ia32'],
            },
            {
                target: 'dir',
                arch: ['ia32'],
            },
        ],
        artifactName: '${productName}-${version}-external-python-win32.${ext}',
    },
};
