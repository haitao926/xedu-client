// 文档管理功能
import apiClient from './api.js';
import { sanitizeHtml } from './html-sanitizer.js';
import { escapeHtml } from './utils/html.js';

// 全局变量
let currentDocument = null;
let searchTimer = null;

// 初始化文档页面
export function initDocsPage() {
    console.log('[DEBUG] initDocsPage 被调用');
    // loadCategories(); // 已移除分类显示
    loadComponents(); // 加载组件
    showWelcomePage(); // 显示默认欢迎页
}

// 加载文档分类
export async function loadCategories() {
    try {
        const response = await apiClient.get('/api/documents/categories');
        if (response.success) {
            const container = document.getElementById('docs-categories');
            container.innerHTML = '';

            response.categories.forEach(category => {
                const item = document.createElement('div');
                item.className = 'category-item';
                item.innerHTML = `
                    <div>${category.name} (${category.count})</div>
                `;
                item.onclick = () => filterByCategory(category.name);
                container.appendChild(item);
            });
        }
    } catch (error) {
        console.error('加载文档分类失败:', error);
    }
}

// 加载组件列表
export async function loadComponents() {
    try {
        const response = await apiClient.get('/api/documents/components');
        if (response.success) {
            const container = document.getElementById('docs-components');
            container.innerHTML = '';

            response.components.forEach(component => {
                // 创建组件组容器
                const group = document.createElement('div');
                group.className = 'component-group';

                // 创建 Header
                const header = document.createElement('div');
                header.className = 'component-header';
                header.innerHTML = `
                    <span class="arrow">▶</span>
                    <span class="name">${component.name}</span>
                    <span class="count" style="margin-left: auto; color: #94a3b8; font-size: 12px;">${component.count}</span>
                `;
                
                // 创建文档列表容器 (Body)
                const body = document.createElement('div');
                body.className = 'component-docs';
                body.style.display = 'none'; // 默认折叠

                if (component.documents && component.documents.length > 0) {
                    component.documents.forEach(doc => {
                        const item = document.createElement('div');
                        item.className = 'doc-item';
                        item.dataset.docId = doc.id;
                        item.textContent = doc.title;
                        item.onclick = (e) => {
                            e.stopPropagation();
                            loadDocument(doc.id);
                        };
                        body.appendChild(item);
                    });
                } else {
                    const empty = document.createElement('div');
                    empty.className = 'doc-item empty';
                    empty.textContent = '暂无文档';
                    empty.style.color = '#94a3b8';
                    empty.style.cursor = 'default';
                    body.appendChild(empty);
                }

                // 绑定点击事件
                header.onclick = () => toggleComponentGroup(header, body);

                group.appendChild(header);
                group.appendChild(body);
                container.appendChild(group);
            });
        }
    } catch (error) {
        console.error('加载组件列表失败:', error);
    }
}

// 切换组件组折叠状态
function toggleComponentGroup(header, body) {
    const isExpanded = body.style.display !== 'none';
    body.style.display = isExpanded ? 'none' : 'block';
    
    const arrow = header.querySelector('.arrow');
    if (arrow) {
        arrow.style.transform = isExpanded ? 'rotate(0deg)' : 'rotate(90deg)';
    }
    
    if (isExpanded) {
        header.classList.remove('expanded');
    } else {
        header.classList.add('expanded');
    }
}

// 搜索文档
export function searchDocs(event) {
    if (event.key === 'Enter') {
        performSearch();
    } else {
        // 清除之前的定时器
        if (searchTimer) {
            clearTimeout(searchTimer);
        }
        // 设置新的定时器，延迟300ms执行搜索
        searchTimer = setTimeout(() => {
            const query = event.target.value.trim();
            if (query.length >= 2) {
                performSearch();
            }
        }, 300);
    }
}

// 执行搜索
export async function performSearch() {
    const query = document.getElementById('docs-search-input').value.trim();
    if (!query) {
        showWelcomePage();
        return;
    }

    try {
        const response = await apiClient.get(`/api/documents/search?q=${encodeURIComponent(query)}&limit=20`);
        if (response.success) {
            displaySearchResults(response.results, query);
        }
    } catch (error) {
        console.error('搜索文档失败:', error);
        showMessage('搜索失败，请重试', 'error');
    }
}

// 显示搜索结果
function displaySearchResults(results, query) {
    const content = document.getElementById('docs-content');

    if (results.length === 0) {
        content.innerHTML = `
            <div class="search-results">
                <h2>搜索结果</h2>
                <p>未找到与 "${escapeHtml(query)}" 相关的文档</p>
            </div>
        `;
        return;
    }

    let html = `
        <div class="search-results">
            <h2>搜索结果 (${results.length})</h2>
    `;

    results.forEach(result => {
        const documentId = escapeHtml(result.document_id);
        html += `
            <div class="search-result-item" data-action="docs.loadDocument" data-action-value="${documentId}">
                <div class="search-result-title">${escapeHtml(result.section_title)}</div>
                <div class="search-result-path">${escapeHtml(result.document_title)} / ${escapeHtml(result.section_title)}</div>
                <div class="search-result-content">${escapeHtml(result.content)}</div>
                <div class="search-result-meta">
                    <span>分类: ${escapeHtml(result.category)}</span>
                    <span>组件: ${escapeHtml(result.component)}</span>
                    <span>难度: ${escapeHtml(result.difficulty)}</span>
                </div>
            </div>
        `;
    });

    html += '</div>';
    content.innerHTML = html;
}

// 加载文档
export async function loadDocument(docId) {
    try {
        // 更新侧边栏高亮状态
        document.querySelectorAll('.doc-item').forEach(el => el.classList.remove('active'));
        const sidebarItem = Array.from(document.querySelectorAll('.doc-item[data-doc-id]'))
            .find((element) => element.dataset.docId === String(docId));
        if (sidebarItem) {
            sidebarItem.classList.add('active');
            // 自动展开父级分组
            const groupBody = sidebarItem.parentElement;
            if (groupBody && groupBody.style.display === 'none') {
                const header = groupBody.previousElementSibling;
                if (header) {
                    toggleComponentGroup(header, groupBody);
                }
            }
        }

        // 使用渲染端点获取HTML内容
        const response = await apiClient.request(`/api/documents/${docId}/render`);
        if (response.ok) {
            const htmlContent = await response.text();
            currentDocument = { id: docId };
            displayRenderedDocument(htmlContent, docId);
        } else {
            // 回退到JSON端点
            const jsonResponse = await apiClient.get(`/api/documents/${docId}`);
            if (jsonResponse.success) {
                currentDocument = jsonResponse.document;
                displayDocument(jsonResponse.document);
            } else {
                showMessage('文档不存在', 'error');
            }
        }
    } catch (error) {
        console.error('加载文档失败:', error);
        // 尝试回退到JSON端点
        try {
            const jsonResponse = await apiClient.get(`/api/documents/${docId}`);
            if (jsonResponse.success) {
                currentDocument = jsonResponse.document;
                displayDocument(jsonResponse.document);
            } else {
                showMessage('加载文档失败', 'error');
            }
        } catch (fallbackError) {
            console.error('回退加载也失败:', fallbackError);
            showMessage('加载文档失败', 'error');
        }
    }
}

// 显示渲染后的文档内容（HTML格式）
function displayRenderedDocument(htmlContent, docId) {
    const content = document.getElementById('docs-content');

    // 直接使用后端渲染的HTML内容
    content.innerHTML = `<div class="docs-article">${sanitizeHtml(htmlContent)}</div>`;

    // 增强功能：添加代码复制按钮
    const codeBlocks = content.querySelectorAll('.codehilite, .highlight, pre');
    codeBlocks.forEach(block => {
        // 避免重复添加
        if (block.querySelector('.copy-btn')) return;

        // 只有当 pre 包含 code 时才添加，或者是 codehilite 容器
        if (block.tagName === 'PRE' && !block.querySelector('code')) return;

        const btn = document.createElement('button');
        btn.className = 'copy-btn';
        btn.textContent = '复制';
        btn.onclick = (e) => copyCode(e, block);
        block.appendChild(btn);
    });

    // 增强功能：拦截链接点击
    content.onclick = (e) => {
        const link = e.target.closest('a');
        if (link) {
            const href = link.getAttribute('href');
            if (href) {
                // 锚点跳转
                if (href.startsWith('#')) {
                    e.preventDefault();
                    const targetId = href.substring(1);
                    const targetEl = document.getElementById(targetId);
                    if (targetEl) {
                        targetEl.scrollIntoView({ behavior: 'smooth' });
                    }
                } 
                // 内部文档跳转 (简单的判断逻辑，可根据实际需求调整)
                else if (!href.startsWith('http') && !href.startsWith('mailto')) {
                    e.preventDefault();
                    // 假设 href 是相对路径，尝试解析出 docId
                    // 这里可能需要更复杂的映射逻辑，暂时假设 href 文件名即 docId
                    const docIdMatch = href.match(/([^\/]+)\.md$/);
                    if (docIdMatch) {
                        loadDocument(docIdMatch[1]);
                    } else {
                         // 其他情况，可能需要打开外部链接
                         // window.open(href, '_blank');
                         console.log('未处理的链接:', href);
                    }
                }
            }
        }
    };

    // 滚动到顶部
    content.scrollTop = 0;
}

// 复制代码功能
async function copyCode(event, block) {
    event.stopPropagation();
    const btn = event.target;
    // 获取代码文本，排除复制按钮本身的文本
    const code = block.querySelector('code') ? block.querySelector('code').innerText : block.innerText.replace('复制', '');
    
    try {
        await navigator.clipboard.writeText(code);
        
        // 成功反馈
        const originalText = btn.textContent;
        btn.textContent = '已复制!';
        btn.classList.add('copied');
        
        setTimeout(() => {
            btn.textContent = originalText;
            btn.classList.remove('copied');
        }, 2000);
    } catch (err) {
        console.error('复制失败:', err);
        btn.textContent = '失败';
        setTimeout(() => btn.textContent = '复制', 2000);
    }
}

// 显示文档内容
function displayDocument(doc) {
    const content = document.getElementById('docs-content');

    let html = `
        <div class="document-viewer docs-article">
            <h1>${doc.metadata.title}</h1>
    `;

    // 添加元数据
    html += `
        <div class="search-result-meta" style="margin-bottom: 24px;">
            <span>组件: ${doc.metadata.component || '通用'}</span>
            <span>难度: ${doc.metadata.difficulty}</span>
            <span>分类: ${doc.metadata.category}</span>
            ${doc.metadata.tags.map(tag => `<span>标签: ${tag}</span>`).join('')}
        </div>
    `;

    // 添加目录
    if (doc.sections.length > 1) {
        html += '<div class="toc" style="margin-bottom: 32px;"><h3>目录</h3><ul>';
        doc.sections.forEach(section => {
            html += `<li style="margin: 8px 0;"><a href="#section-${section.id}" style="color: var(--primary-color); text-decoration: none;">${section.title}</a></li>`;
        });
        html += '</ul></div>';
    }

    // 添加章节内容
    doc.sections.forEach(section => {
        html += `
            <section id="section-${section.id}">
                <h${section.level || 2}>${section.title}</h${section.level || 2}>
                <div class="section-content">
                    ${formatContent(section.content)}
                </div>
            </section>
        `;

        // 添加代码示例
        if (section.code_examples && section.code_examples.length > 0) {
            section.code_examples.forEach(example => {
                html += `
                    <pre><code class="language-${example.language || 'python'}">${escapeHtml(example.code)}</code></pre>
                `;
            });
        }
    });

    html += '</div>';
    content.innerHTML = html;

    // 滚动到顶部
    content.scrollTop = 0;
}

// 格式化内容（支持Markdown语法）
function formatContent(content) {
    // 转换换行
    content = content.replace(/\n/g, '<br>');

    // 转换代码块
    content = content.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
        return `<pre><code class="language-${lang || 'python'}">${escapeHtml(code)}</code></pre>`;
    });

    // 转换行内代码
    content = content.replace(/`([^`]+)`/g, '<code>$1</code>');

    return content;
}

// 打开指定索引的组件组
function openComponentGroup(index) {
    const headers = document.querySelectorAll('.component-header');
    if (headers[index]) {
        headers[index].click();
    }
}

// 显示欢迎页面
function showWelcomePage() {
    const content = document.getElementById('docs-content');
    content.innerHTML = `
        <div class="docs-welcome">
            <div style="font-size: 64px; margin-bottom: 24px; opacity: 0.2;">📚</div>
            <h2>XEdu 文档中心</h2>
            <p>XEdu 专为 AI 教育设计，提供从入门到进阶的全套工具链。</p>
            <p style="margin-top: 12px; font-size: 13px; opacity: 0.7;">请在左侧选择组件查看详细 API 文档，或使用上方搜索栏查找内容。</p>
            
            <div style="margin-top: 40px; display: flex; gap: 16px; justify-content: center;">
                <button class="btn btn-primary" data-action="docs.loadDocument" data-action-value="quickstart">快速入门</button>
                <button class="btn btn-secondary" data-action="docs.loadDocument" data-action-value="xedu-introduction">了解更多</button>
            </div>
        </div>
    `;
}

// 显示教程列表
export function showTutorials() {
    const query = '教程';
    document.getElementById('docs-search-input').value = query;
    performSearch();
}

// 按分类筛选
function filterByCategory(category) {
    const query = `category:${category}`;
    document.getElementById('docs-search-input').value = query;
    performSearch();
}

// 按组件筛选
function filterByComponent(component) {
    const query = `component:${component}`;
    document.getElementById('docs-search-input').value = query;
    performSearch();
}

// 显示消息
function showMessage(message, type = 'info') {
    // 这里可以使用 toast 或其他通知方式
    console.log(`[${type}] ${message}`);
}
