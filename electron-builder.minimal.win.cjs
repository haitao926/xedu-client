const minimalConfig = require('./electron-builder.minimal.cjs');

module.exports = {
    ...minimalConfig,
    extraResources: minimalConfig.extraResources.map((resource) => (
        resource.to === 'python_env'
            ? { ...resource, from: 'python_env_win_minimal' }
            : resource
    )),
};
