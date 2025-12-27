// AI 助手逻辑
import apiClient from './api.js';

let conversationHistory = [];

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
    messageDiv.textContent = content;

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

    // 先放置一个“思考中”占位气泡，避免 UI 没反馈
    const loadingBubble = addMessageToChat('AI 正在思考...', 'ai', { isLoading: true });

    try {
        // 调用API，传入历史记录
        // 注意：这里需要 api.js 支持传入 history 参数，或者我们直接修改调用的 payload
        const response = await apiClient.askAI(imageData, question, conversationHistory);

        if (response.success) {
            const answer = response.answer || 'AI回复为空';
            
            // 记录 AI 历史
            conversationHistory.push({ role: 'assistant', content: answer });

            if (loadingBubble) {
                loadingBubble.textContent = answer;
                loadingBubble.classList.remove('message-loading');
            } else {
                addMessageToChat(answer, 'ai');
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

    const reader = new FileReader();
    reader.onload = () => {
        const preview = document.getElementById('image-preview');
        const previewImg = document.getElementById('preview-img');
        if (previewImg) {
            previewImg.src = reader.result;
        }
        if (preview) {
            preview.style.display = 'block';
        }
    };
    reader.readAsDataURL(file);
}

export function removeImage() {
    const preview = document.getElementById('image-preview');
    const previewImg = document.getElementById('preview-img');
    if (preview) preview.style.display = 'none';
    if (previewImg) previewImg.src = '';
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
        const baseURL = 'https://api.moonshot.cn/v1';  // 使用默认值
        const model = 'moonshot-v1-8k-vision-preview'; // 使用默认值
        const timeout = 30;
        const maxHistory = 50;

        const config = {
            api_key: apiKey,
            base_url: baseURL,
            model: model,
            timeout: timeout,
            max_history: maxHistory
        };

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
        const baseURL = 'https://api.moonshot.cn/v1';
        const model = 'moonshot-v1-8k-vision-preview';
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
