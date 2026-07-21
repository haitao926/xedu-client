// AI 助手逻辑
import apiClient, { getApiErrorMessage } from './api.js';
import { EXPERIENCE_MODES, getExperienceConfig, getExperienceMode } from './experience-config.js';
import { sanitizeHtml } from './html-sanitizer.js';
import { escapeHtml } from './utils/html.js';

let conversationHistory = [];
let aiUiInitialized = false;
let chatStatusResetTimer = null;

export function normalizeAiApiMode(baseUrl, apiMode = 'auto') {
    try {
        const hostname = new URL(baseUrl).hostname.toLowerCase();
        if (
            hostname === 'api.moonshot.cn'
            || hostname === 'api.deepseek.com'
            || hostname.endsWith('.moonshot.cn')
            || hostname.endsWith('.deepseek.com')
        ) {
            return 'auto';
        }
    } catch (_) {
        // Preserve the selected mode until a complete URL is available.
    }
    return apiMode || 'auto';
}

function getAssistantConfig() {
    return getExperienceConfig(EXPERIENCE_MODES.STUDENT).ai;
}

function getAssistantSurfaceMode() {
    return EXPERIENCE_MODES.STUDENT;
}

function syncAssistantSurfaceMode() {
    const page = document.getElementById('ai-assistant');
    if (!page) return;
    page.dataset.aiMode = getAssistantSurfaceMode();
}

function buildSuggestionChips(suggestions = [], modifier = '') {
    return suggestions.map((item) => {
        const submitOnClick = item?.submitOnClick ? 'true' : 'false';
        const modifierClass = modifier ? ` ${modifier}` : '';
        return `
        <button class="chat-suggestion-chip${modifierClass}" data-ai-suggestion="${escapeHtml(item.prompt)}" data-ai-submit="${submitOnClick}">${escapeHtml(item.label)}</button>
    `;
    }).join('');
}

function buildEmptyStatePrimary(primarySuggestion) {
    if (!primarySuggestion?.label || !primarySuggestion?.prompt) return '';
    return `
        <div class="chat-empty-primary">
            ${buildSuggestionChips([primarySuggestion], 'chat-suggestion-chip-primary')}
        </div>
    `;
}

function buildEmptyStateEyebrow(text = '') {
    if (!text) return '';
    return `<div class="empty-eyebrow">${escapeHtml(text)}</div>`;
}

function buildOptionalTextBlock(text = '', className = '') {
    if (!text) return '';
    return `<div class="${className}">${escapeHtml(text)}</div>`;
}

function buildEmptyStateSuggestions(suggestions = [], label = '') {
    if (!suggestions.length) return '';
    const labelHtml = label ? `<div class="chat-empty-secondary-label">${escapeHtml(label)}</div>` : '';
    return `
        <div class="chat-empty-secondary">
            ${labelHtml}
            <div class="chat-empty-suggestions">
                ${buildSuggestionChips(suggestions)}
            </div>
        </div>
    `;
}

function buildNotePills(notes = []) {
    return notes.map((item) => `<span>${escapeHtml(item)}</span>`).join('');
}

function buildEmptyStateNotes(notes = []) {
    if (!notes.length) return '';
    return `
        <div class="chat-empty-notes">
            ${buildNotePills(notes)}
        </div>
    `;
}

function buildEmptyStateHtml() {
    const aiConfig = getAssistantConfig();
    return `
        <div class="chat-empty-state">
            <div class="empty-orb">
                <div class="empty-orb-ring"></div>
                <div class="empty-icon">✦</div>
            </div>
            ${buildEmptyStateEyebrow(aiConfig.emptyState.eyebrow)}
            ${buildOptionalTextBlock(aiConfig.emptyState.text, 'empty-text')}
            ${buildOptionalTextBlock(aiConfig.emptyState.desc, 'empty-desc')}
            ${buildEmptyStatePrimary(aiConfig.emptyState.primarySuggestion)}
            ${buildEmptyStateSuggestions(aiConfig.emptyState.suggestions, aiConfig.emptyState.secondaryLabel)}
            ${buildEmptyStateNotes(aiConfig.emptyState.notes)}
        </div>
    `;
}

function updateChatStatus(state = 'idle', text = '') {
    const host = document.getElementById('ai-chat-status');
    const label = document.getElementById('ai-chat-status-text');
    if (!host || !label) return;
    if (chatStatusResetTimer) {
        clearTimeout(chatStatusResetTimer);
        chatStatusResetTimer = null;
    }
    host.classList.remove('is-loading', 'is-error', 'is-success');
    if (state === 'loading') host.classList.add('is-loading');
    if (state === 'error') host.classList.add('is-error');
    if (state === 'success') host.classList.add('is-success');
    const aiConfig = getAssistantConfig();
    const defaults = aiConfig.status || {
        idle: '等待提问',
        loading: '处理中',
        error: '请求失败',
        success: '已完成'
    };
    label.textContent = text || defaults[state] || defaults.idle;
}

function scheduleChatStatusReset(delay = 2200) {
    chatStatusResetTimer = window.setTimeout(() => {
        chatStatusResetTimer = null;
        updateChatStatus('idle');
    }, delay);
}

function syncChatContextPill() {
    const pill = document.getElementById('ai-context-pill');
    if (!pill) return;
    const ctx = buildAgentContext();
    const title = ctx?.course?.title?.trim();
    if (title) {
        pill.textContent = title;
        pill.title = `当前课程：${title}`;
        pill.style.display = '';
        return;
    }
    const aiConfig = getAssistantConfig();
    const fallback = aiConfig.contextFallback || '';
    pill.textContent = fallback;
    pill.title = aiConfig.contextTitle || '';
    pill.style.display = fallback ? '' : 'none';
}

function createAvatar(sender) {
    const avatar = document.createElement('div');
    avatar.className = `avatar ${sender === 'user' ? 'avatar-user' : 'avatar-ai'}`;
    avatar.textContent = sender === 'user' ? '我' : 'AI';
    return avatar;
}

function applyAssistantMessageContent(messageDiv, content, options = {}) {
    const isError = options.messageStatus === 'error';
    messageDiv.classList.remove('message-success', 'message-error');
    messageDiv.classList.add(isError ? 'message-error' : 'message-success');

    if (options.renderAgentCard) {
        messageDiv.innerHTML = sanitizeHtml(renderAgentCard(options.response || {}, content));
        return;
    }
    if (options.renderMarkdown) {
        messageDiv.innerHTML = `<div class="markdown-body chat-markdown">${sanitizeHtml(renderMarkdown(content))}</div>`;
        return;
    }
    messageDiv.textContent = content;
}

function buildAgentContext() {
    try {
        const ctx = window.app?.resources?.getChatContext?.();
        if (ctx && typeof ctx === 'object') {
            return {
                ...ctx,
                experience_mode: EXPERIENCE_MODES.STUDENT,
                teacher_mode: {
                    ...(ctx.teacher_mode || {}),
                    unlocked: false,
                    code: ''
                }
            };
        }
    } catch (error) {
        console.warn('读取聊天课程上下文失败:', error);
    }
    return {
        experience_mode: EXPERIENCE_MODES.STUDENT,
        teacher_mode: {
            unlocked: false,
            code: ''
        },
        course: null,
        experiment_context: null
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
    updateChatStatus('loading');

    try {
        const overrides = buildAiOverrideConfig();
        // 调用API，传入历史记录
        // 注意：这里需要 api.js 支持传入 history 参数，或者我们直接修改调用的 payload
        const response = await apiClient.askAI(imageData, question, conversationHistory, overrides, buildAgentContext());

        if (response.success) {
            const answer = response.answer || 'AI回复为空';
            updateChatStatus('success');
            scheduleChatStatusReset();

            // 记录 AI 历史
            conversationHistory.push({ role: 'assistant', content: answer });

            if (loadingBubble) {
                applyAssistantMessageContent(loadingBubble, answer, { renderMarkdown: true });
                loadingBubble.classList.remove('message-loading');
            } else {
                addMessageToChat(answer, 'ai', { renderMarkdown: true });
            }
        } else {
            const errorText = `错误: ${response.error || '未知错误'}`;
            // 移除刚才添加的错误历史，以免污染上下文
            conversationHistory.pop();
            updateChatStatus('error', '处理失败');

            if (loadingBubble) {
                applyAssistantMessageContent(loadingBubble, errorText, { messageStatus: 'error' });
                loadingBubble.classList.remove('message-loading');
            } else {
                addMessageToChat(errorText, 'ai', { messageStatus: 'error' });
            }
        }
    } catch (error) {
        console.error('AI请求失败:', error);
        // 移除错误历史
        conversationHistory.pop();
        updateChatStatus('error', '请求失败');

        const errorText = `请求失败：${getApiErrorMessage(error, '未知错误')}`;
        if (loadingBubble) {
            applyAssistantMessageContent(loadingBubble, errorText, { messageStatus: 'error' });
            loadingBubble.classList.remove('message-loading');
        } else {
            addMessageToChat(errorText, 'ai', { messageStatus: 'error' });
        }
    }
}

export function clearCurrentChat() {
    conversationHistory = []; // 清空历史
    updateChatStatus('idle');
    const chatHistory = document.getElementById('chat-history');
    if (chatHistory) {
        chatHistory.innerHTML = buildEmptyStateHtml();
    }
    syncChatContextPill();
}

export function syncAssistantModeUI() {
    const aiConfig = getAssistantConfig();
    syncAssistantSurfaceMode();
    const title = document.querySelector('.chat-header-title');
    const subtitle = document.querySelector('.chat-header-subtitle');
    const sidebarTitle = document.getElementById('chat-sidebar-title');
    const sessionTitle = document.querySelector('.chat-session-item .session-title');
    const sessionDesc = document.querySelector('.chat-session-item .session-desc');
    const label = document.querySelector('.ai-composer-label');
    const caption = document.querySelector('.ai-composer-caption');
    const guard = document.getElementById('ai-write-guard');
    const textarea = document.getElementById('ai-question');
    const setOptionalText = (element, text) => {
        if (!element) return;
        element.textContent = text || '';
        element.style.display = text ? '' : 'none';
    };
    if (title) {
        title.textContent = aiConfig.headerTitle || 'AI 助手';
    }
    setOptionalText(subtitle, aiConfig.subtitle);
    if (sidebarTitle) {
        sidebarTitle.textContent = aiConfig.sidebarTitle;
    }
    if (sessionTitle) {
        sessionTitle.textContent = aiConfig.sessionTitle;
    }
    setOptionalText(sessionDesc, aiConfig.sessionDesc);
    setOptionalText(label, aiConfig.composerLabel);
    setOptionalText(caption, aiConfig.composerCaption);
    setOptionalText(guard, aiConfig.guard);
    if (textarea) {
        textarea.placeholder = aiConfig.placeholder;
    }
    syncModelBadge();
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
        const selectedApiMode = document.getElementById('ai-api-mode')?.value || 'auto';
        const rawBaseURL = document.getElementById('ai-base-url')?.value.trim() || '';
        const apiMode = normalizeAiApiMode(rawBaseURL, selectedApiMode);
        const defaultBaseURL = apiMode === 'responses' ? 'https://api.openai.com/v1' : 'https://api.moonshot.cn/v1';
        const defaultModel = apiMode === 'responses' ? 'gpt-4.1-mini' : 'moonshot-v1-8k-vision-preview';
        const baseURL = rawBaseURL || defaultBaseURL;
        const model = document.getElementById('ai-model-input')?.value.trim() || defaultModel;
        const timeout = 30;
        const maxHistory = 50;

        const config = {
            base_url: baseURL,
            model: model,
            api_mode: apiMode,
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
        const selectedApiMode = document.getElementById('ai-api-mode')?.value || 'auto';
        const rawBaseURL = document.getElementById('ai-base-url')?.value.trim() || '';
        const apiMode = normalizeAiApiMode(rawBaseURL, selectedApiMode);
        const defaultBaseURL = apiMode === 'responses' ? 'https://api.openai.com/v1' : 'https://api.moonshot.cn/v1';
        const defaultModel = apiMode === 'responses' ? 'gpt-4.1-mini' : 'moonshot-v1-8k-vision-preview';
        const baseURL = rawBaseURL || defaultBaseURL;
        const model = document.getElementById('ai-model-input')?.value.trim() || defaultModel;
        const timeout = 30;

        const config = {
            api_key: apiKey,
            base_url: baseURL,
            model: model,
            api_mode: apiMode,
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
        alert(`测试失败：${getApiErrorMessage(error, '网络错误')}`);
    }
}

export function syncModelBadge() {
    const badge = document.getElementById('ai-model-badge');
    if (!badge) return;
    const model = document.getElementById('ai-model-input')?.value.trim();
    const aiConfig = getAssistantConfig();
    const showModelIdentifier = aiConfig.showModelIdentifier !== false;
    badge.textContent = showModelIdentifier
        ? (model || aiConfig.modelBadgeEmpty || '未设置模型')
        : (aiConfig.modelBadgeReady || aiConfig.modelBadgeEmpty || '学习模型');
    badge.title = model || aiConfig.modelBadgeEmpty || '';
    badge.classList.toggle('is-generic', !showModelIdentifier);
}

function buildAiOverrideConfig() {
    const apiKey = document.getElementById('api-key-input')?.value.trim();
    const baseURL = document.getElementById('ai-base-url')?.value.trim();
    const model = document.getElementById('ai-model-input')?.value.trim();
    const apiMode = normalizeAiApiMode(baseURL, document.getElementById('ai-api-mode')?.value);
    const override = {};
    if (apiKey) override.api_key = apiKey;
    if (baseURL) override.base_url = baseURL;
    if (model) override.model = model;
    if (apiMode) override.api_mode = apiMode;
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
    const apiModeInput = document.getElementById('ai-api-mode');
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
            if (!target || !questionInput) return;
            questionInput.value = target.getAttribute('data-ai-suggestion') || '';
            questionInput.focus();
            questionInput.dispatchEvent(new Event('input'));
            if (target.getAttribute('data-ai-submit') === 'true') {
                askAI();
            }
        });
    }

    if (baseUrlInput) {
        baseUrlInput.addEventListener('input', syncModelBadge);
    }
    if (modelInput) {
        modelInput.addEventListener('input', syncModelBadge);
    }
    if (apiModeInput) {
        apiModeInput.addEventListener('change', syncModelBadge);
    }

    syncModelBadge();
    syncChatContextPill();
    syncAssistantModeUI();
    updateChatStatus('idle');
    toggleAttachmentHint(true);
}

window.addEventListener('DOMContentLoaded', initAIUI);
window.addEventListener('xedu:teacher-mode-changed', syncAssistantModeUI);
