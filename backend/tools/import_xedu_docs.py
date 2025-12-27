#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
XEdu文档导入工具
将完整的XEdu文档内容导入到文档系统中
"""

import json
import re
from pathlib import Path
from typing import Dict, List, Tuple
from datetime import datetime

# 添加项目根目录到路径
import sys
sys.path.append(str(Path(__file__).parent.parent))

from models.document import (
    XEduDocument, DocumentMetadata, DocumentSection,
    DocumentIndex
)
from services.document_service import DocumentService


class XEduDocParser:
    """XEdu文档解析器"""

    def __init__(self):
        self.doc_service = DocumentService()

    def create_comprehensive_docs(self):
        """创建完整的XEdu文档"""
        print("开始导入完整的XEdu文档...")

        # 1. XEdu概述文档（包含完整内容）
        self._create_xedu_overview_full()

        # 2. MMEdu完整文档
        self._create_mmedu_full()

        # 3. BaseNN完整文档
        self._create_basenn_full()

        # 4. BaseML完整文档
        # self._create_baseml_full()  # TODO: 待实现

        # 5. BaseDT完整文档
        self._create_basedt_full()

        # 6. XEduHub完整文档
        self._create_xeduhub_full()

        # 7. BaseDeploy完整文档
        self._create_basedeploy_full()

        # 8. XEduLLM完整文档
        self._create_xedullm_full()

        # 9. 快速入门文档
        self._create_quickstart_guide()

        # 10. 实战教程集
        self._create_tutorials_full()

        # 保存到文件
        self.doc_service._save_index()
        print(f"\n文档导入完成！共导入了 {len(self.doc_service.index.documents)} 个文档")

    def _create_xedu_overview_full(self):
        """创建完整的XEdu概述文档"""
        doc = XEduDocument(
            id="xedu-overview-full",
            metadata=DocumentMetadata(
                title="XEdu完整指南",
                category="overview",
                tags=["概述", "介绍", "AI教育", "开源"],
                difficulty="beginner",
                component="XEdu",
                keywords=["XEdu", "OpenXLab", "AI教育", "深度学习", "机器学习"],
                last_updated=datetime.now().isoformat(),
                author="OpenXLabEdu团队",
                version="2.0"
            )
        )

        sections = [
            DocumentSection(
                id="intro",
                title="什么是XEdu",
                level=1,
                content="""
XEdu（OpenXLabEdu）是上海人工智能实验室推出的面向AI教育的开源工具集合。它专为中小学AI教育、大学AI通识课和中高职AI入门课程设计，遵循"极简"理念，让AI学习变得简单有趣。

XEdu的核心工具包括MMEdu（计算机视觉库）、BaseNN（神经网络库）、BaseML（传统机器学习库）、BaseDT（数据处理工具）、XEduHub（深度学习推理工具库）等，覆盖了从数据采集、模型训练到模型部署的完整AI学习流程。
                """
            ),
            DocumentSection(
                id="why-xedu",
                title="为什么选择XEdu",
                level=2,
                content="""
当前中小学的AI教育存在以下问题：
1. AI学习工具应该同时具备开发能力，能解决真实问题
2. AI学习工具应该是一个全链路工具，贯穿整个流程
3. AI学习工具应该凸显机器学习，尤其是深度学习

XEdu的定位是面向中小学AI教育的开发和学习工具，让学生能够通过完成各种AI实验，亲历从收集数据到训练深度学习模型的过程，并能够通过训练AI模型、部署智能信息系统的方式，解决生活中的真实问题。
                """
            ),
            DocumentSection(
                id="features",
                title="三大核心特点",
                level=2,
                content="""
### 1. 应用先行，逐层深入
XEdu的核心工具内置SOTA模型，让学生把机器学习、深度学习作为解决问题的有效工具，先应用，再理解，以应用激发兴趣。

### 2. 代码最简，部署方便
XEdu将AI工具分解为"训练"和"部署"两种核心功能。所有工具采用一致的语法完成训练、推理和转换、部署，核心代码公式化。

### 3. 兼容并蓄，灵活扩展
虽然语法上做到最简，但XEdu兼容原生工具的各种功能，如BaseNN和BaseML分别保留了Pytorch和Sklearn的功能。
                """
            ),
            DocumentSection(
                id="components",
                title="核心组件介绍",
                level=2,
                content="""
#### 数据处理工具
**BaseDT**：集成了各种数据处理工具，能快速实现各种模型的预处理、数据集的划分和格式检查。

#### 模型训练工具
- **MMEdu**：计算机视觉开发库，基于OpenMMLab的教育版本
- **BaseNN**：神经网络库，支持搭建各种神经网络模型
- **BaseML**：传统机器学习库，类似Scikit-learn

#### 模型应用与部署工具
- **XEduHub**：深度学习工具库，统一语法支持机器学习和深度学习模型
- **XEduLLM**：大模型应用库，方便应用各种大模型
- **BaseDeploy**：关注模型部署，支持各种开源硬件

#### 无代码工具
**EasyDL系列**：一系列小工具，可以在无代码的情况下完成模型的训练、推理、转换和部署。
                """
            ),
            DocumentSection(
                id="ecosystem",
                title="XEdu生态系统",
                level=2,
                content="""
XEdu已经形成了完整的教育生态系统：

1. **培训交流**：在全国中小学STEAM教育大会、GCCCE等会议上展示
2. **开发历史**：从2022年1月启动，持续迭代更新
3. **社区支持**：拥有丰富的开源课程和教学资源
4. **工具链**：从数据处理到模型部署的全套工具
                """
            ),
            DocumentSection(
                id="getting-started",
                title="快速开始",
                level=2,
                content="""
### 安装XEdu
```bash
# 安装单个组件
pip install MMEdu
pip install BaseNN
pip install BaseML
pip install XEduHub

# 或使用XEdu一键安装包
```

### 基本使用示例
```python
# MMEdu图像分类
from MMEdu import MMClassification as cls
model = cls(backbone='LeNet')
model.load_dataset(path='dataset/MNIST')
model.train(epochs=10)
result = model.inference(predict='test.jpg')
```
                """,
                code_examples=[
                    {
                        "language": "bash",
                        "code": "pip install MMEdu\npip install BaseNN\npip install BaseML"
                    },
                    {
                        "language": "python",
                        "code": "from MMEdu import MMClassification as cls\nmodel = cls(backbone='LeNet')\nmodel.load_dataset(path='dataset/MNIST')\nmodel.train(epochs=10)"
                    }
                ]
            )
        ]

        doc.sections = sections
        self.doc_service.index.add_document(doc)
        print("完成：创建XEdu完整指南")

    def _create_mmedu_full(self):
        """创建完整的MMEdu文档"""
        doc = XEduDocument(
            id="mmedu-full",
            metadata=DocumentMetadata(
                title="MMEdu完整使用指南",
                category="guide",
                tags=["计算机视觉", "图像分类", "目标检测", "OpenMMLab"],
                difficulty="intermediate",
                component="MMEdu",
                keywords=["MMEdu", "OpenMMLab", "图像分类", "目标检测", "实例分割", "语义分割"],
                last_updated=datetime.now().isoformat()
            )
        )

        sections = [
            DocumentSection(
                id="installation",
                title="安装MMEdu",
                level=1,
                content="""
MMEdu是XEdu的计算机视觉组件，基于著名的OpenMMLab开发。

### 安装方式

#### 方式1：使用pip安装
```bash
pip install MMEdu
```

#### 方式2：使用XEdu一键安装包
下载XEdu一键安装包，已内置MMEdu和所有依赖。

#### 方式3：从源码安装
```bash
git clone https://github.com/OpenXLab-Edu/MMEdu.git
cd MMEdu
pip install -e .
```

### 验证安装
```python
from MMEdu import MMClassification
print("MMEdu安装成功！")
```
                """,
                code_examples=[
                    {
                        "language": "bash",
                        "code": "pip install MMEdu"
                    },
                    {
                        "language": "python",
                        "code": "from MMEdu import MMClassification\nprint('MMEdu安装成功！')"
                    }
                ]
            ),
            DocumentSection(
                id="classification",
                title="图像分类（MMClassification）",
                level=1,
                content="""
MMClassification是MMEdu的图像分类模块，支持多种预训练模型和自定义训练。
                """,
                code_examples=[
                    {
                        "language": "python",
                        "code": """
# 图像分类完整示例
from MMEdu import MMClassification as cls

# 1. 初始化模型
model = cls(backbone='LeNet')  # 可选：MobileNet、ResNet、VGG等

# 2. 加载数据集
model.load_dataset(
    path='dataset/MNIST',  # 数据集路径
    batch_size=32,
    num_workers=4
)

# 3. 训练模型
model.train(
    epochs=10,
    lr=0.001,
    save_ckpt=True,
    work_dir='checkpoints'
)

# 4. 评估模型
model.test(
    checkpoint='checkpoints/latest.pth',
    show=True,  # 显示结果
    save_result='results'
)

# 5. 推理预测
result = model.inference(
    predict='test.jpg',
    checkpoint='checkpoints/latest.pth',
    show=True
)
print(f"预测结果: {result}")
                        """
                    }
                ]
            ),
            DocumentSection(
                id="detection",
                title="目标检测（MMDetection）",
                level=1,
                content="""
MMDetection是MMEdu的目标检测模块，支持YOLO、Faster R-CNN、Mask R-CNN等模型。
                """,
                code_examples=[
                    {
                        "language": "python",
                        "code": """
# 目标检测示例
from MMEdu import MMDetection as det

# 1. 初始化模型
model = det(backbone='YOLO')  # 可选：FasterRCNN、MaskRCNN等

# 2. 准备数据（COCO格式）
model.load_dataset(
    dataset_type='CocoDataset',
    ann_file='annotations/instances_train.json',
    img_prefix='images/train/'
)

# 3. 训练模型
model.train(epochs=50, lr=0.002)

# 4. 推理测试
result = model.inference(
    predict='test_image.jpg',
    score_thr=0.5,  # 置信度阈值
    show=True,
    save_result='detection_result.jpg'
)
                        """
                    }
                ]
            ),
            DocumentSection(
                id="models",
                title="支持的模型列表",
                level=2,
                content="""
### 图像分类模型
- **LeNet-5**：经典CNN模型，适合MNIST等简单数据集
- **MobileNet系列**：轻量级模型，适合移动端部署
- **ResNet系列**：深度残差网络，包含ResNet18/34/50/101
- **VGG系列**：视觉几何组网络，包含VGG11/13/16/19
- **ShuffleNet系列**：高效网络结构
- **RegNet系列**：正则化网络
- **RepVGG**：重参数化VGG

### 目标检测模型
- **YOLO系列**：YOLOv3/YOLOv5/YOLOv8等
- **Faster R-CNN**：两阶段检测器
- **Mask R-CNN**：实例分割模型
- **SSD系列**：单阶段检测器

### 使用技巧
1. **数据预处理**：确保图片尺寸符合模型要求
   - LeNet-5: 28x28
   - MobileNet: 224x224
   - ResNet: 224x224

2. **数据增强**：使用BaseDT进行数据预处理
3. **模型选择**：根据任务复杂度和性能需求选择模型
                """
            ),
            DocumentSection(
                id="advanced",
                title="高级功能",
                level=2,
                content="""
### 自定义数据集
```python
# 使用自定义数据集
model.load_dataset(
    dataset_type='CustomDataset',
    img_prefix='path/to/images/',
    ann_file='path/to/annotations.json',
    classes=['class1', 'class2', 'class3']
)
```

### 模型微调
```python
# 加载预训练模型进行微调
model = cls(backbone='ResNet50', pretrained=True)
model.fine_tune(
    new_classes=['new_class1', 'new_class2'],
    freeze_backbone=True  # 冻结骨干网络
)
```

### 模型转换
```python
# 转换为ONNX格式进行部署
model.export(
    checkpoint='checkpoints/latest.pth',
    output_file='model.onnx',
    format='onnx'
)
```
                """,
                code_examples=[
                    {
                        "language": "python",
                        "code": "model.load_dataset(\n    dataset_type='CustomDataset',\n    img_prefix='path/to/images/',\n    ann_file='path/to/annotations.json',\n    classes=['class1', 'class2', 'class3']\n)"
                    }
                ]
            )
        ]

        doc.sections = sections
        self.doc_service.index.add_document(doc)
        print("完成：创建MMEdu完整指南")

    def _create_basenn_full(self):
        """创建完整的BaseNN文档"""
        doc = XEduDocument(
            id="basenn-full",
            metadata=DocumentMetadata(
                title="BaseNN完整使用指南",
                category="guide",
                tags=["神经网络", "深度学习", "PyTorch"],
                difficulty="intermediate",
                component="BaseNN",
                keywords=["BaseNN", "神经网络", "DNN", "CNN", "RNN", "PyTorch"],
                last_updated=datetime.now().isoformat()
            )
        )

        sections = [
            DocumentSection(
                id="introduction",
                title="BaseNN简介",
                level=1,
                content="""
BaseNN是XEdu的神经网络开发库，提供了类似Keras的简洁语法，同时保留了PyTorch的强大功能。它支持搭建各种神经网络结构，从简单的全连接网络到复杂的Transformer模型。

主要特点：
- 类Keras的链式API
- 支持所有PyTorch层和功能
- 简洁的训练和推理接口
- 完整的可视化支持
                """
            ),
            DocumentSection(
                id="quickstart",
                title="快速开始",
                level=1,
                content="""
### 安装
```bash
pip install BaseNN
```

### 基本用法
                """,
                code_examples=[
                    {
                        "language": "python",
                        "code": """
# 基础神经网络示例
from BaseNN import BaseNN, Adam, CrossEntropyLoss
from BaseNN.datasets import MNIST
from BaseNN.metrics import Accuracy

# 1. 创建模型
model = BaseNN()

# 2. 添加网络层
model.add(Dense(128, activation='relu', input_shape=(784,)))
model.add(Dropout(0.2))
model.add(Dense(64, activation='relu'))
model.add(Dropout(0.2))
model.add(Dense(10, activation='softmax'))

# 3. 编译模型
model.compile(
    optimizer=Adam(lr=0.001),
    loss=CrossEntropyLoss(),
    metrics=[Accuracy()]
)

# 4. 准备数据
train_loader, test_loader = MNIST(batch_size=32)

# 5. 训练模型
history = model.fit(
    train_loader,
    epochs=10,
    validation_data=test_loader
)

# 6. 评估模型
test_loss, test_acc = model.evaluate(test_loader)
print(f'测试准确率: {test_acc:.4f}')

# 7. 预测
predictions = model.predict(test_loader)
                        """
                    }
                ]
            ),
            DocumentSection(
                id="layers",
                title="支持的层类型",
                level=2,
                content="""
### 核心层
- **Dense**: 全连接层
- **Dropout**: 随机失活层
- **Flatten**: 展平层
- **Reshape**: 重塑层

### 卷积层
- **Conv2D**: 二维卷积层
- **Conv1D**: 一维卷积层
- **MaxPooling2D**: 二维最大池化
- **AvgPooling2D**: 二维平均池化
- **GlobalMaxPooling2D**: 全局最大池化
- **GlobalAvgPooling2D**: 全局平均池化

### 循环层
- **LSTM**: 长短期记忆网络
- **GRU**: 门控循环单元
- **RNN**: 简单循环神经网络
- **Bidirectional**: 双向包装器

### 高级层
- **BatchNormalization**: 批归一化
- **LayerNormalization**: 层归一化
- **Embedding**: 嵌入层
- **Attention**: 注意力机制
- **Transformer**: Transformer编码器/解码器

### 示例：CNN模型
```python
# 构建CNN模型
model = BaseNN()
model.add(Conv2D(32, (3, 3), activation='relu', input_shape=(28, 28, 1)))
model.add(MaxPooling2D((2, 2)))
model.add(Conv2D(64, (3, 3), activation='relu'))
model.add(MaxPooling2D((2, 2)))
model.add(Flatten())
model.add(Dense(128, activation='relu'))
model.add(Dense(10, activation='softmax'))
```
                """
            ),
            DocumentSection(
                id="advanced_features",
                title="高级功能",
                level=2,
                content="""
### 自定义层
```python
from BaseNN import Layer
import torch

class CustomLayer(Layer):
    def __init__(self, units):
        super().__init__()
        self.units = units

    def build(self, input_shape):
        self.weight = self.add_weight(
            shape=(input_shape[-1], self.units),
            initializer='glorot_uniform'
        )

    def forward(self, inputs):
        return torch.matmul(inputs, self.weight)

# 使用自定义层
model.add(CustomLayer(64))
```

### 模型保存和加载
```python
# 保存模型
model.save('my_model.pth')

# 加载模型
loaded_model = BaseNN.load('my_model.pth')

# 保存权重
model.save_weights('weights.pth')

# 加载权重
model.load_weights('weights.pth')
```

### 模型可视化
```python
# 打印模型结构
model.summary()

# 绘制模型架构
model.plot_model('model_architecture.png')
```
                """
            )
        ]

        doc.sections = sections
        self.doc_service.index.add_document(doc)
        print("完成： 创建BaseNN完整指南")

    def _create_tutorials_full(self):
        """创建完整的实战教程文档"""
        doc = XEduDocument(
            id="tutorials-full",
            metadata=DocumentMetadata(
                title="XEdu实战教程集",
                category="tutorial",
                tags=["教程", "实战", "项目", "案例"],
                difficulty="intermediate",
                component="Tutorial",
                keywords=["实战教程", "项目案例", "深度学习项目", "机器学习项目"],
                last_updated=datetime.now().isoformat()
            )
        )

        sections = [
            DocumentSection(
                id="intro",
                title="教程介绍",
                level=1,
                content="""
本教程集提供了使用XEdu解决实际问题的完整项目案例。每个项目都包含从数据准备到模型部署的完整流程，帮助您深入理解AI技术的实际应用。

### 教程特点
- 完整的项目代码
- 详细的数据说明
- 逐步的实现过程
- 实用的技巧和经验
- 可视化结果展示
                """
            ),
            DocumentSection(
                id="project1",
                title="项目1：手写数字识别",
                level=1,
                content="""
使用MMEdu实现MNIST手写数字识别，这是深度学习的"Hello World"项目。

### 项目目标
- 理解图像分类的基本概念
- 掌握MMEdu的基本使用方法
- 学会评估模型性能

### 实施步骤
1. 数据准备：下载MNIST数据集
2. 模型构建：使用LeNet-5网络
3. 模型训练：设置训练参数并开始训练
4. 结果分析：可视化训练过程和结果

### 代码示例
```python
# 完整的手写数字识别项目
from MMEdu import MMClassification as cls
import matplotlib.pyplot as plt

# 初始化模型
model = cls(backbone='LeNet')

# 加载并预处理数据
model.load_dataset(path='dataset/MNIST')

# 训练模型
history = model.train(epochs=20, lr=0.001)

# 可视化训练过程
plt.figure(figsize=(10, 4))
plt.subplot(1, 2, 1)
plt.plot(history['train_loss'], label='Train Loss')
plt.plot(history['val_loss'], label='Val Loss')
plt.legend()

plt.subplot(1, 2, 2)
plt.plot(history['train_acc'], label='Train Acc')
plt.plot(history['val_acc'], label='Val Acc')
plt.legend()
plt.show()

# 测试模型
test_acc = model.test()
print(f'测试准确率: {test_acc:.4f}')

# 预测单个图片
result = model.inference(predict='test_digit.png')
print(f'预测结果: {result}')
```
                """,
                code_examples=[
                    {
                        "language": "python",
                        "code": "from MMEdu import MMClassification as cls\nmodel = cls(backbone='LeNet')\nmodel.load_dataset(path='dataset/MNIST')\nhistory = model.train(epochs=20, lr=0.001)"
                    }
                ]
            ),
            DocumentSection(
                id="project2",
                title="项目2：图像风格迁移",
                level=1,
                content="""
使用BaseNN实现图像风格迁移，将一张图片的内容与另一张图片的艺术风格结合。

### 项目目标
- 理解神经网络的艺术风格原理
- 实现VGG19特征提取
- 掌握损失函数的设计

### 核心代码
```python
# 风格迁移实现
import torch
from BaseNN import VGG19
from BaseNN.preprocessing import load_image, save_image

# 加载预训练的VGG19
vgg = VGG19(pretrained=True)

# 定义内容损失和风格损失
def content_loss(content_features, target_features):
    return torch.mean((content_features - target_features) ** 2)

def style_loss(style_features, target_features):
    # 计算Gram矩阵
    style_gram = gram_matrix(style_features)
    target_gram = gram_matrix(target_features)
    return torch.mean((style_gram - target_gram) ** 2)

# 优化过程
def style_transfer(content_path, style_path, num_steps=500):
    content_img = load_image(content_path)
    style_img = load_image(style_path)

    # 初始化输入图片
    input_img = content_img.clone().requires_grad_(True)

    optimizer = torch.optim.LBFGS([input_img])

    for step in range(num_steps):
        def closure():
            optimizer.zero_grad()

            # 提取特征
            content_feats = vgg.extract_features(input_img, ['conv4_2'])
            style_feats = vgg.extract_features(style_img, ['conv1_1', 'conv2_1', 'conv3_1', 'conv4_1', 'conv5_1'])
            input_style_feats = vgg.extract_features(input_img, ['conv1_1', 'conv2_1', 'conv3_1', 'conv4_1', 'conv5_1'])

            # 计算损失
            c_loss = content_loss(content_feats['conv4_2'], input_feats['conv4_2'])
            s_loss = sum(style_loss(sf, if_) for sf, if_ in zip(style_feats, input_style_feats))

            total_loss = 0.01 * c_loss + s_loss
            total_loss.backward()

            return total_loss

        optimizer.step(closure)

    return input_img

# 运行风格迁移
output = style_transfer('content.jpg', 'style.jpg')
save_image(output, 'stylized_output.jpg')
```
                """
            ),
            DocumentSection(
                id="project3",
                title="项目3：人脸表情识别",
                level=1,
                content="""
使用MMEdu实现人脸表情识别系统，识别高兴、悲伤、愤怒等基本表情。

### 项目目标
- 掌握人脸检测技术
- 实现多分类任务
- 开发实时表情识别应用

### 实施方案
1. 数据集：使用FER-2013表情数据集
2. 数据增强：使用BaseDT进行数据增强
3. 模型选择：使用MobileNet进行快速推理
4. 部署：使用BaseDeploy部署为Web服务

### 核心实现
```python
# 表情识别系统
from MMEdu import MMClassification as cls
from BaseDT import Augmentation
import cv2
import numpy as np

# 数据增强
aug = Augmentation([
    'random_rotation',  # 随机旋转
    'random_flip',      # 随机翻转
    'random_crop',      # 随机裁剪
    'color_jitter'      # 颜色抖动
])

# 初始化模型
model = cls(backbone='MobileNet', num_classes=7)  # 7种表情

# 准备数据集
train_loader, test_loader = prepare_fer_data(
    path='dataset/FER2013',
    batch_size=32,
    augmentation=aug
)

# 训练模型
model.train(epochs=50, lr=0.001)

# 实时表情识别
def real_time_emotion_detection():
    cap = cv2.VideoCapture(0)
    face_cascade = cv2.CascadeClassifier('haarcascade_frontalface_default.xml')

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        # 检测人脸
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = face_cascade.detectMultiScale(gray, 1.1, 4)

        for (x, y, w, h) in faces:
            # 提取人脸区域
            face = gray[y:y+h, x:x+w]
            face = cv2.resize(face, (48, 48))

            # 预测表情
            emotion = model.inference(face)

            # 绘制结果
            cv2.rectangle(frame, (x, y), (x+w, y+h), (0, 255, 0), 2)
            cv2.putText(frame, emotion, (x, y-10),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 255, 0), 2)

        cv2.imshow('Emotion Detection', frame)

        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()
```
                """
            ),
            DocumentSection(
                id="resources",
                title="学习资源",
                level=2,
                content="""
### 推荐数据集
- **MNIST**：手写数字识别
- **CIFAR-10/CIFAR-100**：物体分类
- **Fashion-MNIST**：服装分类
- **FER-2013**：人脸表情识别
- **ImageNet**：大规模图像分类

### 学习路径
1. **入门阶段**
   - 图像分类基础
   - 简单CNN模型
   - 数据预处理

2. **进阶阶段**
   - 深度CNN架构
   - 迁移学习
   - 模型优化

3. **实战阶段**
   - 完整项目开发
   - 模型部署
   - 性能优化

### 参考资源
- [OpenMMLab文档](https://mmdetection.readthedocs.io/)
- [PyTorch教程](https://pytorch.org/tutorials/)
- [XEdu社区](https://github.com/OpenXLab-Edu)
                """
            )
        ]

        doc.sections = sections
        self.doc_service.index.add_document(doc)
        print("完成： 创建实战教程集")

    def _create_basedt_full(self):
        """创建BaseDT完整文档"""
        doc = XEduDocument(
            id="basedt-full",
            metadata=DocumentMetadata(
                title="BaseDT完整使用指南",
                category="guide",
                tags=["数据处理", "数据预处理", "数据增强"],
                difficulty="beginner",
                component="BaseDT",
                keywords=["BaseDT", "数据预处理", "数据增强", "数据集", "格式转换"],
                last_updated=datetime.now().isoformat()
            )
        )

        sections = [
            DocumentSection(
                id="introduction",
                title="BaseDT简介",
                level=1,
                content="""
BaseDT（Base Data Toolkit）是XEdu的数据处理工具库，集成了常见的数据预处理工具，能够用一行代码完成数据集的预处理、划分和格式转换。

### 主要功能
- **数据加载**：支持常见数据集格式
- **数据预处理**：归一化、标准化、大小调整等
- **数据增强**：旋转、翻转、裁剪、颜色变换等
- **数据划分**：训练集/验证集/测试集划分
- **格式转换**：支持不同格式之间的转换
                """
            ),
            DocumentSection(
                id="installation",
                title="安装",
                level=2,
                content="""
```bash
pip install BaseDT
```
                """
            ),
            DocumentSection(
                id="basic_usage",
                title="基本用法",
                level=2,
                content="""
### 数据预处理示例
```python
from BaseDT import Dataset, Preprocessor

# 加载数据集
dataset = Dataset('path/to/data')

# 数据预处理
processor = Preprocessor([
    ('resize', (224, 224)),  # 调整大小
    ('normalize', 'imagenet'), # 归一化
    ('center_crop', 224),      # 中心裁剪
])

processed_data = processor.fit_transform(dataset)
```

### 数据增强示例
```python
from BaseDT import Augmentation

# 定义增强策略
aug = Augmentation([
    'random_rotation',      # 随机旋转
    'random_flip',          # 随机翻转
    'random_crop',          # 随机裁剪
    'color_jitter',         # 颜色抖动
    'gaussian_blur',        # 高斯模糊
    'random_erase',         # 随机擦除
])

# 应用增强
augmented_data = aug.transform(dataset)
```
                """,
                code_examples=[
                    {
                        "language": "python",
                        "code": "from BaseDT import Dataset, Preprocessor\n\ndataset = Dataset('path/to/data')\nprocessor = Preprocessor([\n    ('resize', (224, 224)),\n    ('normalize', 'imagenet'),\n])\nprocessed_data = processor.fit_transform(dataset)"
                    }
                ]
            )
        ]

        doc.sections = sections
        self.doc_service.index.add_document(doc)
        print("完成： 创建BaseDT完整指南")

    def _create_xeduhub_full(self):
        """创建XEduHub完整文档"""
        doc = XEduDocument(
            id="xeduhub-full",
            metadata=DocumentMetadata(
                title="XEduHub完整使用指南",
                category="guide",
                tags=["推理", "部署", "预训练模型", "模型库"],
                difficulty="beginner",
                component="XEduHub",
                keywords=["XEduHub", "模型推理", "预训练模型", "模型库", "ONNX"],
                last_updated=datetime.now().isoformat()
            )
        )

        sections = [
            DocumentSection(
                id="introduction",
                title="XEduHub简介",
                level=1,
                content="""
XEduHub是XEdu的深度学习推理工具库，提供了统一的接口来使用各种预训练模型。它支持：
- 统一的推理API
- 内置丰富的预训练模型
- 支持多种模型格式（PyTorch、ONNX、TensorRT）
- 自动下载和管理模型
- 高性能推理优化
                """
            ),
            DocumentSection(
                id="quickstart",
                title="快速开始",
                level=1,
                content="""
### 基本使用
```python
from XEduHub import inference

# 图像分类
result = inference(
    image='test.jpg',
    model='resnet18',
    task='classification'
)
print(f"预测类别: {result['class']}, 置信度: {result['score']:.4f}")

# 目标检测
results = inference(
    image='test.jpg',
    model='yolo',
    task='detection'
)
for det in results:
    print(f"检测到: {det['class']}, 位置: {det['bbox']}")
```
                """,
                code_examples=[
                    {
                        "language": "python",
                        "code": "from XEduHub import inference\n\nresult = inference(\n    image='test.jpg',\n    model='resnet18',\n    task='classification'\n)\nprint(f'预测类别: {result[\"class\"]}, 置信度: {result[\"score\"]:.4f}')"
                    }
                ]
            )
        ]

        doc.sections = sections
        self.doc_service.index.add_document(doc)
        print("完成： 创建XEduHub完整指南")

    def _create_basedeploy_full(self):
        """创建BaseDeploy完整文档"""
        doc = XEduDocument(
            id="basedeploy-full",
            metadata=DocumentMetadata(
                title="BaseDeploy完整使用指南",
                category="guide",
                tags=["部署", "ONNX", "移动端", "嵌入式"],
                difficulty="advanced",
                component="BaseDeploy",
                keywords=["BaseDeploy", "模型部署", "ONNX", "TensorRT", "移动端", "嵌入式"],
                last_updated=datetime.now().isoformat()
            )
        )

        sections = [
            DocumentSection(
                id="introduction",
                title="BaseDeploy简介",
                level=1,
                content="""
BaseDeploy是XEdu的模型部署工具，专注于将训练好的模型部署到各种平台和设备上。

### 支持的平台
- Windows/Linux/macOS
- Android/iOS
- 树莓派
- Jetson Nano
- 其他嵌入式设备
                """
            )
        ]

        doc.sections = sections
        self.doc_service.index.add_document(doc)
        print("完成： 创建BaseDeploy完整指南")

    def _create_xedullm_full(self):
        """创建XEduLLM完整文档"""
        doc = XEduDocument(
            id="xedullm-full",
            metadata=DocumentMetadata(
                title="XEduLLM完整使用指南",
                category="guide",
                tags=["大语言模型", "LLM", "GPT", "ChatGPT"],
                difficulty="advanced",
                component="XEduLLM",
                keywords=["XEduLLM", "大语言模型", "LLM", "API调用", "智能体"],
                last_updated=datetime.now().isoformat()
            )
        )

        sections = [
            DocumentSection(
                id="introduction",
                title="XEduLLM简介",
                level=1,
                content="""
XEduLLM是XEdu的大模型应用库，提供了统一的接口来访问各种大语言模型服务。

### 支持的服务商
- OpenAI (GPT系列)
- 智谱AI (GLM系列)
- 月之暗面 (Kimi系列)
- 百度文心一言
- 阿里通义千问
- 其他兼容OpenAI API的服务
                """
            )
        ]

        doc.sections = sections
        self.doc_service.index.add_document(doc)
        print("完成： 创建XEduLLM完整指南")

    def _create_quickstart_guide(self):
        """创建快速入门指南"""
        doc = XEduDocument(
            id="quickstart",
            metadata=DocumentMetadata(
                title="XEdu快速入门指南",
                category="tutorial",
                tags=["入门", "新手", "快速开始"],
                difficulty="beginner",
                component="QuickStart",
                keywords=["快速入门", "新手指南", "安装教程"],
                last_updated=datetime.now().isoformat()
            )
        )

        sections = [
            DocumentSection(
                id="get-started",
                title="5分钟快速开始",
                level=1,
                content="""
### 第一步：安装XEdu
```bash
# 选择安装需要的组件
pip install MMEdu      # 计算机视觉
pip install BaseNN     # 神经网络
pip install BaseML     # 机器学习
pip install XEduHub    # 模型推理
pip install BaseDT     # 数据处理
```

### 第二步：运行第一个示例
```python
# 图像分类示例
from MMEdu import MMClassification as cls

# 加载预训练模型
model = cls(backbone='ResNet18', pretrained=True)

# 进行预测
result = model.inference('test.jpg')
print(f"预测结果: {result}")
```

### 第三步：探索更多
- 查看[完整文档](docs/xedu-overview-full)
- 尝试[实战教程](docs/tutorials-full)
- 加入[社区讨论](https://github.com/OpenXLab-Edu)
                """
            )
        ]

        doc.sections = sections
        self.doc_service.index.add_document(doc)
        print("完成： 创建快速入门指南")

    def import_from_raw_docs(self, raw_doc_path: str):
        """从原始文档导入（预留接口）"""
        # TODO: 实现从markdown或其他格式文档导入
        pass


if __name__ == "__main__":
    parser = XEduDocParser()
    parser.create_comprehensive_docs()