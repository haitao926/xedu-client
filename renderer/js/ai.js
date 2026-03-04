// AI 助手逻辑
import apiClient from './api.js';

let conversationHistory = [];
let aiUiInitialized = false;

function createAvatar(sender) {
    const avatar = document.createElement('div');
    avatar.className = `avatar ${sender === 'user' ? 'avatar-user' : 'avatar-ai'}`;
    avatar.textContent = sender === 'user' ? '我' : 'AI';
    return avatar;
}

export function addMessageToChat(content, sender, options = {}) {
    const chatHistory = document.getElementById('chat-history');
    if (!chatHistory) return null;

    const emptyState = chatHistory.querySelector('.chat-empty');
    if (emptyState) emptyState.remove();

    const row = document.createElement('div');
    row.className = `message-row ${sender === 'user' ? 'row-user' : 'row-ai'}`;

    const avatar = createAvatar(sender);

    const messageDiv = document.createElement('div');
    messageDiv.className = `message-bubble ${sender === 'user' ? 'message-user' : 'message-ai'}`;

    if (options.renderMarkdown && sender === 'ai') {
        messageDiv.innerHTML = `<div class="markdown-body chat-markdown">${renderMarkdown(content)}</div>`;
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

    try {
        const overrides = buildAiOverrideConfig();
        // 调用API，传入历史记录
        // 注意：这里需要 api.js 支持传入 history 参数，或者我们直接修改调用的 payload
        const response = await apiClient.askAI(imageData, question, conversationHistory, overrides);

        if (response.success) {
            const answer = response.answer || 'AI回复为空';
            
            // 记录 AI 历史
            conversationHistory.push({ role: 'assistant', content: answer });

            if (loadingBubble) {
                loadingBubble.innerHTML = `<div class="markdown-body chat-markdown">${renderMarkdown(answer)}</div>`;
                loadingBubble.classList.remove('message-loading');
            } else {
                addMessageToChat(answer, 'ai', { renderMarkdown: true });
            }
        } else {
            const errorText = `错误: ${response.error || '未知错误'}`;
            // 移除刚才添加的错误历史，以免污染上下文
            conversationHistory.pop();
            
            if (loadingBubble) {
                loadingBubble.textContent = errorText;
                loadingBubble.classList.remove('message-loading');
            } else {
                addMessageToChat(errorText, 'ai');
            }
        }
    } catch (error) {
        console.error('AI请求失败:', error);
        // 移除错误历史
        conversationHistory.pop();
        
        const errorText = `网络错误: ${error.message}`;
        if (loadingBubble) {
            loadingBubble.textContent = errorText;
            loadingBubble.classList.remove('message-loading');
        } else {
            addMessageToChat(errorText, 'ai');
        }
    }
}

export function clearCurrentChat() {
    conversationHistory = []; // 清空历史
    const chatHistory = document.getElementById('chat-history');
    if (chatHistory) {
        chatHistory.innerHTML = `
            <div class="chat-empty" style="text-align: center; margin-top: 40px; color: #9ca3af;">
                <div style="font-size: 48px; margin-bottom: 16px;">🤖</div>
                <div>开始新对话吧！<br>直接输入问题或上传图片进行分析</div>
            </div>
        `;
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

    const addImageBtn = document.getElementById('ai-add-image-btn');
    const fileInput = document.getElementById('ai-image-input');
    const inputWrapper = document.getElementById('ai-input-wrapper');
    const dropZone = document.getElementById('ai-drop-zone');
    const questionInput = document.getElementById('ai-question');
    const baseUrlInput = document.getElementById('ai-base-url');
    const modelInput = document.getElementById('ai-model-input');

    if (addImageBtn && fileInput) {
        addImageBtn.addEventListener('click', () => fileInput.click());
    }

    const showDropZone = (show) => {
        if (dropZone) {
            dropZone.classList.toggle('active', show);
        }
    };

    if (inputWrapper) {
        inputWrapper.addEventListener('dragenter', (event) => {
            event.preventDefault();
            showDropZone(true);
        });
        inputWrapper.addEventListener('dragover', (event) => {
            event.preventDefault();
            showDropZone(true);
        });
        inputWrapper.addEventListener('dragleave', (event) => {
            if (event.target === inputWrapper) {
                showDropZone(false);
            }
        });
        inputWrapper.addEventListener('drop', (event) => {
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

    if (baseUrlInput) {
        baseUrlInput.addEventListener('input', syncModelBadge);
    }
    if (modelInput) {
        modelInput.addEventListener('input', syncModelBadge);
    }

    syncModelBadge();
    toggleAttachmentHint(true);
}

window.addEventListener('DOMContentLoaded', initAIUI);
