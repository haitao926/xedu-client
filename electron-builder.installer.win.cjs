const installerConfig = require('./electron-builder.installer.cjs');
const windowsConfig = require('./electron-builder.bundled-python-no-models.win.cjs');

module.exports = {
    ...installerConfig,
    extraResources: windowsConfig.extraResources,
};
