const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const guiRoot = path.join(root, 'node_modules', '@scratch', 'scratch-gui');
const requiredPackages = [
  'webpack/package.json',
  'webpack-cli/package.json',
  'cross-env/package.json',
  'copy-webpack-plugin/package.json',
  'scratch-webpack-configuration/package.json',
  'babel-loader/package.json',
  'html-webpack-plugin/package.json',
];

function hasPackage(relativePath) {
  try {
    require.resolve(relativePath, {paths: [guiRoot]});
    return true;
  } catch {
    return false;
  }
}

if (!fs.existsSync(guiRoot)) {
  throw new Error(`Scratch GUI package not installed: ${guiRoot}`);
}

const missing = requiredPackages.filter((packagePath) => !hasPackage(packagePath));
if (missing.length > 0) {
  throw new Error([
    '[xedu-scratch] build dependencies are missing after scratch-editor installation:',
    ...missing.map((packagePath) => `- ${packagePath}`),
    'Run `npm ci --prefix scratch-editor` from the repository root before building.',
  ].join('\n'));
}

console.log('[xedu-scratch] build dependencies are present in the locked scratch-editor installation');
