"""
文档数据模型
管理XEdu文档的结构化数据
"""

from dataclasses import dataclass, field
from typing import Optional, Dict, Any, List
from datetime import datetime
import json


@dataclass
class DocumentMetadata:
    """文档元数据"""
    title: str
    category: str  # 分类：mmedu, basenn, baseml, xedu_hub, tutorial, etc.
    tags: List[str] = field(default_factory=list)
    difficulty: str = "beginner"  # beginner, intermediate, advanced
    component: Optional[str] = None  # 所属组件：MMEdu, BaseNN, etc.
    section: Optional[str] = None  # 章节
    keywords: List[str] = field(default_factory=list)
    last_updated: Optional[str] = None
    author: Optional[str] = None
    version: Optional[str] = None


@dataclass
class DocumentSection:
    """文档章节"""
    id: str
    title: str
    content: str
    level: int = 1  # 1-6, 对应HTML标题级别
    parent_id: Optional[str] = None
    children_ids: List[str] = field(default_factory=list)
    code_examples: List[Dict[str, Any]] = field(default_factory=list)
    images: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "content": self.content,
            "level": self.level,
            "parent_id": self.parent_id,
            "children_ids": self.children_ids,
            "code_examples": self.code_examples,
            "images": self.images
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'DocumentSection':
        return cls(**data)


@dataclass
class XEduDocument:
    """XEdu文档"""
    id: str
    metadata: DocumentMetadata
    sections: List[DocumentSection] = field(default_factory=list)
    toc: List[Dict[str, Any]] = field(default_factory=list)  # 目录结构
    search_index: Dict[str, List[str]] = field(default_factory=dict)  # 搜索索引
    file_path: Optional[str] = None  # Markdown文件路径

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "metadata": {
                "title": self.metadata.title,
                "category": self.metadata.category,
                "tags": self.metadata.tags,
                "difficulty": self.metadata.difficulty,
                "component": self.metadata.component,
                "section": self.metadata.section,
                "keywords": self.metadata.keywords,
                "last_updated": self.metadata.last_updated,
                "author": self.metadata.author,
                "version": self.metadata.version
            },
            "sections": [section.to_dict() for section in self.sections],
            "toc": self.toc,
            "search_index": self.search_index
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'XEduDocument':
        metadata = DocumentMetadata(**data["metadata"])
        sections = [DocumentSection.from_dict(s) for s in data["sections"]]
        return cls(
            id=data["id"],
            metadata=metadata,
            sections=sections,
            toc=data["toc"],
            search_index=data["search_index"]
        )

    def get_full_text(self) -> str:
        """获取文档全文（用于AI检索）"""
        text_parts = [f"# {self.metadata.title}"]
        text_parts.append(f"组件: {self.metadata.component or '通用'}")
        text_parts.append(f"难度: {self.metadata.difficulty}")
        text_parts.append(f"标签: {', '.join(self.metadata.tags)}")
        text_parts.append("\n---\n")

        for section in self.sections:
            text_parts.append(f"\n{'#' * section.level} {section.title}")
            text_parts.append(section.content)

            # 添加代码示例
            for code in section.code_examples:
                text_parts.append(f"\n```{code.get('language', 'python')}")
                text_parts.append(code.get('code', ''))
                text_parts.append("```")

        return "\n".join(text_parts)

    def search(self, query: str, limit: int = 5) -> List[DocumentSection]:
        """搜索文档章节"""
        query = query.lower()
        results = []

        for section in self.sections:
            score = 0

            # 标题匹配权重更高
            if query in section.title.lower():
                score += 10

            # 内容匹配
            if query in section.content.lower():
                score += 5

            # 关键词匹配
            for keyword in self.metadata.keywords:
                if query in keyword.lower():
                    score += 3

            # 标签匹配
            for tag in self.metadata.tags:
                if query in tag.lower():
                    score += 2

            if score > 0:
                results.append((section, score))

        # 按分数排序
        results.sort(key=lambda x: x[1], reverse=True)
        return [r[0] for r in results[:limit]]


@dataclass
class DocumentIndex:
    """文档索引"""
    documents: Dict[str, XEduDocument] = field(default_factory=dict)
    categories: Dict[str, List[str]] = field(default_factory=dict)  # 分类 -> 文档ID列表
    tags: Dict[str, List[str]] = field(default_factory=dict)  # 标签 -> 文档ID列表
    components: Dict[str, List[str]] = field(default_factory=dict)  # 组件 -> 文档ID列表

    def add_document(self, doc: XEduDocument):
        """添加文档到索引"""
        self.documents[doc.id] = doc

        # 更新分类索引
        if doc.metadata.category not in self.categories:
            self.categories[doc.metadata.category] = []
        self.categories[doc.metadata.category].append(doc.id)

        # 更新标签索引
        for tag in doc.metadata.tags:
            if tag not in self.tags:
                self.tags[tag] = []
            self.tags[tag].append(doc.id)

        # 更新组件索引
        if doc.metadata.component:
            if doc.metadata.component not in self.components:
                self.components[doc.metadata.component] = []
            self.components[doc.metadata.component].append(doc.id)

    def search(self, query: str, category: Optional[str] = None,
               component: Optional[str] = None, limit: int = 10) -> List[Dict[str, Any]]:
        """全局搜索"""
        results = []

        # 筛选文档
        doc_ids = set(self.documents.keys())

        if category:
            doc_ids = doc_ids.intersection(set(self.categories.get(category, [])))

        if component:
            doc_ids = doc_ids.intersection(set(self.components.get(component, [])))

        # 搜索匹配的文档和章节
        for doc_id in doc_ids:
            doc = self.documents[doc_id]
            sections = doc.search(query)

            for section in sections:
                results.append({
                    "document_id": doc_id,
                    "document_title": doc.metadata.title,
                    "section_id": section.id,
                    "section_title": section.title,
                    "content": section.content[:200] + "...",  # 摘要
                    "category": doc.metadata.category,
                    "component": doc.metadata.component,
                    "difficulty": doc.metadata.difficulty
                })

        return results[:limit]

    def get_document_for_ai(self, query: str) -> str:
        """获取AI问答相关的文档内容（基于标签的两阶段搜索）"""
        # 第一阶段：基于关键词快速定位相关标签和组件
        keywords = query.lower()
        relevant_components = []
        relevant_categories = []
        relevant_tags = []

        # 检查是否提到了特定组件
        component_mapping = {
            'mmedu': 'MMEdu',
            'basenn': 'BaseNN',
            'baseml': 'BaseML',
            'basedt': 'BaseDT',
            'xeduhub': 'XEduHub',
            'xedullm': 'XEduLLM',
            'basedeploy': 'BaseDeploy',
            'easydl': 'EasyDL',
            'xeudoc': 'XEdu'
        }

        for key, comp in component_mapping.items():
            if key in keywords:
                relevant_components.append(comp)
                relevant_tags.append(comp)

        # 检查是否提到了特定分类
        if any(word in keywords for word in ['教程', '入门', '新手', '快速', '开始', '快速开始']):
            relevant_categories.extend(['tutorial', 'overview'])
        if any(word in keywords for word in ['使用', '指南', '文档', '说明', '完整', '详细']):
            relevant_categories.extend(['guide', 'overview'])
        if any(word in keywords for word in ['核心', '概念', '原理', '基础', '介绍', '是什么']):
            relevant_categories.extend(['core', 'overview'])
        if any(word in keywords for word in ['项目', '实战', '案例', '示例', '例子']):
            relevant_categories.append('tutorial')
        if any(word in keywords for word in ['分类', '检测', '分割', '计算机视觉', '图像']):
            relevant_categories.append('guide')

        # 第二阶段：基于标签筛选文档后再进行内容搜索
        candidate_docs = []

        # 1. 首先添加完全匹配组件的文档（最高优先级）
        for comp in relevant_components:
            comp_docs = [doc for doc in self.documents.values()
                        if doc.metadata.component == comp]
            candidate_docs.extend(comp_docs)

        # 2. 添加匹配分类的文档
        for cat in relevant_categories:
            cat_docs = [doc for doc in self.documents.values()
                       if doc.metadata.category == cat]
            candidate_docs.extend(cat_docs)

        # 3. 添加匹配标签的文档
        for tag in relevant_tags:
            tag_docs = [doc for doc in self.documents.values()
                       if tag in doc.metadata.tags]
            candidate_docs.extend(tag_docs)

        # 4. 如果没有筛选到文档，则使用全部文档
        if not candidate_docs:
            candidate_docs = list(self.documents.values())

        # 去重并计算内容相关性分数
        unique_docs = {}
        for doc in candidate_docs:
            if doc.id not in unique_docs:
                # 计算内容相关性分数
                content_score = self._calculate_content_relevance(doc, query)

                # 计算标签匹配分数
                tag_score = 0
                if doc.metadata.component in relevant_components:
                    tag_score += 10
                if doc.metadata.category in relevant_categories:
                    tag_score += 5
                for tag in doc.metadata.tags:
                    if tag in relevant_tags:
                        tag_score += 3

                # 综合分数
                total_score = content_score + tag_score
                unique_docs[doc.id] = (doc, total_score)

        # 按相关性排序
        sorted_docs = sorted(unique_docs.values(),
                           key=lambda x: x[1],
                           reverse=True)

        # 取前5个最相关的文档
        top_docs = [doc for doc, _ in sorted_docs[:5]]

        if not top_docs:
            return ""

        # 构建上下文
        context_parts = []
        context_parts.append("以下是XEdu相关的文档内容：\n")

        for doc in top_docs:
            context_parts.append(f"\n## {doc.metadata.title}")
            context_parts.append(f"组件: {doc.metadata.component}")
            context_parts.append(f"分类: {doc.metadata.category}")
            context_parts.append(f"标签: {', '.join(doc.metadata.tags[:5])}")

            # 添加最相关的章节内容而不是全文
            relevant_sections = []
            for section in doc.sections:
                # 计算章节相关性
                section_relevance = self._calculate_section_relevance(section, query)
                if section_relevance > 0.1:  # 只包含相关章节
                    relevant_sections.append((section_relevance, section))

            # 按相关性排序章节并只取前3个
            relevant_sections.sort(key=lambda x: x[0], reverse=True)

            for _, section in relevant_sections[:3]:
                context_parts.append(f"\n### {section.title}")
                # 限制章节内容长度
                content = section.content[:800] + "..." if len(section.content) > 800 else section.content
                context_parts.append(content)

        return "\n".join(context_parts)

    def _calculate_content_relevance(self, doc: XEduDocument, question: str) -> float:
        """计算文档内容与问题的相关性分数"""
        score = 0.0
        question_lower = question.lower()

        # 标题匹配
        if any(word in doc.metadata.title.lower() for word in question_lower.split()):
            score += 5.0

        # 关键词匹配
        for keyword in doc.metadata.keywords:
            if keyword.lower() in question_lower:
                score += 3.0

        # 内容匹配
        all_content = " ".join([section.content.lower() for section in doc.sections])
        for word in question_lower.split():
            if word in all_content:
                score += 1.0

        return score

    def _calculate_section_relevance(self, section: DocumentSection, question: str) -> float:
        """计算章节与问题的相关性分数"""
        score = 0.0
        question_lower = question.lower()

        # 标题匹配权重更高
        for word in question_lower.split():
            if word in section.title.lower():
                score += 2.0

        # 内容匹配
        for word in question_lower.split():
            if word in section.content.lower():
                score += 1.0

        # 章节级别越高（数字越小），权重可能越高
        score += (5 - section.level) * 0.1

        return score

    def _calculate_relevance(self, query: str, doc: XEduDocument) -> float:
        """计算文档与查询的相关度"""
        query = query.lower()
        score = 0.0

        # 标题匹配
        if any(word in doc.metadata.title.lower() for word in query.split()):
            score += 0.5

        # 关键词匹配
        for keyword in doc.metadata.keywords:
            if keyword.lower() in query:
                score += 0.3

        # 标签匹配
        for tag in doc.metadata.tags:
            if tag.lower() in query:
                score += 0.2

        # 内容匹配（检查是否有章节包含查询词）
        for section in doc.sections:
            if query in section.content.lower():
                score += 0.1
                break

        return score

    def get_categories(self) -> List[Dict[str, Any]]:
        """获取所有分类"""
        return [
            {
                "name": cat,
                "count": len(doc_ids),
                "documents": [
                    {
                        "id": doc_id,
                        "title": self.documents[doc_id].metadata.title
                    }
                    for doc_id in doc_ids
                ]
            }
            for cat, doc_ids in self.categories.items()
        ]

    def get_components(self) -> List[Dict[str, Any]]:
        """获取所有组件"""
        return [
            {
                "name": comp,
                "count": len(doc_ids),
                "description": self._get_component_description(comp),
                "documents": [
                    {
                        "id": doc_id,
                        "title": self.documents[doc_id].metadata.title
                    }
                    for doc_id in doc_ids
                ]
            }
            for comp, doc_ids in self.components.items()
        ]

    def _get_component_description(self, component: str) -> str:
        """获取组件描述"""
        descriptions = {
            "MMEdu": "计算机视觉库，基于OpenMMLab的教育版本",
            "BaseNN": "神经网络库，支持搭建各种神经网络模型",
            "BaseML": "传统机器学习库，类似Scikit-learn",
            "BaseDT": "数据处理工具库",
            "XEduHub": "深度学习推理工具库",
            "XEduLLM": "大模型应用库",
            "BaseDeploy": "模型部署库",
            "XEdu": "XEdu整体框架"
        }
        return descriptions.get(component, "未知组件")