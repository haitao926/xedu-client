const packageJson = require('./package.json');

const baseBuild = packageJson.build ?? {};
const baseMac = baseBuild.mac ?? {};
const baseWin = baseBuild.win ?? {};
const baseDirectories = baseBuild.directories ?? {};

const RELEASE_ENV_BY_PLATFORM = {
  win32: ['WIN_CSC_LINK', 'WIN_CSC_KEY_PASSWORD'],
  darwin: ['CSC_LINK', 'CSC_KEY_PASSWORD', 'APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID'],
};

function getRequiredReleaseEnv(platform = process.platform) {
  return RELEASE_ENV_BY_PLATFORM[platform] ?? [
    ...RELEASE_ENV_BY_PLATFORM.win32,
    ...RELEASE_ENV_BY_PLATFORM.darwin,
  ];
}

function getMissingReleaseEnv(env = process.env, platform = process.platform) {
  return getRequiredReleaseEnv(platform).filter((name) => !String(env[name] ?? '').trim());
}

function assertReleaseSigningEnv(env = process.env, platform = process.platform) {
  const missing = getMissingReleaseEnv(env, platform);
  if (missing.length === 0) return;

  throw new Error(
    `electron:build:release requires signing credentials for the ${platform} official release.\nMissing release signing credentials: ${missing.join(', ')}`
  );
}

assertReleaseSigningEnv();

const releaseConfig = {
  ...baseBuild,
  directories: {
    ...baseDirectories,
    output: 'dist-release',
  },
  win: {
    ...baseWin,
    forceCodeSigning: true,
    signAndEditExecutable: true,
  },
  mac: {
    ...baseMac,
    hardenedRuntime: true,
    entitlements: baseMac.entitlements ?? 'resources/entitlements.mac.plist',
    entitlementsInherit: baseMac.entitlementsInherit ?? 'resources/entitlements.mac.plist',
    target: baseMac.target ?? [
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

module.exports = releaseConfig;
module.exports.assertReleaseSigningEnv = assertReleaseSigningEnv;
module.exports.getMissingReleaseEnv = getMissingReleaseEnv;
