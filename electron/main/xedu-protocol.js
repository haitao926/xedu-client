const path = require('path');

/**
 * Register the xedu: URL scheme.
 *
 * On macOS, Electron's setAsDefaultProtocolClient ignores path and args
 * (shell/browser/browser_mac.mm). It calls LSSetDefaultHandlerForURLScheme
 * with the running bundle id. electron:dev is
 * node_modules/electron/dist/Electron.app (com.github.Electron), so Launch
 * Services opens that binary with no app path: default_app ("Electron
 * path-to-app"), user data ~/Library/Application Support/Electron, and
 * --app-path=default_app.asar. Dev on darwin must not claim xedu:. If a
 * previous run already did, removeAsDefaultProtocolClient hands the scheme
 * to another app that declares it (normally /Applications/XEdu Client.app,
 * com.xeduclient) or clears it.
 *
 * Packaged builds leave process.defaultApp unset and still call
 * setAsDefaultProtocolClient(protocol) on every platform.
 *
 * Windows dev still passes execPath plus the app entry; the registry command
 * needs both. Linux Electron 39 ignores those arguments (xdg-settings uses
 * CHROME_DESKTOP) but keeps this same call so that branch does not change.
 */
function registerXeduProtocolClient(app, {
    protocol = 'xedu',
    platform = process.platform,
    defaultApp = process.defaultApp,
    execPath = process.execPath,
    argv = process.argv,
} = {}) {
    if (defaultApp && platform === 'darwin') {
        const released = app.removeAsDefaultProtocolClient(protocol);
        return released ? 'released-darwin-dev' : 'skipped-darwin-dev';
    }

    if (defaultApp && argv.length >= 2) {
        app.setAsDefaultProtocolClient(protocol, execPath, [path.resolve(argv[1])]);
        return 'registered-dev-exec';
    }

    app.setAsDefaultProtocolClient(protocol);
    return 'registered-packaged';
}

module.exports = {
    registerXeduProtocolClient,
};
