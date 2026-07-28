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

function collectLinearOpcodes(blocks, startId) {
    const opcodes = [];
    let blockId = startId;
    while (blockId) {
        const block = blocks[blockId];
        assert(block, `Missing block: ${blockId}`);
        opcodes.push(block.opcode);
        blockId = block.next;
    }
    return opcodes;
}

function findTopLevelBlockId(target, opcode) {
    for (const [blockId, block] of Object.entries(target.blocks)) {
        if (block.topLevel && block.opcode === opcode) return blockId;
    }
    return null;
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

test('body gesture game output includes a runnable automatic body-sensing controller', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'xedu-body-gesture-test-'));
    const output = join(directory, 'keypoint_coordinates.sb3');
    try {
        execFileSync(process.execPath, [generator, '--output', output, '--verify'], {stdio: 'pipe'});
        const [project] = await parseScratchArchive(output);
        const stage = project.targets.find(target => target.isStage);
        const controller = project.targets.find(target => target.name === '体感控制');

        assert(stage, 'Missing stage target');
        assert(controller, 'Missing automatic body-sensing controller sprite');
        assert.equal(
            project.targets.some(target => target.name === '学生代码'),
            false,
            'Generator must not emit an empty student-code sprite'
        );

        const variableNames = Object.values(stage.variables).map(variable => variable[0]);
        for (const name of ['分数', '鼻尖 Y', '左手腕 Y', '右手腕 Y', '游戏状态', '姿态状态', '跳跃中', '手势锁', '已开始', '触发高度', '障碍速度']) {
            assert(variableNames.includes(name), `Missing stage variable: ${name}`);
        }

        const controllerStart = findTopLevelBlockId(controller, 'event_whenflagclicked');
        assert(controllerStart, 'Missing controller flag script');

        assert.deepEqual(
            collectLinearOpcodes(controller.blocks, controllerStart),
            [
                'event_whenflagclicked',
                'xeduCamera_enableCamera',
                'xeduCamera_showCameraPreview',
                'xeduCamera_setCameraTransparency',
                'xeduBodySensing_enableBodySensing',
                'xeduBodySensing_showBodyKeypoints',
                'control_wait_until',
                'data_setvariableto',
                'data_setvariableto',
                'control_forever'
            ]
        );

        const waitReadyEntry = Object.entries(controller.blocks).find(([, block]) => block.opcode === 'control_wait_until');
        assert(waitReadyEntry, 'Missing wait-until-ready block');
        const [waitReadyId, waitReadyBlock] = waitReadyEntry;
        assert.equal(waitReadyBlock.inputs.CONDITION[1], 'body_ready');
        assert.equal(controller.blocks.body_ready.opcode, 'xeduBodySensing_bodyReady');
        assert.equal(controller.blocks.check_body.opcode, 'control_if_else');
        assert.equal(controller.blocks.body_detected.opcode, 'xeduBodySensing_bodyDetected');

        const controllerOpcodes = new Set(Object.values(controller.blocks).map(block => block.opcode));
        for (const opcode of [
            'xeduCamera_enableCamera',
            'xeduCamera_showCameraPreview',
            'xeduCamera_setCameraTransparency',
            'xeduBodySensing_enableBodySensing',
            'xeduBodySensing_showBodyKeypoints',
            'xeduBodySensing_bodyReady',
            'xeduBodySensing_bodyDetected',
            'xeduBodySensing_bodyPointAxis',
            'control_wait_until',
            'control_forever',
            'event_broadcast'
        ]) {
            assert(controllerOpcodes.has(opcode), `Missing controller opcode: ${opcode}`);
        }
    } finally {
        rmSync(directory, {recursive: true, force: true});
    }
});
