#!/usr/bin/env node

import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {basename, dirname, join, resolve} from 'node:path';

const require = createRequire(import.meta.url);
const scratchParser = require('../scratch-editor/node_modules/scratch-parser');

const STAGE_WIDTH = 480;
const STAGE_HEIGHT = 360;
const DEFAULT_OUTPUT = '/Users/apple/Documents/XeduCourses/human-pose-control-hardware/lesson1/exp2/scratch/keypoint_coordinates.sb3';

function cliOptions(argv) {
    const outputIndex = argv.indexOf('--output');
    return {
        output: outputIndex >= 0 ? argv[outputIndex + 1] : DEFAULT_OUTPUT,
        verify: argv.includes('--verify')
    };
}

function md5(value) {
    return createHash('md5').update(value).digest('hex');
}

function svgAsset(name, svg) {
    const assetId = md5(svg);
    return {
        costume: {
            assetId,
            name,
            bitmapResolution: 1,
            md5ext: `${assetId}.svg`,
            dataFormat: 'svg',
            rotationCenterX: 0,
            rotationCenterY: 0
        },
        filename: `${assetId}.svg`,
        contents: svg
    };
}

function stageBackdrop() {
    return svgAsset('体感越障舞台', `
<svg xmlns="http://www.w3.org/2000/svg" width="${STAGE_WIDTH}" height="${STAGE_HEIGHT}" viewBox="0 0 ${STAGE_WIDTH} ${STAGE_HEIGHT}">
  <rect width="480" height="360" fill="#d7f1ff"/>
  <path d="M0 100C60 62 120 120 190 80S320 42 390 94S448 118 480 82V0H0Z" fill="#9adcf2" opacity=".66"/>
  <path d="M0 239C110 211 178 245 254 222S398 205 480 234V360H0Z" fill="#5a9466"/>
  <path d="M0 279H480V360H0Z" fill="#354e4a"/>
  <path d="M0 285H480" stroke="#f4cc58" stroke-width="5" stroke-dasharray="28 16"/>
  <rect x="16" y="14" width="238" height="50" rx="8" fill="#173b54" opacity=".9"/>
  <text x="30" y="40" fill="#ffffff" font-size="22" font-family="sans-serif" font-weight="bold">举手跳跃：体感越障</text>
  <text x="30" y="58" fill="#d7f1ff" font-size="11" font-family="sans-serif">读懂关键点，让角色跳过障碍</text>
  <rect x="317" y="18" width="146" height="33" rx="6" fill="#ffffff" opacity=".8"/>
  <text x="331" y="40" fill="#173b54" font-size="14" font-family="sans-serif">分数看板在左上角</text>
</svg>`);
}

function runnerCostume() {
    return svgAsset('闯关角色', `
<svg xmlns="http://www.w3.org/2000/svg" width="86" height="105" viewBox="0 0 86 105">
  <ellipse cx="43" cy="95" rx="31" ry="7" fill="#112f3d" opacity=".25"/>
  <rect x="20" y="30" width="46" height="50" rx="14" fill="#18a7a0" stroke="#103c52" stroke-width="4"/>
  <rect x="25" y="11" width="36" height="30" rx="12" fill="#effaf6" stroke="#103c52" stroke-width="4"/>
  <circle cx="36" cy="26" r="4" fill="#103c52"/>
  <circle cx="51" cy="26" r="4" fill="#103c52"/>
  <path d="M34 34Q43 40 52 34" fill="none" stroke="#103c52" stroke-width="3" stroke-linecap="round"/>
  <path d="M22 51L8 69M64 51L78 69" fill="none" stroke="#103c52" stroke-width="7" stroke-linecap="round"/>
  <path d="M33 79L27 95M53 79L59 95" fill="none" stroke="#103c52" stroke-width="8" stroke-linecap="round"/>
  <path d="M14 72L5 69M72 72L81 69" stroke="#f4cc58" stroke-width="4" stroke-linecap="round"/>
</svg>`);
}

function obstacleCostume() {
    return svgAsset('路障', `
<svg xmlns="http://www.w3.org/2000/svg" width="62" height="76" viewBox="0 0 62 76">
  <ellipse cx="31" cy="70" rx="26" ry="5" fill="#112f3d" opacity=".26"/>
  <path d="M10 64L22 9Q31 2 40 9L52 64Z" fill="#f0673b" stroke="#7b3031" stroke-width="4" stroke-linejoin="round"/>
  <path d="M17 42H45L48 53H14Z" fill="#fff4c3"/>
  <path d="M20 25H42L45 36H17Z" fill="#fff4c3"/>
  <rect x="5" y="63" width="52" height="8" rx="4" fill="#7b3031"/>
</svg>`);
}

function taskCardCostume() {
    return svgAsset('任务卡', `
<svg xmlns="http://www.w3.org/2000/svg" width="186" height="82" viewBox="0 0 186 82">
  <rect x="1" y="1" width="184" height="80" rx="8" fill="#fff8dd" stroke="#d28b32" stroke-width="2"/>
  <rect x="1" y="1" width="184" height="23" rx="8" fill="#d28b32"/>
  <text x="12" y="17" fill="#fff" font-size="14" font-family="sans-serif" font-weight="bold">你的代码任务</text>
  <text x="12" y="42" fill="#5b3b20" font-size="12" font-family="sans-serif">读取鼻尖、左右手腕 Y 坐标</text>
  <text x="12" y="62" fill="#5b3b20" font-size="12" font-family="sans-serif">双手高于鼻尖时广播“跳跃”</text>
</svg>`);
}

function numberInput(value) {
    return [1, [4, String(value)]];
}

function textInput(value) {
    return [1, [10, String(value)]];
}

function broadcastInput(name, id) {
    return [1, [11, name, id]];
}

function reporterInput(blockId) {
    return [3, blockId, [10, '']];
}

function booleanInput(blockId) {
    return [2, blockId];
}

function substackInput(blockId) {
    return [2, blockId];
}

function validateScratchArchive(archivePath) {
    return new Promise((resolvePromise, reject) => {
        scratchParser(readFileSync(archivePath), false, (error, result) => {
            if (error) {
                reject(error);
                return;
            }
            resolvePromise(result);
        });
    });
}

function createProject() {
    const backdrop = stageBackdrop();
    const runner = runnerCostume();
    const obstacle = obstacleCostume();
    const taskCard = taskCardCostume();
    const score = 'score';
    const noseY = 'nose_y';
    const leftWristY = 'left_wrist_y';
    const rightWristY = 'right_wrist_y';
    const gameState = 'game_state';
    const jumping = 'jumping';
    const broadcasts = {gameStart: 'game_start', jump: 'jump', gameOver: 'game_over'};

    const stageBlocks = {
        stageFlag: {
            opcode: 'event_whenflagclicked', next: 'resetScore', parent: null, inputs: {}, fields: {}, shadow: false, topLevel: true, x: 24, y: 22
        },
        resetScore: {
            opcode: 'data_setvariableto', next: 'resetNose', parent: 'stageFlag', inputs: {VALUE: numberInput(0)}, fields: {VARIABLE: ['分数', score]}, shadow: false, topLevel: false
        },
        resetNose: {
            opcode: 'data_setvariableto', next: 'resetLeftWrist', parent: 'resetScore', inputs: {VALUE: numberInput(0)}, fields: {VARIABLE: ['鼻尖 Y', noseY]}, shadow: false, topLevel: false
        },
        resetLeftWrist: {
            opcode: 'data_setvariableto', next: 'resetRightWrist', parent: 'resetNose', inputs: {VALUE: numberInput(0)}, fields: {VARIABLE: ['左手腕 Y', leftWristY]}, shadow: false, topLevel: false
        },
        resetRightWrist: {
            opcode: 'data_setvariableto', next: 'setPlaying', parent: 'resetLeftWrist', inputs: {VALUE: numberInput(0)}, fields: {VARIABLE: ['右手腕 Y', rightWristY]}, shadow: false, topLevel: false
        },
        setPlaying: {
            opcode: 'data_setvariableto', next: 'resetJumping', parent: 'resetRightWrist', inputs: {VALUE: textInput('进行中')}, fields: {VARIABLE: ['游戏状态', gameState]}, shadow: false, topLevel: false
        },
        resetJumping: {
            opcode: 'data_setvariableto', next: 'startGame', parent: 'setPlaying', inputs: {VALUE: numberInput(0)}, fields: {VARIABLE: ['跳跃中', jumping]}, shadow: false, topLevel: false
        },
        startGame: {
            opcode: 'event_broadcast', next: null, parent: 'resetJumping', inputs: {BROADCAST_INPUT: broadcastInput('开始游戏', broadcasts.gameStart)}, fields: {}, shadow: false, topLevel: false
        },
        gameOverReceiver: {
            opcode: 'event_whenbroadcastreceived', next: 'setEnded', parent: null, inputs: {}, fields: {BROADCAST_OPTION: ['游戏结束', broadcasts.gameOver]}, shadow: false, topLevel: true, x: 24, y: 202
        },
        setEnded: {
            opcode: 'data_setvariableto', next: null, parent: 'gameOverReceiver', inputs: {VALUE: textInput('结束')}, fields: {VARIABLE: ['游戏状态', gameState]}, shadow: false, topLevel: false
        }
    };

    const runnerBlocks = {
        runnerFlag: {
            opcode: 'event_whenflagclicked', next: 'runnerShow', parent: null, inputs: {}, fields: {}, shadow: false, topLevel: true, x: 24, y: 22
        },
        runnerShow: {
            opcode: 'looks_show', next: 'runnerStartPosition', parent: 'runnerFlag', inputs: {}, fields: {}, shadow: false, topLevel: false
        },
        runnerStartPosition: {
            opcode: 'motion_gotoxy', next: null, parent: 'runnerShow', inputs: {X: numberInput(-155), Y: numberInput(-118)}, fields: {}, shadow: false, topLevel: false
        },
        runnerStartReceiver: {
            opcode: 'event_whenbroadcastreceived', next: 'runnerStartPositionAgain', parent: null, inputs: {}, fields: {BROADCAST_OPTION: ['开始游戏', broadcasts.gameStart]}, shadow: false, topLevel: true, x: 24, y: 140
        },
        runnerStartPositionAgain: {
            opcode: 'motion_gotoxy', next: 'runnerReadyMessage', parent: 'runnerStartReceiver', inputs: {X: numberInput(-155), Y: numberInput(-118)}, fields: {}, shadow: false, topLevel: false
        },
        runnerReadyMessage: {
            opcode: 'looks_sayforsecs', next: null, parent: 'runnerStartPositionAgain', inputs: {MESSAGE: textInput('举起双手，让我跳起来！'), SECS: numberInput(2)}, fields: {}, shadow: false, topLevel: false
        },
        jumpReceiver: {
            opcode: 'event_whenbroadcastreceived', next: 'canJump', parent: null, inputs: {}, fields: {BROADCAST_OPTION: ['跳跃', broadcasts.jump]}, shadow: false, topLevel: true, x: 252, y: 22
        },
        canJump: {
            opcode: 'control_if', next: null, parent: 'jumpReceiver', inputs: {CONDITION: booleanInput('jumpReady'), SUBSTACK: substackInput('setJumping')}, fields: {}, shadow: false, topLevel: false
        },
        jumpReady: {
            opcode: 'operator_and', next: null, parent: 'canJump', inputs: {OPERAND1: booleanInput('gameIsPlaying'), OPERAND2: booleanInput('notJumping')}, fields: {}, shadow: false, topLevel: false
        },
        gameIsPlaying: {
            opcode: 'operator_equals', next: null, parent: 'jumpReady', inputs: {OPERAND1: reporterInput('gameStateReporter'), OPERAND2: textInput('进行中')}, fields: {}, shadow: false, topLevel: false
        },
        gameStateReporter: {
            opcode: 'data_variable', next: null, parent: 'gameIsPlaying', inputs: {}, fields: {VARIABLE: ['游戏状态', gameState]}, shadow: false, topLevel: false
        },
        notJumping: {
            opcode: 'operator_equals', next: null, parent: 'jumpReady', inputs: {OPERAND1: reporterInput('jumpingReporter'), OPERAND2: numberInput(0)}, fields: {}, shadow: false, topLevel: false
        },
        jumpingReporter: {
            opcode: 'data_variable', next: null, parent: 'notJumping', inputs: {}, fields: {VARIABLE: ['跳跃中', jumping]}, shadow: false, topLevel: false
        },
        setJumping: {
            opcode: 'data_setvariableto', next: 'rise', parent: 'canJump', inputs: {VALUE: numberInput(1)}, fields: {VARIABLE: ['跳跃中', jumping]}, shadow: false, topLevel: false
        },
        rise: {
            opcode: 'control_repeat', next: 'fall', parent: 'setJumping', inputs: {TIMES: numberInput(9), SUBSTACK: substackInput('riseOneStep')}, fields: {}, shadow: false, topLevel: false
        },
        riseOneStep: {
            opcode: 'motion_changeyby', next: 'riseWait', parent: 'rise', inputs: {DY: numberInput(16)}, fields: {}, shadow: false, topLevel: false
        },
        riseWait: {
            opcode: 'control_wait', next: null, parent: 'riseOneStep', inputs: {DURATION: numberInput(0.03)}, fields: {}, shadow: false, topLevel: false
        },
        fall: {
            opcode: 'control_repeat', next: 'clearJumping', parent: 'rise', inputs: {TIMES: numberInput(9), SUBSTACK: substackInput('fallOneStep')}, fields: {}, shadow: false, topLevel: false
        },
        fallOneStep: {
            opcode: 'motion_changeyby', next: 'fallWait', parent: 'fall', inputs: {DY: numberInput(-16)}, fields: {}, shadow: false, topLevel: false
        },
        fallWait: {
            opcode: 'control_wait', next: null, parent: 'fallOneStep', inputs: {DURATION: numberInput(0.03)}, fields: {}, shadow: false, topLevel: false
        },
        clearJumping: {
            opcode: 'data_setvariableto', next: null, parent: 'fall', inputs: {VALUE: numberInput(0)}, fields: {VARIABLE: ['跳跃中', jumping]}, shadow: false, topLevel: false
        },
        runnerGameOverReceiver: {
            opcode: 'event_whenbroadcastreceived', next: 'runnerGameOverMessage', parent: null, inputs: {}, fields: {BROADCAST_OPTION: ['游戏结束', broadcasts.gameOver]}, shadow: false, topLevel: true, x: 252, y: 288
        },
        runnerGameOverMessage: {
            opcode: 'looks_say', next: null, parent: 'runnerGameOverReceiver', inputs: {MESSAGE: textInput('撞到了！按绿旗再来。')}, fields: {}, shadow: false, topLevel: false
        }
    };

    const obstacleBlocks = {
        obstacleFlag: {
            opcode: 'event_whenflagclicked', next: 'hideObstacle', parent: null, inputs: {}, fields: {}, shadow: false, topLevel: true, x: 24, y: 22
        },
        hideObstacle: {
            opcode: 'looks_hide', next: null, parent: 'obstacleFlag', inputs: {}, fields: {}, shadow: false, topLevel: false
        },
        obstacleStartReceiver: {
            opcode: 'event_whenbroadcastreceived', next: 'showObstacle', parent: null, inputs: {}, fields: {BROADCAST_OPTION: ['开始游戏', broadcasts.gameStart]}, shadow: false, topLevel: true, x: 24, y: 132
        },
        showObstacle: {
            opcode: 'looks_show', next: 'obstacleStartPosition', parent: 'obstacleStartReceiver', inputs: {}, fields: {}, shadow: false, topLevel: false
        },
        obstacleStartPosition: {
            opcode: 'motion_gotoxy', next: 'obstacleForever', parent: 'showObstacle', inputs: {X: numberInput(265), Y: numberInput(-130)}, fields: {}, shadow: false, topLevel: false
        },
        obstacleForever: {
            opcode: 'control_forever', next: null, parent: 'obstacleStartPosition', inputs: {SUBSTACK: substackInput('moveWhenPlaying')}, fields: {}, shadow: false, topLevel: false
        },
        moveWhenPlaying: {
            opcode: 'control_if', next: 'obstacleTickWait', parent: 'obstacleForever', inputs: {CONDITION: booleanInput('obstacleGameIsPlaying'), SUBSTACK: substackInput('moveObstacle')}, fields: {}, shadow: false, topLevel: false
        },
        obstacleGameIsPlaying: {
            opcode: 'operator_equals', next: null, parent: 'moveWhenPlaying', inputs: {OPERAND1: reporterInput('obstacleGameState'), OPERAND2: textInput('进行中')}, fields: {}, shadow: false, topLevel: false
        },
        obstacleGameState: {
            opcode: 'data_variable', next: null, parent: 'obstacleGameIsPlaying', inputs: {}, fields: {VARIABLE: ['游戏状态', gameState]}, shadow: false, topLevel: false
        },
        moveObstacle: {
            opcode: 'motion_changexby', next: 'recycleObstacle', parent: 'moveWhenPlaying', inputs: {DX: numberInput(-8)}, fields: {}, shadow: false, topLevel: false
        },
        recycleObstacle: {
            opcode: 'control_if', next: 'checkCollision', parent: 'moveObstacle', inputs: {CONDITION: booleanInput('pastLeftEdge'), SUBSTACK: substackInput('scoreAndReset')}, fields: {}, shadow: false, topLevel: false
        },
        pastLeftEdge: {
            opcode: 'operator_lt', next: null, parent: 'recycleObstacle', inputs: {OPERAND1: reporterInput('obstacleX'), OPERAND2: numberInput(-265)}, fields: {}, shadow: false, topLevel: false
        },
        obstacleX: {
            opcode: 'motion_xposition', next: null, parent: 'pastLeftEdge', inputs: {}, fields: {}, shadow: false, topLevel: false
        },
        scoreAndReset: {
            opcode: 'data_changevariableby', next: 'resetObstaclePosition', parent: 'recycleObstacle', inputs: {VALUE: numberInput(1)}, fields: {VARIABLE: ['分数', score]}, shadow: false, topLevel: false
        },
        resetObstaclePosition: {
            opcode: 'motion_setx', next: null, parent: 'scoreAndReset', inputs: {X: numberInput(265)}, fields: {}, shadow: false, topLevel: false
        },
        checkCollision: {
            opcode: 'control_if', next: null, parent: 'recycleObstacle', inputs: {CONDITION: booleanInput('touchingRunner'), SUBSTACK: substackInput('sendGameOver')}, fields: {}, shadow: false, topLevel: false
        },
        touchingRunner: {
            opcode: 'sensing_touchingobject', next: null, parent: 'checkCollision', inputs: {TOUCHINGOBJECT: textInput('闯关角色')}, fields: {}, shadow: false, topLevel: false
        },
        sendGameOver: {
            opcode: 'event_broadcast', next: null, parent: 'checkCollision', inputs: {BROADCAST_INPUT: broadcastInput('游戏结束', broadcasts.gameOver)}, fields: {}, shadow: false, topLevel: false
        },
        obstacleTickWait: {
            opcode: 'control_wait', next: null, parent: 'moveWhenPlaying', inputs: {DURATION: numberInput(0.04)}, fields: {}, shadow: false, topLevel: false
        },
        obstacleGameOverReceiver: {
            opcode: 'event_whenbroadcastreceived', next: 'hideObstacleAfterGame', parent: null, inputs: {}, fields: {BROADCAST_OPTION: ['游戏结束', broadcasts.gameOver]}, shadow: false, topLevel: true, x: 24, y: 330
        },
        hideObstacleAfterGame: {
            opcode: 'looks_hide', next: null, parent: 'obstacleGameOverReceiver', inputs: {}, fields: {}, shadow: false, topLevel: false
        }
    };

    const studentBlocks = {
        studentFlag: {
            opcode: 'event_whenflagclicked', next: null, parent: null, inputs: {}, fields: {}, shadow: false, topLevel: true, x: 35, y: 35
        }
    };

    return {
        project: {
            targets: [
                {
                    isStage: true,
                    name: 'Stage',
                    variables: {
                        [score]: ['分数', 0], [noseY]: ['鼻尖 Y', 0], [leftWristY]: ['左手腕 Y', 0], [rightWristY]: ['右手腕 Y', 0], [gameState]: ['游戏状态', '准备'], [jumping]: ['跳跃中', 0]
                    },
                    lists: {},
                    broadcasts: {[broadcasts.gameStart]: '开始游戏', [broadcasts.jump]: '跳跃', [broadcasts.gameOver]: '游戏结束'},
                    blocks: stageBlocks,
                    comments: {},
                    currentCostume: 0,
                    costumes: [{...backdrop.costume, rotationCenterX: 240, rotationCenterY: 180}],
                    sounds: [],
                    volume: 100,
                    layerOrder: 0,
                    tempo: 60,
                    videoTransparency: 35,
                    videoState: 'on',
                    textToSpeechLanguage: null
                },
                {
                    isStage: false,
                    name: '闯关角色',
                    variables: {}, lists: {}, broadcasts: {}, blocks: runnerBlocks, comments: {}, currentCostume: 0,
                    costumes: [{...runner.costume, rotationCenterX: 43, rotationCenterY: 52}], sounds: [], volume: 100,
                    layerOrder: 1, visible: true, x: -155, y: -118, size: 62, direction: 90, draggable: false, rotationStyle: 'left-right'
                },
                {
                    isStage: false,
                    name: '障碍物',
                    variables: {}, lists: {}, broadcasts: {}, blocks: obstacleBlocks, comments: {}, currentCostume: 0,
                    costumes: [{...obstacle.costume, rotationCenterX: 31, rotationCenterY: 38}], sounds: [], volume: 100,
                    layerOrder: 2, visible: true, x: 265, y: -130, size: 78, direction: 90, draggable: false, rotationStyle: "don't rotate"
                },
                {
                    isStage: false,
                    name: '学生代码',
                    variables: {}, lists: {}, broadcasts: {}, blocks: studentBlocks,
                    comments: {
                        studentTask: {
                            blockId: 'studentFlag', x: 260, y: 24, width: 352, height: 204, minimized: false,
                            text: '你的任务：\n1. 开启摄像头和人体感知。\n2. 显示身体关键点。\n3. 在循环中读取鼻尖、左手腕、右手腕的 Y 坐标。\n4. 当左右手腕 Y 都大于鼻尖 Y 时，广播“跳跃”。\n\n提示：先只显示三个变量，观察坐标变化后再写判断。'
                        }
                    },
                    currentCostume: 0, costumes: [{...taskCard.costume, rotationCenterX: 93, rotationCenterY: 41}], sounds: [], volume: 100,
                    layerOrder: 3, visible: true, x: 130, y: 116, size: 80, direction: 90, draggable: false, rotationStyle: "don't rotate"
                }
            ],
            monitors: [
                {id: score, mode: 'default', opcode: 'data_variable', params: {VARIABLE: '分数'}, spriteName: null, value: 0, width: 0, height: 0, x: 14, y: 74, visible: true, sliderMin: 0, sliderMax: 100},
                {id: noseY, mode: 'default', opcode: 'data_variable', params: {VARIABLE: '鼻尖 Y'}, spriteName: null, value: 0, width: 0, height: 0, x: 14, y: 102, visible: true, sliderMin: 0, sliderMax: 100},
                {id: leftWristY, mode: 'default', opcode: 'data_variable', params: {VARIABLE: '左手腕 Y'}, spriteName: null, value: 0, width: 0, height: 0, x: 14, y: 130, visible: true, sliderMin: 0, sliderMax: 100},
                {id: rightWristY, mode: 'default', opcode: 'data_variable', params: {VARIABLE: '右手腕 Y'}, spriteName: null, value: 0, width: 0, height: 0, x: 14, y: 158, visible: true, sliderMin: 0, sliderMax: 100}
            ],
            extensions: ['xeduCamera', 'xeduBodySensing'],
            meta: {semver: '3.0.0', vm: '14.1.0', agent: 'XEdu Client Scratch'}
        },
        assets: [backdrop, runner, obstacle, taskCard],
        expected: {score, noseY, leftWristY, rightWristY, broadcasts}
    };
}

function verifyProject(project, expected) {
    const stage = project.targets.find(target => target.isStage);
    assert(stage, 'Missing stage target');
    for (const name of ['分数', '鼻尖 Y', '左手腕 Y', '右手腕 Y', '游戏状态', '跳跃中']) {
        assert(Object.values(stage.variables).some(variable => variable[0] === name), `Missing variable: ${name}`);
    }
    for (const name of ['开始游戏', '跳跃', '游戏结束']) {
        assert(Object.values(stage.broadcasts).includes(name), `Missing broadcast: ${name}`);
    }
    assert.deepEqual(project.extensions, ['xeduCamera', 'xeduBodySensing']);
    for (const name of ['闯关角色', '障碍物', '学生代码']) {
        assert(project.targets.some(target => target.name === name), `Missing sprite: ${name}`);
    }
    const allBlocks = project.targets.flatMap(target => Object.values(target.blocks));
    for (const opcode of ['event_broadcast', 'motion_changeyby', 'sensing_touchingobject', 'data_changevariableby']) {
        assert(allBlocks.some(block => block.opcode === opcode), `Missing game block: ${opcode}`);
    }
    const studentTarget = project.targets.find(target => target.name === '学生代码');
    assert(Object.values(studentTarget.comments).some(comment => comment.text.includes('显示身体关键点')), 'Missing student sensing task');
    assert.equal(stage.broadcasts[expected.broadcasts.jump], '跳跃');
    const obstacle = project.targets.find(target => target.name === '障碍物');
    assert.deepEqual(
        obstacle.blocks.touchingRunner.inputs.TOUCHINGOBJECT,
        textInput('闯关角色'),
        'Collision target must use a Scratch string input'
    );
}

async function build(output, shouldVerify) {
    const absoluteOutput = resolve(output);
    const {project, assets, expected} = createProject();
    if (shouldVerify) verifyProject(project, expected);
    mkdirSync(dirname(absoluteOutput), {recursive: true});
    const tempDirectory = mkdtempSync(join(tmpdir(), 'xedu-body-gesture-game-'));
    const temporaryOutput = join(dirname(absoluteOutput), `.${basename(absoluteOutput)}.${process.pid}.tmp`);
    try {
        writeFileSync(join(tempDirectory, 'project.json'), `${JSON.stringify(project)}\n`, 'utf8');
        for (const asset of assets) writeFileSync(join(tempDirectory, asset.filename), asset.contents, 'utf8');
        execFileSync('zip', ['-q', '-r', temporaryOutput, '.'], {cwd: tempDirectory});
        if (shouldVerify) {
            execFileSync('unzip', ['-t', temporaryOutput], {stdio: 'pipe'});
            const packagedProject = JSON.parse(readFileSync(join(tempDirectory, 'project.json'), 'utf8'));
            verifyProject(packagedProject, expected);
        }
        await validateScratchArchive(temporaryOutput);
        renameSync(temporaryOutput, absoluteOutput);
    } finally {
        rmSync(tempDirectory, {recursive: true, force: true});
        rmSync(temporaryOutput, {force: true});
    }
    process.stdout.write(`Built Scratch project: ${absoluteOutput}\n`);
    if (shouldVerify) process.stdout.write('Verified project structure and ZIP integrity.\n');
}

const {output, verify} = cliOptions(process.argv.slice(2));
if (!output) throw new Error('Usage: node scripts/build-body-gesture-game.mjs --output <path> [--verify]');
build(output, verify).catch(error => {
    process.stderr.write(`${error?.stack || error}\n`);
    process.exitCode = 1;
});
