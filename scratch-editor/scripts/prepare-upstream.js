const fs = require('fs');
const path = require('path');
const {isDebugBuild} = require('./build-environment');

const root = path.resolve(__dirname, '..');
const guiRoot = path.join(root, 'node_modules', '@scratch', 'scratch-gui');
const webpackConfigPath = path.join(guiRoot, 'webpack.config.js');
const tsconfigPath = path.join(guiRoot, 'tsconfig.json');
const microbitStaticDir = path.join(guiRoot, 'static', 'microbit');
const microbitStaticPath = path.join(microbitStaticDir, 'scratch-microbit-1.2.0.hex');
const debugBuild = isDebugBuild(process.env.DEBUG);

const webpackConfig = `const fs = require('fs');
const path = require('path');
const webpack = require('webpack');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const ScratchWebpackConfigBuilder = require('scratch-webpack-configuration');
const packageRoot = (name) => {
    let current = path.dirname(require.resolve(name));
    while (current !== path.dirname(current)) {
        if (fs.existsSync(path.join(current, 'package.json'))) return current;
        current = path.dirname(current);
    }
    throw new Error('Unable to locate package root for ' + name);
};
const scratchBlocksMedia = path.join(packageRoot('scratch-blocks'), 'media');
const scratchVmWeb = path.join(packageRoot('@scratch/scratch-vm'), 'dist', 'web');
const scratchStorageWeb = path.join(packageRoot('scratch-storage'), 'dist', 'web');
const mediapipeFaceDetection = packageRoot('@mediapipe/face_detection');

const cssModuleExceptions = [
    /\\.raw\\.css$/,
    /[\\\\/]driver\\.js[\\\\/].*\\.css$/
];

const baseConfig = new ScratchWebpackConfigBuilder({
    rootPath: path.resolve(__dirname),
    enableReact: true,
    enableTs: true,
    shouldSplitChunks: false,
    cssModuleExceptions
})
    .setTarget('web')
    .merge({
        output: {
            assetModuleFilename: 'static/assets/[name].[hash][ext][query]',
            library: {
                name: 'GUI',
                type: 'umd2'
            },
            publicPath: '/api/scratch-editor/',
            clean: false
        },
        resolve: {
            alias: {
                React: require.resolve('react'),
                ReactDOM: require.resolve('react-dom')
            },
            fallback: {
                Buffer: require.resolve('buffer/'),
                stream: require.resolve('stream-browserify')
            },
            symlinks: false
        }
    })
    .addModuleRule({
        test: /\\.(svg|png|wav|mp3|gif|jpg)$/,
        resourceQuery: /^$/,
        type: 'asset'
    })
    .addPlugin(new webpack.DefinePlugin({
        'process.env.DEBUG': ${debugBuild},
        'process.env.GA_ID': JSON.stringify(process.env.GA_ID || 'UA-000000-01'),
        'process.env.GTM_ENV_AUTH': JSON.stringify(process.env.GTM_ENV_AUTH || ''),
        'process.env.GTM_ID': process.env.GTM_ID ? JSON.stringify(process.env.GTM_ID) : null
    }))
    .addPlugin(new CopyWebpackPlugin({
        patterns: [
            {
                from: scratchBlocksMedia,
                to: 'static/blocks-media/default'
            },
            {
                from: scratchBlocksMedia,
                to: 'static/blocks-media/high-contrast'
            },
            {
                from: 'src/lib/settings/color-mode/high-contrast/blocks-media',
                to: 'static/blocks-media/high-contrast',
                force: true
            },
            {
                context: scratchVmWeb,
                from: 'extension-worker.{js,js.map}',
                noErrorOnMissing: true
            },
            {
                context: scratchStorageWeb,
                from: 'chunks/fetch-worker.*.{js,js.map}',
                noErrorOnMissing: true
            },
            {
                context: scratchStorageWeb,
                from: 'chunks/vendors-*.{js,js.map}',
                noErrorOnMissing: true
            },
            {
                from: mediapipeFaceDetection,
                to: 'chunks/mediapipe/face_detection'
            }
        ]
    }));

const config = baseConfig.clone()
    .merge({
        entry: {
            'scratch-gui-standalone': path.join(__dirname, 'src/index-standalone.tsx')
        },
        output: {
            path: path.resolve(__dirname, 'dist')
        }
    })
    .get();

for (const rule of config.module.rules) {
    if (rule.loader === 'babel-loader') {
        rule.exclude = /\.[cm]?tsx?$/;
    }
    if (rule.loader === 'ts-loader') {
        delete rule.exclude;
        rule.options = Object.assign({}, rule.options, {transpileOnly: true});
    }
}

module.exports = config;
`;

if (!fs.existsSync(guiRoot)) {
  throw new Error(`Scratch GUI package not installed: ${guiRoot}`);
}
fs.mkdirSync(microbitStaticDir, {recursive: true});
const bundledHex = path.join(guiRoot, 'dist', '30d09ba32a17082ef820b57d52d60b7b.hex');
if (fs.existsSync(bundledHex)) {
  fs.copyFileSync(bundledHex, microbitStaticPath);
} else if (!fs.existsSync(microbitStaticPath)) {
  fs.writeFileSync(microbitStaticPath, '', 'utf8');
}
fs.writeFileSync(webpackConfigPath, webpackConfig, 'utf8');
fs.writeFileSync(tsconfigPath, JSON.stringify({
  compilerOptions: {
    allowSyntheticDefaultImports: true,
    esModuleInterop: true,
    jsx: 'react',
    module: 'esnext',
    moduleResolution: 'node',
    resolveJsonModule: true,
    skipLibCheck: true,
    target: 'es2020'
  },
  include: ['src/**/*']
}, null, 2), 'utf8');
console.log('[xedu-scratch] prepared local Scratch GUI webpack config');
