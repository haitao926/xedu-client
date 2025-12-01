// AI 助手逻辑

export function addMessageToChat(content, sender) {
    const chatHistory = document.getElementById('chat-history');
    if (!chatHistory) return;

    const emptyState = chatHistory.querySelector('.chat-empty');
    if (emptyState) emptyState.remove();

    const messageDiv = document.createElement('div');
    messageDiv.className = `message-bubble ${sender === 'user' ? 'message-user' : 'message-ai'}`;
    messageDiv.style.alignSelf = sender === 'user' ? 'flex-end' : 'flex-start';
    messageDiv.textContent = content;

    chatHistory.appendChild(messageDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

export function askAI() {
    const questionInput = document.getElementById('ai-question');
    const question = questionInput ? questionInput.value : '';

    if (!question) return;

    // 添加用户消息
    addMessageToChat(question, 'user');
    questionInput.value = '';

    // 模拟AI回复
    setTimeout(() => {
        addMessageToChat('这是一个模拟的AI回复。实际功能需要连接后端API。', 'ai');
    }, 1000);
}

export function clearCurrentChat() {
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
    if (preview) preview.style.display = 'none';
}

export function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        askAI();
    }
}

export function saveAIConfig() {
    alert('AI配置保存功能待实现');
}

export function testAIConfig() {
    alert('AI连接测试功能待实现');
}
