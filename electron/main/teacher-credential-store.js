const fs = require('fs');
const path = require('path');

const CREDENTIAL_DIRECTORY = 'credentials';
const CREDENTIAL_FILENAME = 'teacher-code.bin';

function createTeacherCredentialStore({ userDataPath, safeStorage, fsImpl = fs } = {}) {
    if (!userDataPath || typeof userDataPath !== 'string') {
        throw new TypeError('teacher credential store requires a user data path');
    }

    const credentialPath = path.join(userDataPath, CREDENTIAL_DIRECTORY, CREDENTIAL_FILENAME);
    const encryptionAvailable = () => {
        try {
            return safeStorage?.isEncryptionAvailable?.() === true;
        } catch (_) {
            return false;
        }
    };

    function load() {
        if (!encryptionAvailable()) {
            return { success: false, code: '', error: 'encryption-unavailable' };
        }
        if (!fsImpl.existsSync(credentialPath)) {
            return { success: true, code: '' };
        }
        try {
            const encrypted = fsImpl.readFileSync(credentialPath);
            const code = String(safeStorage.decryptString(encrypted) || '').trim();
            return { success: true, code };
        } catch (_) {
            return { success: false, code: '', error: 'credential-read-failed' };
        }
    }

    function save(value) {
        const code = String(value || '').trim();
        if (!code) {
            return { success: false, error: 'invalid-teacher-code' };
        }
        if (!encryptionAvailable()) {
            return { success: false, error: 'encryption-unavailable' };
        }
        try {
            const encrypted = safeStorage.encryptString(code);
            fsImpl.mkdirSync(path.dirname(credentialPath), { recursive: true, mode: 0o700 });
            if (typeof fsImpl.chmodSync === 'function') {
                fsImpl.chmodSync(path.dirname(credentialPath), 0o700);
            }
            const temporaryPath = `${credentialPath}.${process.pid}.tmp`;
            fsImpl.writeFileSync(temporaryPath, encrypted, { mode: 0o600 });
            if (typeof fsImpl.chmodSync === 'function') {
                fsImpl.chmodSync(temporaryPath, 0o600);
            }
            fsImpl.renameSync(temporaryPath, credentialPath);
            return { success: true };
        } catch (_) {
            return { success: false, error: 'credential-save-failed' };
        }
    }

    function clear() {
        try {
            fsImpl.rmSync(credentialPath, { force: true });
            return { success: true };
        } catch (_) {
            return { success: false, error: 'credential-clear-failed' };
        }
    }

    return { load, save, clear };
}

module.exports = {
    createTeacherCredentialStore,
};
