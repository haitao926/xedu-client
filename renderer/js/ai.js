// AI 助手逻辑
import apiClient from './api.js';

let conversationHistory = [];
let aiUiInitialized = false;

function isTeacherModeUnlocked() {
    const ctx = buildAgentContext();
    return Boolean(ctx?.teacher_mode?.unlocked) && !document.body.classList.contains('student-mode');
}

function buildEmptyStateHtml() {
    const teacherMode = isTeacherModeUnlocked();
    if (teacherMode) {
        return `
            <div class="chat-empty-state">
                <div class="empty-orb">
                    <div class="empty-orb-ring"></div>
                    <div class="empty-icon">✦</div>
                </div>
                <div class="empty-text">把它当成你的课程助教工作台</div>
                <div class="empty-desc">可以先讨论方案，再在确认后执行 QuickForm 接入或 \`xedu-pack\` 打包。</div>
                <div class="chat-empty-suggestions">
                    <button class="chat-suggestion-chip" data-ai-suggestion="帮我给第 2 课第 1 个实验接入 QuickForm">接入 QuickForm</button>
                    <button class="chat-suggestion-chip" data-ai-suggestion="帮我把这门课按 xedu-pack 打包">打包课程</button>
                    <button class="chat-suggestion-chip" data-ai-suggestion="帮我生成一个 XEduHub Blockly 积木实验草稿">构建 Blockly 实验</button>
                    <button class="chat-suggestion-chip" data-ai-suggestion="先帮我看看当前课程适合怎么整理实验结构">整理课程结构</button>
                </div>
                <div class="chat-empty-notes">
                    <span>多轮澄清</span>
                    <span>执行前确认</span>
                    <span>仅教师可写入</span>
                </div>
            </div>
        `;
    }
    return `
        <div class="chat-empty-state">
            <div class="empty-orb">
                <div class="empty-orb-ring"></div>
                <div class="empty-icon">✦</div>
            </div>
            <div class="empty-text">把它当成你的学习助手</div>
            <div class="empty-desc">可以提问课程内容、理解实验要求，或让它帮你梳理当前要做什么。</div>
            <div class="chat-empty-suggestions">
                <button class="chat-suggestion-chip" data-ai-suggestion="帮我概括一下这门课当前实验要做什么">理解实验任务</button>
                <button class="chat-suggestion-chip" data-ai-suggestion="帮我解释一下这个实验应该怎么开始">开始做实验</button>
                <button class="chat-suggestion-chip" data-ai-suggestion="帮我整理一下当前实验的学习步骤">整理学习步骤</button>
            </div>
            <div class="chat-empty-notes">
                <span>多轮提问</span>
                <span>学习辅助</span>
                <span>教师功能已收起</span>
            </div>
        </div>
    `;
}

function updateAgentStatus(state = 'idle', text = '') {
    const host = document.getElementById('ai-agent-status');
    const label = document.getElementById('ai-agent-status-text');
    if (!host || !label) return;
    host.classList.remove('is-working', 'is-needs-action', 'is-success');
    if (state === 'working') host.classList.add('is-working');
    if (state === 'needs-action') host.classList.add('is-needs-action');
    if (state === 'success') host.classList.add('is-success');
    const defaults = {
        idle: '待命中',
        working: '处理中',
        'needs-action': '等待确认',
        success: '已完成'
    };
    label.textContent = text || defaults[state] || defaults.idle;
}

function syncChatContextPill() {
    const pill = document.getElementById('ai-context-pill');
    if (!pill) return;
    const ctx = buildAgentContext();
    const title = ctx?.course?.title?.trim();
    if (title) {
        pill.textContent = title;
        pill.title = `当前课程：${title}`;
        return;
    }
    if (isTeacherModeUnlocked()) {
        pill.textContent = '教师工作台';
        pill.title = '当前为教师模式，可执行课程助教相关操作';
        return;
    }
    pill.textContent = '学习模式';
    pill.title = '当前为学生/学习模式';
}

function createAvatar(sender) {
    const avatar = document.createElement('div');
    avatar.className = `avatar ${sender === 'user' ? 'avatar-user' : 'avatar-ai'}`;
    avatar.textContent = sender === 'user' ? '我' : 'AI';
    return avatar;
}

function sendSuggestedMessage(text = '') {
    const questionInput = document.getElementById('ai-question');
    if (!questionInput || !text) return;
    questionInput.value = text;
    questionInput.focus();
    questionInput.dispatchEvent(new Event('input'));
    askAI();
}

function formatLabel(label = '') {
    return escapeHtml(String(label || '').trim());
}

function formatValue(value = '') {
    const text = String(value || '').trim();
    if (!text) return '';
    if (/^https?:\/\//i.test(text)) {
        const safe = escapeHtml(text);
        return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${safe}</a>`;
    }
    return escapeHtml(text);
}

function buildAgentFactRows(response = {}) {
    const result = response?.agent_result || {};
    const experiment = result?.experiment || {};
    const rows = [];
    if (experiment?.experiment_title) rows.push({ label: '实验', value: experiment.experiment_title });
    if (result?.apiid) rows.push({ label: 'API ID', value: result.apiid });
    if (result?.submit_url) rows.push({ label: '提交地址', value: result.submit_url });
    if (result?.query_url) rows.push({ label: '查询地址', value: result.query_url });
    if (result?.html_path) rows.push({ label: 'HTML', value: result.html_path });
    if (result?.output_dir) rows.push({ label: '输出目录', value: result.output_dir });
    if (result?.draft_name) rows.push({ label: '草稿名', value: result.draft_name });
    if (result?.pedagogy_profile?.level_default) rows.push({ label: '默认层级', value: result.pedagogy_profile.level_default });
    if (result?.pedagogy_profile?.result_mode) rows.push({ label: '结果模式', value: result.pedagogy_profile.result_mode });
    if (result?.zip_path) rows.push({ label: '压缩包', value: result.zip_path });
    if (result?.pr_url) rows.push({ label: 'PR', value: result.pr_url });
    if (Array.isArray(result?.generated_files) && result.generated_files.length) {
        rows.push({ label: '生成文件', value: `${result.generated_files.length} 个` });
    }
    if (Array.isArray(result?.default_blocks) && result.default_blocks.length) {
        rows.push({ label: '默认积木', value: `${result.default_blocks.length} 个` });
    }
    return rows;
}

function renderAgentCard(response = {}, answer = '') {
    const status = response?.agent_status || 'completed';
    const toneMap = {
        needs_confirmation: { badge: '待确认', title: '执行前确认', cls: 'is-confirmation' },
        needs_input: { badge: '需补充', title: '还差一点信息', cls: 'is-input' },
        completed: { badge: '已完成', title: '执行结果', cls: 'is-success' },
        error: { badge: '失败', title: '处理失败', cls: 'is-error' }
    };
    const tone = toneMap[status] || toneMap.completed;
    const factRows = buildAgentFactRows(response);
    const detailHtml = answer
        ? `<div class="markdown-body chat-markdown">${renderMarkdown(answer)}</div>`
        : '';
    const factsHtml = factRows.length
        ? `<div class="agent-card-facts">${factRows.map((item) => `
            <div class="agent-card-fact">
                <span class="agent-card-fact-label">${formatLabel(item.label)}</span>
                <span class="agent-card-fact-value">${formatValue(item.value)}</span>
            </div>
        `).join('')}</div>`
        : '';
    let actionsHtml = '';
    if (status === 'needs_confirmation') {
        actionsHtml = `
            <div class="agent-card-actions">
                <button class="agent-card-btn agent-card-btn-primary" data-ai-action="confirm">确认并执行</button>
                <button class="agent-card-btn" data-ai-action="revise">再补充一下</button>
            </div>
        `;
    } else if (status === 'needs_input') {
        actionsHtml = `
            <div class="agent-card-actions">
                <button class="agent-card-btn agent-card-btn-primary" data-ai-action="focus">继续补充</button>
            </div>
        `;
    }
    return `
        <div class="agent-card ${tone.cls}">
            <div class="agent-card-head">
                <span class="agent-card-badge">${tone.badge}</span>
                <span class="agent-card-title">${tone.title}</span>
            </div>
            ${detailHtml}
            ${factsHtml}
            ${actionsHtml}
        </div>
    `.trim();
}

function applyAssistantMessageContent(messageDiv, content, options = {}) {
    const status = options.agentStatus || '';
    messageDiv.classList.remove(
        'message-confirmation',
        'message-success',
        'message-error',
        'message-input'
    );
    if (status === 'needs_confirmation') messageDiv.classList.add('message-confirmation');
    if (status === 'completed') messageDiv.classList.add('message-success');
    if (status === 'error') messageDiv.classList.add('message-error');
    if (status === 'needs_input') messageDiv.classList.add('message-input');

    if (options.renderAgentCard) {
        messageDiv.innerHTML = renderAgentCard(options.response || {}, content);
        return;
    }
    if (options.renderMarkdown) {
        messageDiv.innerHTML = `<div class="markdown-body chat-markdown">${renderMarkdown(content)}</div>`;
        return;
    }
    messageDiv.textContent = content;
}

function buildAgentContext() {
    try {
        const ctx = window.app?.resources?.getChatContext?.();
        if (ctx && typeof ctx === 'object') {
            return ctx;
        }
    } catch (error) {
        console.warn('读取聊天课程上下文失败:', error);
    }
    return {
        teacher_mode: {
            unlocked: sessionStorage.getItem('xedu_teacher_mode') === 'true',
            code: sessionStorage.getItem('xedu_teacher_mode_code') || ''
        },
        course: null
    };
}

export function addMessageToChat(content, sender, options = {}) {
    const chatHistory = document.getElementById('chat-history');
    if (!chatHistory) return null;

    const emptyState = chatHistory.querySelector('.chat-empty, .chat-empty-state');
    if (emptyState) emptyState.remove();

    const row = document.createElement('div');
    row.className = `message-row ${sender === 'user' ? 'row-user' : 'row-ai'}`;

    const avatar = createAvatar(sender);

    const messageDiv = document.createElement('div');
    messageDiv.className = `message-bubble ${sender === 'user' ? 'message-user' : 'message-ai'}`;

    if (sender === 'ai') {
        applyAssistantMessageContent(messageDiv, content, options);
    } else {
        messageDiv.textContent = content;
    }

    if (options.isLoading) {
        messageDiv.classList.add('message-loading');
    }

    // 拼装行
    row.appendChild(avatar);
    row.appendChild(messageDiv);

    chatHistory.appendChild(row);
    chatHistory.scrollTop = chatHistory.scrollHeight;
    return messageDiv;
}

export async function askAI() {
    const questionInput = document.getElementById('ai-question');
    const question = questionInput ? questionInput.value : '';

    if (!question) return;

    // 添加用户消息
    addMessageToChat(question, 'user');
    questionInput.value = '';

    // 记录用户历史
    conversationHistory.push({ role: 'user', content: question });

    // 获取图片数据
    const previewImg = document.getElementById('preview-img');
    let imageData = null;
    if (previewImg && previewImg.src) {
        // 提取base64数据
        const base64Data = previewImg.src.split(',')[1];
        if (base64Data) {
            imageData = base64Data;
        }
    }
    // 发送后立即清理预览，避免重复发送同一张图片
    removeImage();

    // 先放置一个“思考中”占位气泡，避免 UI 没反馈
    const loadingBubble = addMessageToChat('AI 正在思考...', 'ai', { isLoading: true });
    updateAgentStatus('working');

    try {
        const overrides = buildAiOverrideConfig();
        // 调用API，传入历史记录
        // 注意：这里需要 api.js 支持传入 history 参数，或者我们直接修改调用的 payload
        const response = await apiClient.askAI(imageData, question, conversationHistory, overrides, buildAgentContext());

        if (response.success) {
            const answer = response.answer || 'AI回复为空';
            if (response.course && window.app?.resources?.applyAgentCourseUpdate) {
                window.app.resources.applyAgentCourseUpdate(response.course);
                syncChatContextPill();
            }
            if (response?.agent_status === 'needs_confirmation' || response?.agent_status === 'needs_input') {
                updateAgentStatus('needs-action', response.agent_status === 'needs_confirmation' ? '等待确认' : '等待补充');
            } else {
                updateAgentStatus('success');
            }
            
            // 记录 AI 历史
            conversationHistory.push({ role: 'assistant', content: answer });

            if (loadingBubble) {
                applyAssistantMessageContent(loadingBubble, answer, {
                    renderMarkdown: !(response?.agent_status),
                    renderAgentCard: Boolean(response?.agent_status),
                    agentStatus: response?.agent_status,
                    response
                });
                loadingBubble.classList.remove('message-loading');
            } else {
                addMessageToChat(answer, 'ai', {
                    renderMarkdown: !(response?.agent_status),
                    renderAgentCard: Boolean(response?.agent_status),
                    agentStatus: response?.agent_status,
                    response
                });
            }
        } else {
            const errorText = `错误: ${response.error || '未知错误'}`;
            // 移除刚才添加的错误历史，以免污染上下文
            conversationHistory.pop();
            updateAgentStatus('needs-action', '处理失败');
            
            if (loadingBubble) {
                applyAssistantMessageContent(loadingBubble, errorText, {
                    renderAgentCard: true,
                    agentStatus: 'error',
                    response: { ...response, agent_status: 'error' }
                });
                loadingBubble.classList.remove('message-loading');
            } else {
                addMessageToChat(errorText, 'ai', {
                    renderAgentCard: true,
                    agentStatus: 'error',
                    response: { ...response, agent_status: 'error' }
                });
            }
        }
    } catch (error) {
        console.error('AI请求失败:', error);
        // 移除错误历史
        conversationHistory.pop();
        updateAgentStatus('needs-action', '网络异常');
        
        const errorText = `网络错误: ${error.message}`;
        if (loadingBubble) {
            applyAssistantMessageContent(loadingBubble, errorText, {
                renderAgentCard: true,
                agentStatus: 'error',
                response: { agent_status: 'error' }
            });
            loadingBubble.classList.remove('message-loading');
        } else {
            addMessageToChat(errorText, 'ai', {
                renderAgentCard: true,
                agentStatus: 'error',
                response: { agent_status: 'error' }
            });
        }
    }
}

export function clearCurrentChat() {
    conversationHistory = []; // 清空历史
    updateAgentStatus('idle');
    const chatHistory = document.getElementById('chat-history');
    if (chatHistory) {
        chatHistory.innerHTML = buildEmptyStateHtml();
    }
    syncChatContextPill();
}

export function syncAssistantModeUI() {
    const subtitle = document.querySelector('.chat-header-subtitle');
    const label = document.querySelector('.ai-composer-label');
    const caption = document.querySelector('.ai-composer-caption');
    const guard = document.getElementById('ai-write-guard');
    const textarea = document.getElementById('ai-question');
    const teacherMode = isTeacherModeUnlocked();
    if (subtitle) {
        subtitle.textContent = teacherMode
            ? '教师侧课程助教工作台：支持 QuickForm、xedu-pack 与 Blockly 实验构建'
            : '学习辅助对话：帮助理解课程、实验与当前学习任务';
    }
    if (label) {
        label.textContent = teacherMode ? '教师助教模式' : '学习辅助模式';
    }
    if (caption) {
        caption.textContent = teacherMode
            ? '会先澄清目标，再在确认后执行教师侧写入动作'
            : '会先帮你理解任务、梳理步骤，再继续提问或讨论';
    }
    if (guard) {
        guard.textContent = teacherMode ? '涉及课程写入时会先请求确认' : '教师侧写入功能仅在教师模式下开放';
    }
    if (textarea) {
        textarea.placeholder = teacherMode
            ? '输入教师侧任务：QuickForm、xedu-pack、Blockly 积木实验构建等（Enter 发送）'
            : '输入你的学习问题：实验要求、课程内容、下一步怎么做（Enter 发送）';
    }
    if (document.getElementById('chat-history')?.querySelector('.chat-empty-state')) {
        clearCurrentChat();
    }
}

export function startNewChat() {
    clearCurrentChat();
}

export function selectChat(index) {
    const sessions = document.querySelectorAll('.chat-session-item');
    sessions.forEach((session, idx) => {
        session.classList.toggle('active', idx === index);
    });
}

export function previewImage(input) {
    const file = input?.files?.[0];
    if (!file) return;

    previewImageFromFile(file);
}

export function removeImage() {
    const preview = document.getElementById('image-preview');
    const previewImg = document.getElementById('preview-img');
    const previewName = document.getElementById('preview-name');
    const previewSize = document.getElementById('preview-size');
    const fileInput = document.getElementById('ai-image-input');
    if (preview) {
        preview.style.display = 'none';
        preview.classList.add('hidden');
    }
    if (previewImg) previewImg.src = '';
    if (previewName) previewName.textContent = '';
    if (previewSize) previewSize.textContent = '';
    if (fileInput) fileInput.value = '';
    toggleAttachmentHint(true);
}

function renderMarkdown(content) {
    if (!content) return '';
    const normalized = content.replace(/\r\n/g, '\n');
    const lines = normalized.split('\n');
    let html = '';
    let inCodeBlock = false;
    let codeLang = '';
    let codeLines = [];
    let listType = null;
    let listItems = [];

    const flushList = () => {
        if (!listType || listItems.length === 0) return;
        const itemsHtml = listItems.map(item => `<li>${item}</li>`).join('');
        html += `<${listType}>${itemsHtml}</${listType}>`;
        listType = null;
        listItems = [];
    };

    const flushCode = () => {
        const codeHtml = escapeHtml(codeLines.join('\n'));
        const langClass = codeLang ? `language-${escapeHtml(codeLang)}` : '';
        html += `<pre><code class="${langClass}">${codeHtml}</code></pre>`;
        codeLines = [];
        codeLang = '';
    };

    for (const line of lines) {
        if (inCodeBlock) {
            if (line.startsWith('```')) {
                inCodeBlock = false;
                flushCode();
            } else {
                codeLines.push(line);
            }
            continue;
        }

        if (line.startsWith('```')) {
            flushList();
            inCodeBlock = true;
            codeLang = line.slice(3).trim();
            continue;
        }

        const trimmed = line.trim();
        if (!trimmed) {
            flushList();
            html += '<br>';
            continue;
        }

        const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
        if (headingMatch) {
            flushList();
            const level = headingMatch[1].length;
            html += `<h${level}>${renderInline(headingMatch[2])}</h${level}>`;
            continue;
        }

        const blockquoteMatch = line.match(/^>\s?(.*)$/);
        if (blockquoteMatch) {
            flushList();
            html += `<blockquote>${renderInline(blockquoteMatch[1])}</blockquote>`;
            continue;
        }

        const listMatch = line.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
        if (listMatch) {
            const isOrdered = listMatch[2].endsWith('.');
            const nextListType = isOrdered ? 'ol' : 'ul';
            if (listType && listType !== nextListType) {
                flushList();
            }
            listType = nextListType;
            listItems.push(renderInline(listMatch[3]));
            continue;
        }

        flushList();
        html += `<p>${renderInline(line)}</p>`;
    }

    if (inCodeBlock) {
        flushCode();
    }
    flushList();
    return html;
}

function renderInline(text) {
    const segments = text.split('`');
    return segments.map((segment, index) => {
        const escaped = escapeHtml(segment);
        if (index % 2 === 1) {
            return `<code>${escaped}</code>`;
        }
        let formatted = escaped;
        formatted = formatted.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
        formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>');
        return formatted;
    }).join('');
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

export function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        askAI();
    }
}

export async function saveAIConfig() {
    try {
        // 获取配置表单数据 - 使用HTML中的实际ID
        const apiKey = document.getElementById('api-key-input')?.value || '';
        const baseURL = document.getElementById('ai-base-url')?.value.trim() || 'https://api.moonshot.cn/v1';
        const model = document.getElementById('ai-model-input')?.value.trim() || 'moonshot-v1-8k-vision-preview';
        const timeout = 30;
        const maxHistory = 50;

        const config = {
            base_url: baseURL,
            model: model,
            timeout: timeout,
            max_history: maxHistory
        };
        if (apiKey) {
            config.api_key = apiKey;
        }

        // 调用保存API
        const response = await apiClient.saveAIConfig(config);

        if (response.success) {
            console.log('AI配置保存成功');
            console.log('保存的配置:', response.config);
        } else {
            console.error(`保存失败: ${response.message || '未知错误'}`);
            if (response.errors) {
                console.error('配置错误:', response.errors);
            }
        }
    } catch (error) {
        console.error('保存AI配置失败:', error);
        throw error; // 重新抛出以便main.js处理
    }
}

export async function testAIConfig() {
    try {
        // 获取配置表单数据 - 使用HTML中的实际ID
        const apiKey = document.getElementById('api-key-input')?.value || '';
        const baseURL = document.getElementById('ai-base-url')?.value.trim() || 'https://api.moonshot.cn/v1';
        const model = document.getElementById('ai-model-input')?.value.trim() || 'moonshot-v1-8k-vision-preview';
        const timeout = 30;

        const config = {
            api_key: apiKey,
            base_url: baseURL,
            model: model,
            timeout: timeout
        };

        // 调用测试API
        const response = await apiClient.testAIConfig(config);

        if (response.success) {
            alert(`连接测试成功！\n\n${response.message}\n\n示例回复: ${response.sample_response || ''}`);
        } else {
            alert(`连接测试失败: ${response.message || '未知错误'}`);
        }
    } catch (error) {
        console.error('测试AI配置失败:', error);
        alert(`测试失败: ${error.message || '网络错误'}`);
    }
}

export function syncModelBadge() {
    const badge = document.getElementById('ai-model-badge');
    if (!badge) return;
    const model = document.getElementById('ai-model-input')?.value.trim();
    badge.textContent = model || '未设置模型';
}

function buildAiOverrideConfig() {
    const apiKey = document.getElementById('api-key-input')?.value.trim();
    const baseURL = document.getElementById('ai-base-url')?.value.trim();
    const model = document.getElementById('ai-model-input')?.value.trim();
    const override = {};
    if (apiKey) override.api_key = apiKey;
    if (baseURL) override.base_url = baseURL;
    if (model) override.model = model;
    return override;
}

function formatBytes(bytes = 0) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let idx = 0;
    while (size >= 1024 && idx < units.length - 1) {
        size /= 1024;
        idx += 1;
    }
    return `${size.toFixed(size >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function toggleAttachmentHint(show) {
    const hint = document.getElementById('ai-attachment-hint');
    if (!hint) return;
    hint.style.display = show ? 'inline-flex' : 'none';
}

function previewImageFromFile(file) {
    if (!file || !file.type || !file.type.startsWith('image/')) {
        return;
    }
    const reader = new FileReader();
    reader.onload = () => {
        const preview = document.getElementById('image-preview');
        const previewImg = document.getElementById('preview-img');
        const previewName = document.getElementById('preview-name');
        const previewSize = document.getElementById('preview-size');
        if (previewImg) {
            previewImg.src = reader.result;
        }
        if (previewName) previewName.textContent = file.name || '图片';
        if (previewSize) previewSize.textContent = formatBytes(file.size);
        if (preview) {
            preview.classList.remove('hidden');
            preview.style.display = 'inline-flex';
        }
        toggleAttachmentHint(false);
    };
    reader.readAsDataURL(file);
}

function initAIUI() {
    if (aiUiInitialized) return;
    aiUiInitialized = true;

    const fileInput = document.getElementById('ai-image-input');
    const attachmentHint = document.getElementById('ai-attachment-hint');
    const inputWrapper = document.getElementById('ai-input-wrapper');
    const dropHost = inputWrapper?.closest('.input-area') || inputWrapper;
    const dropZone = document.getElementById('ai-drop-zone');
    const questionInput = document.getElementById('ai-question');
    const baseUrlInput = document.getElementById('ai-base-url');
    const modelInput = document.getElementById('ai-model-input');
    const chatHistory = document.getElementById('chat-history');

    if (attachmentHint && fileInput) {
        attachmentHint.addEventListener('click', () => fileInput.click());
        attachmentHint.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                fileInput.click();
            }
        });
    }

    const showDropZone = (show) => {
        if (dropZone) {
            dropZone.classList.toggle('active', show);
        }
    };

    if (dropHost) {
        dropHost.addEventListener('dragenter', (event) => {
            event.preventDefault();
            showDropZone(true);
        });
        dropHost.addEventListener('dragover', (event) => {
            event.preventDefault();
            showDropZone(true);
        });
        dropHost.addEventListener('dragleave', (event) => {
            if (event.target === dropHost) {
                showDropZone(false);
            }
        });
        dropHost.addEventListener('drop', (event) => {
            event.preventDefault();
            showDropZone(false);
            const file = event.dataTransfer?.files?.[0];
            if (file && file.type.startsWith('image/')) {
                previewImageFromFile(file);
            }
        });
    }

    window.addEventListener('dragend', () => showDropZone(false));
    window.addEventListener('drop', () => showDropZone(false));

    if (questionInput) {
        const resizeTextarea = () => {
            questionInput.style.height = 'auto';
            questionInput.style.height = `${Math.min(questionInput.scrollHeight, 220)}px`;
        };
        questionInput.addEventListener('input', resizeTextarea);
        resizeTextarea();

        questionInput.addEventListener('paste', (event) => {
            const items = event.clipboardData?.items || [];
            for (const item of items) {
                if (item.type && item.type.startsWith('image/')) {
                    const file = item.getAsFile();
                    if (file) {
                        previewImageFromFile(file);
                        event.preventDefault();
                        break;
                    }
                }
            }
        });
    }

    if (chatHistory) {
        chatHistory.addEventListener('click', (event) => {
            const target = event.target.closest('[data-ai-suggestion]');
            if (target && questionInput) {
                questionInput.value = target.getAttribute('data-ai-suggestion') || '';
                questionInput.focus();
                questionInput.dispatchEvent(new Event('input'));
                return;
            }
            const actionEl = event.target.closest('[data-ai-action]');
            if (!actionEl || !questionInput) return;
            const action = actionEl.getAttribute('data-ai-action');
            if (action === 'confirm') {
                sendSuggestedMessage('确认');
                return;
            }
            if (action === 'revise') {
                questionInput.focus();
                questionInput.dispatchEvent(new Event('input'));
                return;
            }
            if (action === 'focus') {
                questionInput.focus();
                return;
            }
        });
    }

    if (baseUrlInput) {
        baseUrlInput.addEventListener('input', syncModelBadge);
    }
    if (modelInput) {
        modelInput.addEventListener('input', syncModelBadge);
    }

    syncModelBadge();
    syncChatContextPill();
    syncAssistantModeUI();
    updateAgentStatus('idle');
    toggleAttachmentHint(true);
}

window.addEventListener('DOMContentLoaded', initAIUI);
window.addEventListener('xedu:teacher-mode-changed', syncAssistantModeUI);
