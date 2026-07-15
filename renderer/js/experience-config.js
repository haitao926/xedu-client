export const EXPERIENCE_MODES = Object.freeze({
    STUDENT: 'student',
    TEACHER: 'teacher',
});

const EXPERIENCE_CONFIG = Object.freeze({
    [EXPERIENCE_MODES.STUDENT]: {
        modeLabel: '学生模式',
        pageCopy: {
            main: {
                title: '课程任务中心',
                subtitle: '进入当前课节的任务与实验入口',
            },
            'blockly-workspace': {
                title: '旧版 Blockly',
                subtitle: '仅用于打开历史 .blockly 项目',
            },
            'scratch-workspace': {
                title: 'Scratch 编程',
                subtitle: 'XEdu Client 内置官方 Scratch 编辑器与 XEdu AI 扩展',
            },
            'ai-assistant': {
                title: 'AI 助手',
                subtitle: '学习助手会围绕当前课程、实验任务和报错理解来提供支持',
            },
            resources: {
                title: '学习空间',
                subtitle: '打开本地课程、进入课堂，并从课程任务中心选择实验入口',
            },
            settings: {
                title: '设置',
                subtitle: '系统、模型与资源源配置',
            },
        },
        dashboard: {
            heroKicker: 'Student Workspace',
            heroTitle: '先进入课堂，再顺手把实验做完。',
            heroDesc: '学生首页聚焦课堂接入、最近实验和学习支持，不把系统管理操作堆在第一屏。进入 Notebook 或 Scratch 后，可以继续在同一个工作台里完成实验。',
            heroPrimaryLabel: '刷新课堂列表',
            heroSecondaryLabel: '打开学习助手',
            heroTertiaryLabel: '继续最近实验',
            roleSummaryTitle: '当前是学生体验',
            roleSummaryDesc: '默认只展示学习相关入口。教师侧的资源管理、发布和系统配置会在教师解锁后出现。',
            roleSummaryNotes: ['课堂优先', '学习路径更直接', '教师能力已收起'],
            cards: {
                jupyter: {
                    title: 'Notebook 实验',
                    desc: '继续最近一次代码实验，或在课堂接入后直接打开本节实验。',
                    meta: ['继续最近文件', '支持 Notebook / Python'],
                    primaryLabel: '继续代码实验',
                    secondaryLabel: '查看实验来源',
                },
                blockly: {
                    title: 'Scratch 编程',
                    desc: '从课程任务中心直接进入内置 Scratch 编辑器，完成本节课的图形化编程实践。',
                    meta: ['内置 Scratch', '支持 XEdu AI 扩展'],
                    primaryLabel: '打开 Scratch',
                    secondaryLabel: '学习模式提示',
                },
                source: {
                    title: '课堂接入',
                    desc: '发现正在进行的课堂，进入当前课节，并自动定位到实验上下文。',
                    meta: ['自动发现课堂', '进入后可直达实验'],
                    primaryLabel: '进入课堂',
                    secondaryLabel: '打开来源页',
                },
            },
            support: {
                classroomTitle: '课堂列表',
                classroomDesc: '进入局域网课堂后，会自动把你带到当前课程和实验。',
                classroomEmpty: '正在查找课堂...',
                contextTitle: '学习路径提示',
                contextDesc: '如果你还没进入课堂，可以先问 AI 助手“这节实验要做什么”，再决定进入 Notebook 还是 Scratch。',
                contextMeta: ['学习问题优先', '遇到报错可直接提问', '教师操作不会出现在这里'],
            },
            systemSummary: '实验工作区',
            systemNote: 'Jupyter 画布会在需要时承载当前实验内容。',
        },
        ai: {
            sidebarTitle: '学习对话',
            headerTitle: '学习助手',
            sessionTitle: '当前对话',
            sessionDesc: '',
            subtitle: '',
            modelBadgeReady: '学习模型',
            modelBadgeEmpty: '学习模型',
            showModelIdentifier: false,
            contextFallback: '学习模式',
            contextTitle: '当前为学生/学习模式',
            composerLabel: '直接提问',
            composerCaption: '',
            placeholder: '输入问题',
            guard: '',
            status: {
                idle: '等待提问',
                loading: '正在思考',
                error: '请求失败',
                success: '已回复',
            },
            emptyState: {
                eyebrow: '',
                text: '直接开始提问',
                desc: '',
                primarySuggestion: {
                    label: '理解当前实验',
                    prompt: '先帮我理解一下当前实验要做什么，我应该从哪里开始？',
                    submitOnClick: true,
                },
                secondaryLabel: '',
                suggestions: [
                    { label: '解释这个概念', prompt: '请用学生能听懂的话解释一下当前实验涉及的核心概念' },
                    { label: '帮我看报错', prompt: '帮我分析一下当前实验报错可能是什么原因' },
                    { label: '整理下一步', prompt: '帮我整理一下当前实验接下来应该怎么推进' },
                ],
                notes: [],
            },
        },
        blockly: {
            eyebrow: 'Student Scratch',
            title: '进入 Scratch 继续完成当前任务',
            desc: '学生模式下会优先保留实验上下文与继续学习的路径，不展示教师侧的构建与导入语义。',
            notes: ['适合继续课堂任务', '可与 AI 助手联动提问', '写作业与作品更聚焦'],
        },
        teacherToggle: {
            locked: '教师登录',
            unlocked: '教师模式已开启',
        },
    },
    [EXPERIENCE_MODES.TEACHER]: {
        modeLabel: '教师模式',
        pageCopy: {
            main: {
                title: '总控制台',
                subtitle: '',
            },
            'blockly-workspace': {
                title: '旧版 Blockly',
                subtitle: '仅用于打开历史 .blockly 项目',
            },
            'scratch-workspace': {
                title: 'Scratch 编程',
                subtitle: 'XEdu Client 内置官方 Scratch 编辑器与 XEdu AI 扩展',
            },
            'ai-assistant': {
                title: 'AI 助手',
                subtitle: '',
            },
            resources: {
                title: '课程资源',
                subtitle: '浏览课程、实验与文件，并按需打开到实验环境',
            },
            settings: {
                title: '设置',
                subtitle: '系统、模型与资源源配置',
            },
        },
        dashboard: {
            heroKicker: 'Teacher Console',
            heroTitle: '把备课、管课、发课和实验环境放到同一个控制台。',
            heroDesc: '教师首页优先展示课程准备状态、课堂入口、AI 助教快捷动作与实验工作区，把高频教学任务放到第一屏，而不是只有系统面板。',
            heroPrimaryLabel: '打开课程资源',
            heroSecondaryLabel: '进入 AI 助手',
            heroTertiaryLabel: '启动 Jupyter',
            roleSummaryTitle: '当前是教师体验',
            roleSummaryDesc: '资源管理、课堂控制和环境配置已解锁；AI 负责课程说明与操作导航，涉及写入类操作时仍会先请求确认。',
            roleSummaryNotes: ['课程管理工作台', '教师 AI 导航可用', '系统配置已解锁'],
            cards: {
                jupyter: {
                    title: 'Jupyter 工作区',
                    desc: '启动实验环境、继续最近代码文件，或从课程资源页打开具体实验。',
                    meta: ['环境状态可见', '适合课前检查与现场授课'],
                    primaryLabel: '启动 Jupyter',
                    secondaryLabel: '继续最近文件',
                },
                blockly: {
                    title: 'Scratch 实验台',
                    desc: '进入内置 Scratch 工作区调试课内实验，适合课前预演与课堂准备。',
                    meta: ['内置 Scratch', '支持教师调试'],
                    primaryLabel: '打开 Scratch',
                    secondaryLabel: '查看实验',
                },
                source: {
                    title: '课程与课堂',
                    desc: '进入课程资源库，查看课程结构、管理课堂状态并处理上传/更新等操作。',
                    meta: ['资源与课堂合一', '发布前可快速检查'],
                    primaryLabel: '打开课程资源',
                    secondaryLabel: '查看当前来源',
                },
            },
            support: {
                classroomTitle: '课堂与备课提示',
                classroomDesc: '教师可从课程详情中开启课堂；学生进入后会自动落到当前课节实验。',
                classroomEmpty: '当前可在课程资源页开启课堂或整理课程结构',
                contextTitle: '当前实验上下文',
                contextDesc: '最近打开的实验和课程上下文会同步到这里，便于继续调试、讲解或交给 AI 助教处理。',
                contextMeta: ['课程上下文同步', '支持继续最近实验', '教师写入动作会二次确认'],
            },
            systemSummary: '教师控制台',
            systemNote: '项目路径、Jupyter 控制和运行日志保留在下方，适合课前检查与现场排障。',
        },
        ai: {
            sidebarTitle: '学习对话',
            headerTitle: '学习助手',
            sessionTitle: '当前对话',
            sessionDesc: '',
            subtitle: '围绕当前课程、实验任务和报错理解来提供支持',
            modelBadgeReady: '学习模型',
            modelBadgeEmpty: '学习模型',
            showModelIdentifier: false,
            contextFallback: '学习模式',
            contextTitle: '当前为学习助手',
            composerLabel: '直接提问',
            composerCaption: '',
            placeholder: '输入学习问题：实验目标、概念、报错、Blockly 或 Python 步骤',
            guard: '',
            status: {
                idle: '等待提问',
                loading: '正在思考',
                error: '请求失败',
                success: '已回复',
            },
            emptyState: {
                eyebrow: '',
                text: '直接开始提问',
                desc: '',
                primarySuggestion: {
                    label: '理解当前实验',
                    prompt: '先帮我理解一下当前实验要做什么，我应该从哪里开始？',
                    submitOnClick: true,
                },
                secondaryLabel: '',
                suggestions: [
                    { label: '解释这个概念', prompt: '请用学生能听懂的话解释一下当前实验涉及的核心概念' },
                    { label: '帮我看报错', prompt: '帮我分析一下当前实验报错可能是什么原因' },
                    { label: '整理下一步', prompt: '帮我整理一下当前实验接下来应该怎么推进' },
                ],
                notes: [],
            },
        },
        blockly: {
            eyebrow: 'Teacher Scratch',
            title: '在 Scratch 实验台里调试、预览并准备课堂内容',
            desc: '教师模式下优先使用内置 Scratch 工作区，旧版 Blockly 仅作为历史资源兼容入口。',
            notes: ['适合课前调试', '可联动教师 AI 导航', '课堂内容准备更完整'],
        },
        teacherToggle: {
            locked: '教师登录',
            unlocked: '教师模式已开启',
        },
    },
});

export function getExperienceMode(isTeacher = !document.body.classList.contains('student-mode')) {
    return isTeacher ? EXPERIENCE_MODES.TEACHER : EXPERIENCE_MODES.STUDENT;
}

export function getExperienceConfig(modeOrFlag) {
    const mode = typeof modeOrFlag === 'string'
        ? modeOrFlag
        : getExperienceMode(Boolean(modeOrFlag));
    return EXPERIENCE_CONFIG[mode] || EXPERIENCE_CONFIG[EXPERIENCE_MODES.STUDENT];
}

export function getPageCopy(tabId, modeOrFlag) {
    const config = getExperienceConfig(modeOrFlag);
    return config.pageCopy?.[tabId] || config.pageCopy.main;
}

export function getTeacherToggleLabel(isTeacher) {
    const config = getExperienceConfig(isTeacher);
    return isTeacher ? config.teacherToggle.unlocked : config.teacherToggle.locked;
}
