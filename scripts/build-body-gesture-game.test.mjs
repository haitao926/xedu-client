import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import test from 'node:test';

const scratchParser = createRequire(import.meta.url)('../scratch-editor/node_modules/scratch-parser');
const generator = fileURLToPath(new URL('./build-body-gesture-game.mjs', import.meta.url));

function parseScratchArchive(archivePath) {
    return new Promise((resolve, reject) => {
        scratchParser(readFileSync(archivePath), false, (error, result) => {
            if (error) reject(error);
            else resolve(result);
        });
    });
}

test('body gesture game output is accepted by the Scratch project parser', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'xedu-body-gesture-test-'));
    const output = join(directory, 'keypoint_coordinates.sb3');
    try {
        execFileSync(process.execPath, [generator, '--output', output, '--verify'], {stdio: 'pipe'});
        const [project] = await parseScratchArchive(output);
        const obstacle = project.targets.find(target => target.name === '障碍物');
        assert.deepEqual(obstacle.blocks.touchingRunner.inputs.TOUCHINGOBJECT, [1, [10, '闯关角色']]);
    } finally {
        rmSync(directory, {recursive: true, force: true});
    }
});
