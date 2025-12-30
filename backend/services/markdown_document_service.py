"""
Markdown文档服务
处理基于Markdown文件的文档加载、解析和索引
"""

import os
import json
import re
import yaml
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime

from models.document import (
    XEduDocument, DocumentMetadata, DocumentSection, DocumentIndex
)
from utils.logger import logger


class MarkdownDocumentService:
    """Markdown文档服务"""

    def __init__(self, docs_dir: str = None):
        if docs_dir is None:
            # 优先使用环境变量
            env_docs_dir = os.environ.get("XEDU_DOCS_DIR")
            if env_docs_dir:
                 self.docs_dir = Path(env_docs_dir)
            else:
                # 默认使用项目根目录下的docs文件夹
                # 开发环境: backend/services/../../docs -> docs
                self.docs_dir = Path(__file__).parent.parent.parent / "docs"
        else:
            self.docs_dir = Path(docs_dir)
        
        # 确保路径存在
        if not self.docs_dir.exists():
            logger.warning(f"文档目录不存在: {self.docs_dir}")
            # 尝试在当前工作目录查找 (假设 cwd 是 backend)
            cwd_docs = Path.cwd().parent / "docs"
            if cwd_docs.exists():
                self.docs_dir = cwd_docs
                logger.info(f"使用后端上级目录下的docs: {self.docs_dir}")
            else:
                 # 再尝试当前目录 (假设 cwd 是 root)
                cwd_root_docs = Path.cwd() / "docs"
                if cwd_root_docs.exists():
                    self.docs_dir = cwd_root_docs
                    logger.info(f"使用当前目录下的docs: {self.docs_dir}")
            
        self.index_file = self.docs_dir / "index.json"
        self.index: Optional[DocumentIndex] = None
        self._load_documents()

    def _load_documents(self):
        """从Markdown文件加载文档"""
        try:
            logger.info(f"开始加载文档，路径: {self.docs_dir.absolute()}")
            # 加载索引文件
            if self.index_file.exists():
                with open(self.index_file, 'r', encoding='utf-8') as f:
                    index_data = json.load(f)

                # 创建文档索引
                self.index = DocumentIndex()

                # 加载每个Markdown文档
                for doc_info in index_data.get('documents', []):
                    doc = self._load_markdown_document(doc_info)
                    if doc:
                        self.index.add_document(doc)
                    else:
                        logger.warning(f"无法加载文档: {doc_info.get('id')} - {doc_info.get('file_path')}")

                # 更新分类和组件信息
                # 转换索引文件中的结构为DocumentIndex期望的结构
                categories_from_index = index_data.get('categories', {})
                self.index.categories = {}

                for cat_key, cat_info in categories_from_index.items():
                    doc_ids = cat_info.get('documents', [])
                    self.index.categories[cat_key] = doc_ids

                components_from_index = index_data.get('components', {})
                self.index.components = {}

                for comp_key, comp_info in components_from_index.items():
                    doc_ids = comp_info.get('documents', [])
                    self.index.components[comp_key] = doc_ids

                logger.info(f"成功加载 {len(self.index.documents)} 个Markdown文档")
                logger.info(f"组件列表: {list(self.index.components.keys())}")
            else:
                logger.warning(f"未找到文档索引文件: {self.index_file}")
                self.index = DocumentIndex()

        except Exception as e:
            logger.error(f"加载Markdown文档失败: {e}")
            self.index = DocumentIndex()

    def _load_markdown_document(self, doc_info: Dict[str, Any]) -> Optional[XEduDocument]:
        """加载单个Markdown文档"""
        try:
            file_path = self.docs_dir / doc_info['file_path']

            if not file_path.exists():
                logger.warning(f"文档文件不存在: {file_path}")
                return None

            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()

            # 解析Front Matter（YAML头部）
            front_matter, markdown_content = self._parse_front_matter(content)

            # 创建文档元数据
            metadata = DocumentMetadata(
                title=front_matter.get('title', doc_info['title']),
                category=front_matter.get('category', doc_info['category']),
                tags=front_matter.get('tags', doc_info.get('tags', [])),
                difficulty=front_matter.get('difficulty', doc_info.get('difficulty', 'beginner')),
                component=front_matter.get('component', doc_info.get('component')),
                keywords=front_matter.get('keywords', doc_info.get('keywords', [])),
                last_updated=front_matter.get('last_updated', doc_info.get('last_updated')),
                author=front_matter.get('author', doc_info.get('author')),
                version=front_matter.get('version', doc_info.get('version'))
            )

            # 解析Markdown内容为章节
            sections = self._parse_markdown_sections(markdown_content)

            # 创建文档对象
            document = XEduDocument(
                id=doc_info['id'],
                metadata=metadata,
                sections=sections,
                file_path=str(file_path)
            )

            return document

        except Exception as e:
            logger.error(f"加载文档失败 {doc_info.get('file_path', 'unknown')}: {e}")
            return None

    def _parse_front_matter(self, content: str) -> Tuple[Dict[str, Any], str]:
        """解析Markdown的Front Matter"""
        try:
            # 兼容 \n / \r\n，并去除可能的 BOM
            normalized = content.lstrip("\ufeff")
            pattern = r"^---\s*[\r\n]+(.*?)^[ \t]*---\s*[\r\n]+"
            match = re.search(pattern, normalized, re.DOTALL | re.MULTILINE)
            if match:
                front_matter_text = match.group(1)
                markdown_content = normalized[match.end():]
                front_matter = yaml.safe_load(front_matter_text) or {}
                return front_matter, markdown_content
        except yaml.YAMLError as e:
            logger.warning(f"解析Front Matter失败: {e}")
        except Exception as e:
            logger.warning(f"解析Front Matter出现异常: {e}")

        return {}, content

    def _parse_markdown_sections(self, content: str) -> List[DocumentSection]:
        """解析Markdown内容为章节结构"""
        sections = []

        # 匹配Markdown标题（# ## ### 等）
        header_pattern = r'^(#{1,6})\s+(.+)$'

        lines = content.split('\n')
        current_section = None
        current_content = []
        section_counter = 0

        for line in lines:
            match = re.match(header_pattern, line)
            if match:
                # 保存上一个章节
                if current_section:
                    current_section.content = '\n'.join(current_content).strip()
                    sections.append(current_section)

                # 创建新章节
                level = len(match.group(1))
                title = match.group(2).strip()
                section_counter += 1

                current_section = DocumentSection(
                    id=f"section_{section_counter}",
                    title=title,
                    content="",
                    level=level
                )
                current_content = []
            else:
                if current_section:
                    current_content.append(line)
                else:
                    # 文档开头的内容（第一个标题之前）
                    if not sections and line.strip():
                        # 创建默认的引言章节
                        current_section = DocumentSection(
                            id="introduction",
                            title="简介",
                            content="",
                            level=1
                        )
                        current_content = [line]

        # 保存最后一个章节
        if current_section:
            current_section.content = '\n'.join(current_content).strip()
            sections.append(current_section)

        return sections

    def search(self, query: str, limit: int = 10) -> List[Dict[str, Any]]:
        """搜索文档"""
        if not self.index:
            return []

        # 解析查询中的标签语法
        category = None
        component = None
        original_query = query

        # 提取 category: 和 component: 标签
        if 'category:' in query:
            category_part = query.split('category:')[1].split()[0]
            category = category_part.strip()
            query = query.replace(f'category:{category_part}', '').strip()

        if 'component:' in query:
            component_part = query.split('component:')[1].split()[0]
            component = component_part.strip()
            query = query.replace(f'component:{component_part}', '').strip()

        # 总是使用带参数的搜索方法
        results = self.index.search(query, category, component, limit)

        return results

    def get_document(self, doc_id: str) -> Optional[XEduDocument]:
        """获取单个文档"""
        if not self.index:
            return None
        return self.index.documents.get(doc_id)

    def get_document_content_for_ai(self, query: str) -> str:
        """获取AI问答相关的文档内容"""
        if not self.index:
            return ""
        return self.index.get_document_for_ai(query)

    def get_categories(self) -> List[Dict[str, Any]]:
        """获取所有分类"""
        if not self.index:
            return []
        return self.index.get_categories()

    def get_components(self) -> List[Dict[str, Any]]:
        """获取所有组件"""
        if not self.index:
            return []
        return self.index.get_components()

    def render_document(self, doc_id: str) -> Optional[str]:
        """渲染Markdown文档为HTML"""
        doc = self.get_document(doc_id)
        if not doc:
            return None

        try:
            import markdown
            from markdown.extensions.codehilite import CodeHiliteExtension
            from markdown.extensions.toc import TocExtension

            # 配置Markdown扩展
            extensions = [
                'fenced_code',
                'tables',
                'toc',
                CodeHiliteExtension(
                    css_class='codehilite',
                    use_pygments=True,
                    pygments_style='default',
                    noclasses=False,
                    linenums=False
                ),
                TocExtension(toc_depth="2-3")
            ]

            # 读取原始Markdown文件
            with open(doc.file_path, 'r', encoding='utf-8') as f:
                content = f.read()

            # 分离Front Matter
            front_matter, markdown_content = self._parse_front_matter(content)

            # 转换为HTML
            html = markdown.markdown(markdown_content, extensions=extensions)

            # 构建HTML片段 (无 html/head/body 标签，CSS已移至前端)
            full_html = f"""
            <div class="markdown-body">
                <h1>{doc.metadata.title}</h1>
                <div class="meta">
                    <p><strong>组件:</strong> {doc.metadata.component or 'N/A'}</p>
                    <p><strong>分类:</strong> {doc.metadata.category}</p>
                    <p><strong>难度:</strong> {doc.metadata.difficulty}</p>
                    <p><strong>标签:</strong> {', '.join(doc.metadata.tags)}</p>
                    <p><strong>最后更新:</strong> {doc.metadata.last_updated or 'N/A'}</p>
                </div>
                <hr>
                {html}
            </div>
            """

            return full_html

        except ImportError:
            logger.warning("未安装markdown库，使用简单渲染")
            # 简单的Markdown到文本转换
            return doc.get_full_text()
        except Exception as e:
            logger.error(f"渲染文档失败: {e}")
            return None

    def get_markdown_content(self, doc_id: str) -> Optional[str]:
        """获取原始Markdown内容"""
        doc = self.get_document(doc_id)
        if not doc:
            return None

        try:
            with open(doc.file_path, 'r', encoding='utf-8') as f:
                return f.read()
        except Exception as e:
            logger.error(f"读取Markdown文件失败: {e}")
            return None

    def reload(self):
        """重新加载所有文档"""
        logger.info("重新加载Markdown文档...")
        self._load_documents()


# 全局实例
_markdown_doc_service: Optional[MarkdownDocumentService] = None


def get_markdown_document_service() -> MarkdownDocumentService:
    """获取Markdown文档服务实例"""
    global _markdown_doc_service
    if _markdown_doc_service is None:
        _markdown_doc_service = MarkdownDocumentService()
    return _markdown_doc_service
