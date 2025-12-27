#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sys
sys.path.append('.')
from datetime import datetime
from models.document import XEduDocument, DocumentMetadata, DocumentSection
from services.document_service import get_document_service

def create_simple_docs():
    """创建简化的文档"""
    doc_service = get_document_service()

    # 创建MMEdu详细文档
    doc = XEduDocument(
        id="mmedu-complete",
        metadata=DocumentMetadata(
            title="MMEdu完整使用指南",
            category="guide",
            tags=["计算机视觉", "OpenMMLab", "图像分类", "目标检测", "教程"],
            difficulty="intermediate",
            component="MMEdu",
            keywords=["MMEdu", "MMClassification", "MMDetection", "计算机视觉"],
            last_updated=datetime.now().isoformat()
        )
    )

    sections = [
        DocumentSection(
            id="introduction",
            title="MMEdu简介",
            level=1,
            content="MMEdu是XEdu的计算机视觉组件，基于OpenMMLab开发。提供从数据准备到模型部署的完整解决方案。"
        ),
        DocumentSection(
            id="installation",
            title="安装指南",
            level=2,
            content="使用pip install MMEdu安装。支持Python 3.7+和PyTorch 1.8+。"
        ),
        DocumentSection(
            id="classification",
            title="图像分类",
            level=2,
            content="支持ResNet、MobileNet、VGG等经典架构。提供预训练模型和自定义训练功能。"
        ),
        DocumentSection(
            id="detection",
            title="目标检测",
            level=2,
            content="支持YOLO、Faster R-CNN、Mask R-CNN等检测器。支持COCO格式数据集。"
        ),
        DocumentSection(
            id="examples",
            title="代码示例",
            level=2,
            content="""
from MMEdu import MMClassification as cls
model = cls(backbone='ResNet50')
model.load_dataset(path='dataset')
model.train(epochs=10)
result = model.inference('test.jpg')
            """
        )
    ]

    doc.sections = sections
    doc_service.index.add_document(doc)

    # 保存索引
    doc_service._save_index()
    print("完成：创建MMEdu完整文档")
    print(f"总文档数：{len(doc_service.index.documents)}")

if __name__ == "__main__":
    create_simple_docs()