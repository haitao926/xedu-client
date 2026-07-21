const baseConfig = require('./electron-builder.bundled-python-no-models.cjs');

module.exports = {
    ...baseConfig,
    extraResources: baseConfig.extraResources.map((resource) => (
        resource.to === 'python_env'
            ? { ...resource, from: 'python_env_win_minimal' }
            : resource
    )),
};
