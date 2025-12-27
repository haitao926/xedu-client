"""
文档服务
管理XEdu文档的加载、索引和检索
"""

import json
import re
from pathlib import Path
from typing import Dict, Any, List, Optional
from dataclasses import asdict

from models.document import XEduDocument, DocumentMetadata, DocumentSection, DocumentIndex
from utils.logger import get_logger

logger = get_logger(__name__)


class DocumentService:
    """文档服务"""

    def __init__(self, data_dir: str = None):
        self.data_dir = Path(data_dir or Path(__file__).parent.parent.parent / "data")
        self.docs_dir = self.data_dir / "documents"
        self.index_file = self.data_dir / "document_index.json"

        # 确保目录存在
        self.docs_dir.mkdir(parents=True, exist_ok=True)
        self.data_dir.mkdir(parents=True, exist_ok=True)

        # 文档索引
        self.index = DocumentIndex()

        # 加载或创建索引
        self._load_index()

        # 如果索引为空，加载预置文档
        if not self.index.documents:
            self._load_preset_documents()

    def _load_index(self):
        """加载文档索引"""
        try:
            if self.index_file.exists():
                with open(self.index_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)

                # 重建文档索引
                for doc_id, doc_data in data.get('documents', {}).items():
                    doc = XEduDocument.from_dict(doc_data)
                    self.index.add_document(doc)

                logger.info(f"加载了 {len(self.index.documents)} 个文档")
        except Exception as e:
            logger.error(f"加载文档索引失败: {e}")
            self.index = DocumentIndex()

    def _save_index(self):
        """保存文档索引"""
        try:
            data = {
                'documents': {
                    doc_id: doc.to_dict()
                    for doc_id, doc in self.index.documents.items()
                }
            }

            with open(self.index_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)

            logger.info("文档索引保存成功")
        except Exception as e:
            logger.error(f"保存文档索引失败: {e}")

    def _load_preset_documents(self):
        """加载预置的XEdu文档"""
        logger.info("开始加载预置文档...")

        # 创建预置文档
        self._create_xedu_overview()
        self._create_mmedu_guide()
        self._create_basenn_guide()
        self._create_baseml_guide()
        self._create_xeduhub_guide()
        self._create_tutorials()

        # 保存索引
        self._save_index()

        logger.info(f"预置文档加载完成，共 {len(self.index.documents)} 个文档")

    def _create_xedu_overview(self):
        """创建XEdu概述文档"""
        doc = XEduDocument(
            id="xedu-overview",
            metadata=DocumentMetadata(
                title="XEdu概述",
                category="overview",
                tags=["概述", "介绍", "AI教育"],
                difficulty="beginner",
                component="XEdu",
                keywords=["XEdu", "AI教育", "深度学习", "机器学习", "开源"]
            )
        )

        sections = [
            DocumentSection(
                id="intro",
                title="什么是XEdu",
                content="XEdu（OpenXLabEdu）是上海人工智能实验室推出的面向AI教育的开源工具集合。它专为中小学AI教育、大学AI通识课和中高职AI入门课程设计，遵循'极简'理念，让AI学习变得简单有趣。",
                level=1
            ),
            DocumentSection(
                id="features",
                title="核心特点",
                content="1. 应用先行，逐层深入：内置SOTA模型，先应用再理解原理\n2. 代码最简，部署方便：训练和推理代码公式化\n3. 兼容并蓄，灵活扩展：保留原生工具功能",
                level=2
            ),
            DocumentSection(
                id="components",
                title="核心组件",
                content="• MMEdu：计算机视觉库，基于OpenMMLab\n• BaseNN：神经网络库，支持搭建各种模型\n• BaseML：传统机器学习库，类似Scikit-learn\n• BaseDT：数据处理工具库\n• XEduHub：深度学习推理工具库\n• XEduLLM：大模型应用库\n• BaseDeploy：模型部署库",
                level=2
            )
        ]

        doc.sections = sections
        self.index.add_document(doc)

    def _create_mmedu_guide(self):
        """创建MMEdu指南"""
        doc = XEduDocument(
            id="mmedu-guide",
            metadata=DocumentMetadata(
                title="MMEdu使用指南",
                category="guide",
                tags=["计算机视觉", "图像分类", "目标检测"],
                difficulty="intermediate",
                component="MMEdu",
                keywords=["MMEdu", "OpenMMLab", "图像分类", "目标检测", "计算机视觉"]
            )
        )

        sections = [
            DocumentSection(
                id="installation",
                title="安装MMEdu",
                content="```python\npip install MMEdu\n```\n\n或者使用XEdu一键安装包，已内置MMEdu。",
                level=1,
                code_examples=[
                    {"language": "python", "code": "pip install MMEdu"}
                ]
            ),
            DocumentSection(
                id="quickstart",
                title="快速开始",
                content="```python\n# 导入库\nfrom MMEdu import MMClassification as cls\n\n# 初始化模型\nmodel = cls(backbone='LeNet')\n\n# 加载数据\nmodel.load_dataset(path='dataset/MNIST')\n\n# 训练模型\nmodel.train(epochs=10)\n\n# 评估模型\nmodel.test()\n\n# 推理\nresult = model.inference(predict='test.jpg')\nprint(result)\n```",
                level=2,
                code_examples=[
                    {
                        "language": "python",
                        "code": "from MMEdu import MMClassification as cls\nmodel = cls(backbone='LeNet')\nmodel.load_dataset(path='dataset/MNIST')\nmodel.train(epochs=10)\nmodel.test()\nresult = model.inference(predict='test.jpg')"
                    }
                ]
            ),
            DocumentSection(
                id="models",
                title="支持的模型",
                content="MMEdu支持多种预训练模型：\n• LeNet-5：经典CNN模型\n• MobileNet：轻量级模型\n• ResNet：深度残差网络\n• VGG：视觉几何组网络\n• ShuffleNet：高效网络\n• YOLO系列：目标检测模型",
                level=2
            )
        ]

        doc.sections = sections
        self.index.add_document(doc)

    def _create_basenn_guide(self):
        """创建BaseNN指南"""
        doc = XEduDocument(
            id="basenn-guide",
            metadata=DocumentMetadata(
                title="BaseNN使用指南",
                category="guide",
                tags=["神经网络", "深度学习"],
                difficulty="intermediate",
                component="BaseNN",
                keywords=["BaseNN", "神经网络", "PyTorch", "模型搭建"]
            )
        )

        sections = [
            DocumentSection(
                id="installation",
                title="安装BaseNN",
                content="```python\npip install BaseNN\n```",
                level=1
            ),
            DocumentSection(
                id="basic_usage",
                title="基础用法",
                content="```python\nfrom BaseNN import BaseNN\n\n# 创建模型\nmodel = BaseNN()\n\n# 添加层\nmodel.add Dense(128, activation='relu', input_shape=(784,))\nmodel.add Dense(10, activation='softmax')\n\n# 编译模型\nmodel.compile(optimizer='adam', loss='categorical_crossentropy', metrics=['accuracy'])\n\n# 训练模型\nmodel.fit(X_train, y_train, epochs=10)\n\n# 评估模型\nloss, accuracy = model.evaluate(X_test, y_test)\n```",
                level=2,
                code_examples=[
                    {
                        "language": "python",
                        "code": "from BaseNN import BaseNN\nmodel = BaseNN()\nmodel.add Dense(128, activation='relu', input_shape=(784,))\nmodel.add Dense(10, activation='softmax')\nmodel.compile(optimizer='adam', loss='categorical_crossentropy', metrics=['accuracy'])\nmodel.fit(X_train, y_train, epochs=10)"
                    }
                ]
            )
        ]

        doc.sections = sections
        self.index.add_document(doc)

    def _create_baseml_guide(self):
        """创建BaseML指南"""
        doc = XEduDocument(
            id="baseml-guide",
            metadata=DocumentMetadata(
                title="BaseML使用指南",
                category="guide",
                tags=["机器学习", "传统算法"],
                difficulty="beginner",
                component="BaseML",
                keywords=["BaseML", "机器学习", "Scikit-learn", "分类", "回归"]
            )
        )

        sections = [
            DocumentSection(
                id="introduction",
                title="BaseML介绍",
                content="BaseML是传统机器学习库，提供了与Scikit-learn类似的功能，但使用更简洁的语法。支持分类、回归、聚类等常见机器学习任务。",
                level=1
            ),
            DocumentSection(
                id="example",
                title="使用示例",
                content="```python\nfrom BaseML import BaseML\n\n# 创建分类器\nclf = BaseML(algorithm='svm')\n\n# 训练模型\nclf.fit(X_train, y_train)\n\n# 预测\ny_pred = clf.predict(X_test)\n\n# 评估\naccuracy = clf.score(X_test, y_test)\n```",
                level=2,
                code_examples=[
                    {
                        "language": "python",
                        "code": "from BaseML import BaseML\nclf = BaseML(algorithm='svm')\nclf.fit(X_train, y_train)\ny_pred = clf.predict(X_test)\naccuracy = clf.score(X_test, y_test)"
                    }
                ]
            )
        ]

        doc.sections = sections
        self.index.add_document(doc)

    def _create_xeduhub_guide(self):
        """创建XEduHub指南"""
        doc = XEduDocument(
            id="xeduhub-guide",
            metadata=DocumentMetadata(
                title="XEduHub使用指南",
                category="guide",
                tags=["推理", "部署", "预训练模型"],
                difficulty="beginner",
                component="XEduHub",
                keywords=["XEduHub", "推理", "预训练模型", "模型部署"]
            )
        )

        sections = [
            DocumentSection(
                id="overview",
                title="XEduHub概述",
                content="XEduHub是一个统一的模型推理库，支持使用同一套语法调用不同的预训练模型，包括机器学习和深度学习模型。",
                level=1
            ),
            DocumentSection(
                id="usage",
                title="使用方法",
                content="```python\nfrom XEduHub import inference\n\n# 图像分类\nresult = inference(image='test.jpg', model='resnet18', task='classification')\n\n# 目标检测\nresult = inference(image='test.jpg', model='yolo', task='detection')\n\n# 文本分类\nresult = inference(text='这是测试文本', model='bert', task='text_classification')\n```",
                level=2,
                code_examples=[
                    {
                        "language": "python",
                        "code": "from XEduHub import inference\nresult = inference(image='test.jpg', model='resnet18', task='classification')\nresult = inference(image='test.jpg', model='yolo', task='detection')"
                    }
                ]
            )
        ]

        doc.sections = sections
        self.index.add_document(doc)

    def _create_tutorials(self):
        """创建教程文档"""
        # 图像分类教程
        img_cls_tutorial = XEduDocument(
            id="tutorial-image-classification",
            metadata=DocumentMetadata(
                title="图像分类实战教程",
                category="tutorial",
                tags=["教程", "图像分类", "实战"],
                difficulty="intermediate",
                component="MMEdu",
                keywords=["图像分类", "MNIST", "CIFAR-10", "实战"]
            )
        )

        img_cls_tutorial.sections = [
            DocumentSection(
                id="intro",
                title="教程简介",
                content="本教程将带你使用MMEdu完成一个完整的图像分类项目，从数据准备到模型训练、评估和部署。",
                level=1
            ),
            DocumentSection(
                id="steps",
                title="实施步骤",
                content="1. 准备数据集（MNIST/CIFAR-10）\n2. 使用MMEdu训练模型\n3. 评估模型性能\n4. 使用BaseDeploy部署模型",
                level=2
            )
        ]
        self.index.add_document(img_cls_tutorial)

        # 目标检测教程
        det_tutorial = XEduDocument(
            id="tutorial-object-detection",
            metadata=DocumentMetadata(
                title="目标检测实战教程",
                category="tutorial",
                tags=["教程", "目标检测", "YOLO"],
                difficulty="advanced",
                component="MMEdu",
                keywords=["目标检测", "YOLO", "COCO", "实战"]
            )
        )

        det_tutorial.sections = [
            DocumentSection(
                id="intro",
                title="教程简介",
                content="学习如何使用MMEdu进行目标检测，包括数据标注、模型训练和检测流程。",
                level=1
            )
        ]
        self.index.add_document(det_tutorial)

    def search_documents(self, query: str, category: str = None,
                        component: str = None, limit: int = 10) -> List[Dict[str, Any]]:
        """搜索文档"""
        return self.index.search(query, category, component, limit)

    def get_document(self, doc_id: str) -> Optional[XEduDocument]:
        """获取单个文档"""
        return self.index.documents.get(doc_id)

    def get_document_content_for_ai(self, query: str) -> str:
        """获取用于AI问答的文档内容"""
        return self.index.get_document_for_ai(query)

    def get_categories(self) -> List[Dict[str, Any]]:
        """获取所有分类"""
        return [
            {
                "name": cat,
                "count": len(doc_ids),
                "documents": [
                    {
                        "id": doc_id,
                        "title": self.index.documents[doc_id].metadata.title
                    }
                    for doc_id in doc_ids
                ]
            }
            for cat, doc_ids in self.index.categories.items()
        ]

    def get_components(self) -> List[Dict[str, Any]]:
        """获取所有组件"""
        return [
            {
                "name": comp,
                "count": len(doc_ids),
                "description": self._get_component_description(comp)
            }
            for comp, doc_ids in self.index.components.items()
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

    def update_document(self, doc_id: str, doc: XEduDocument):
        """更新文档"""
        self.index.documents[doc_id] = doc
        self._save_index()

    def delete_document(self, doc_id: str):
        """删除文档"""
        if doc_id in self.index.documents:
            del self.index.documents[doc_id]
            self._save_index()


# 全局文档服务实例
_document_service: Optional[DocumentService] = None


def get_document_service() -> DocumentService:
    """获取全局文档服务实例"""
    global _document_service
    if _document_service is None:
        _document_service = DocumentService()
    return _document_service