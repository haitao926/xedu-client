#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
基于XEdu原始文档创建结构化文档
"""

import sys
import re
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Set

sys.path.append(str(Path(__file__).parent.parent))

from models.document import (
    XEduDocument, DocumentMetadata, DocumentSection
)
from services.document_service import DocumentService


class XEduDocStructurer:
    """XEdu文档结构化处理器"""

    def __init__(self):
        self.doc_service = DocumentService()
        self.doc_index = self.doc_service.index

    def create_tagged_documents(self):
        """创建带标签的结构化文档"""

        # 1. 创建核心概念文档
        self._create_core_concepts()

        # 2. 创建各组件详细文档
        self._create_mmedu_detailed()
        # self._create_basenn_detailed()  # TODO: 待实现
        # self._create_baseml_detailed()  # TODO: 待实现
        # self._create_basedt_detailed()    # TODO: 待实现
        # self._create_xeduhub_detailed()  # TODO: 待实现
        # self._create_basedeploy_detailed() # TODO: 待实现
        # self._create_xedullm_detailed()  # TODO: 待实现

        # 3. 创建教程文档
        # self._create_comprehensive_tutorials()  # TODO: 待实现

        # 4. 创建FAQ和最佳实践
        # self._create_faq_best_practices()  # TODO: 待实现

        # 保存
        self.doc_service._save_index()

        print(f"\n结构化文档创建完成！")
        print(f"总文档数: {len(self.doc_index.documents)}")

        # 打印文档标签统计
        self._print_tag_stats()

    def _print_tag_stats(self):
        """打印标签统计"""
        tag_count = {}
        for doc in self.doc_index.documents.values():
            for tag in doc.metadata.tags:
                tag_count[tag] = tag_count.get(tag, 0) + 1

        print("\n文档标签统计:")
        for tag, count in sorted(tag_count.items()):
            print(f"  {tag}: {count}个文档")

    def _create_core_concepts(self):
        """创建核心概念文档"""
        doc = XEduDocument(
            id="xeedu-core-concepts",
            metadata=DocumentMetadata(
                title="XEdu核心概念详解",
                category="core",
                tags=["核心概念", "定位", "特点", "生态系统", "理念"],
                difficulty="beginner",
                component="XEdu",
                keywords=["XEdu", "核心概念", "极简理念", "应用先行", "代码最简", "兼容并蓄"],
                last_updated=datetime.now().isoformat()
            )
        )

        sections = [
            DocumentSection(
                id="what-is-xedu",
                title="什么是XEdu",
                level=1,
                content="""
XEdu（全称OpenXLabEdu）是基于OpenXLab（上海人工智能实验室开源的AI工具集合）的教育版，也是为AI教育设计的一套完整的学习与开发工具，遵照"极简"理念而开发，开箱即用。

### 核心定位
XEdu关注AI模型，关注初学者用AI解决真实问题，适合用于：
- 中小学AI教育
- 大学AI通识课
- 中高职AI入门课程
- AI初学者的各种AI技术领域

### 核心价值
让学生能够通过完成各种AI实验，亲历从收集数据到训练深度学习模型的过程，并能够通过训练AI模型、部署智能信息系统的方式，解决生活中的真实问题。
                """
            ),
            DocumentSection(
                id="three-features",
                title="XEdu的三大特点",
                level=1,
                content="""
### 1. 应用先行，逐层深入

XEdu的核心工具内置SOTA模型，让学生把机器学习、深度学习作为解决问题的有效工具，先应用，再理解，以应用激发兴趣，吸引学生逐步研究背后的原理。

**就如学习互联网一样：**
- 不需要先讲ISO七层协议
- 更不需要先研究香农公式
- 而是先打开浏览器获取信息、收发邮件
- 再慢慢走向底层协议的理解

### 2. 代码最简，部署方便

XEdu将AI工具分解为"训练"和"部署"两种核心功能。
- 无论是BaseML、BaseNN还是MMEdu，全部采用一致的语法完成训练、推理和转换、部署
- 核心代码公式化，学生可以举一反三，快速迁移
- XEdu的基础工具BaseDT，用一行代码即可完成数据预处理

### 3. 兼容并蓄，灵活扩展

虽然语法上做到最简，但XEdu兼容原生工具的各种功能：
- BaseNN和BaseML分别保留了Pytorch和Sklearn的功能
- MMEdu则保留了OpenMMLab的各种参数
- 尤其是模型训练的所有常见参数，让学生在不同阶段都可以使用
- 在不久的将来，用BaseNN可以搭建MMEdu的模型
                """
            ),
            DocumentSection(
                id="component-overview",
                title="核心组件概览",
                level=1,
                content="""
### 1. 数据处理工具
- **BaseDT（Base Data Toolkit）**：整合了常见数据处理工具
- 用一行代码即可完成各种模型的预处理
- 让AI应用的代码更加简洁

### 2. 模型训练工具

#### 2-1 计算机视觉开发库：MMEdu
- MMEdu全称为OpenMMLabEdu，是著名的计算机视觉开发工具OpenMMLab的教育版本

#### 2-2 神经网络开发库：BaseNN
- BaseNN是神经网络库，能够使用类似Keras的语法搭建神经网络模型
- 不仅可以逐层搭建全连接神经网络，还支持MobileNet、ResNet、RNN、TransFormer等

#### 2-3 传统机器学习开发库：BaseML
- BaseML是传统机器学习库，类似Sklearn
- 使用了与MMEdu同样的语法，代码更加简洁

### 3. 模型应用与部署工具

#### 3-1 深度学习工具库：XEduHub
- XEduHub是一个集合了各种各样深度学习工具的模块
- 云端丰富的开源模型结合本地自主训练模型，可以让用户高效地完成深度学习任务
- 是第一款用统一语法同时支持机器学习模型和深度学习模型的模型推理库

#### 3-2 大模型应用库：XEduLLM
- XEduLLM是一个方便初学者应用各种大模型的模块
- 用统一的语法即可访问不同的大模型服务商
- 用简短的代码实现工作流并开发智能体应用
- 为一线课堂教学做了优化

#### 3-3 模型部署库：BaseDeploy
- BaseDeploy关注模型部署，关注AI模型在各种开源硬件上的部署
- 目前BaseDeploy仅仅实现了模型推理，更多的功能在开发中

### 4. 其他相关工具

#### 4-1 EasyDL系列无代码工具
- 一系列方便初学者的小工具
- 可以在无代码的情况下完成模型的训练、推理、转换和部署
- 甚至可以搭建一个WebAPI服务器，类似百度AI开放平台

### 5. 规划中的库
- **OpenDILabEdu**（决策智能）
- **OpenDataLabEdu**（数据中心）
- 从名称可以看出源自上海人工智能实验室的各种工具
                """
            ),
            DocumentSection(
                id="development-history",
                title="XEdu开发历程",
                level=1,
                content="""
### 培训交流

**2024年重要活动：**
- 8月：在第十二届中小学STEAM教育大会（遵义）上，骨干教师开设半天工作坊，发布四个开源课程
- 6月：全球华人计算机教育大会GCCCE2024会议展示基于浦育平台的AI教育
- 5月：中国教育技术协会主办的全国中小学人工智能教育展示活动，XEdu作为核心基础开发环境
- 1月：启动全国新一代人工智能教师成长营活动，报名人数数千人

### 开发历史

**2024年：**
- 7月：XEduHub发布repo功能，支持第三方社区模型
- 5月：EasyTrain增加对BaseML的支持，实现XEdu所有训练工具的无代码化
- 4月：XEduHub支持大模型和图像风格迁移
- 1月：XEduHub支持自动驾驶工具

**2023年：**
- 9月：启动XEdu-Hub模块编写，发布XEdu-python 0.0.1版
- 8月：启动信息科技版教学版一键安装包制作
- 5月：启动BaseDeploy模块编写
- 1月：在OpenInnoLab上线XEdu专属容器

**2022年：**
- 12月：启动BaseDT模块编写
- 10月：编写Easy系列工具，实现无代码训练和推理
- 9月：在世界人工智能大会正式发布
- 8月：上线MMEdu pip包，整合在OpenInnoLab平台
- 7月：发布MMEdu 0.7版
- 6月：发布MMEdu 0.6版，启动XEdu整体规划，增加BaseNN和BaseML
- 5月：封装MMEdu一键安装包
- 4月：发布MMEdu 0.5版
- 2月：确定MMEdu的语法风格
- 1月：工作启动，组建核心团队

### 媒体关注

2022年，中国信息教育杂志社特约记者吴俊杰博士访谈戴娟和谢作如。
文章链接：《中小学人工智能教育需要怎么样的工具》

### 团队介绍

XEdu团队由上海人工智能实验室智能教育中心实习生为核心，包括：
- 陆雅楠和邱奕盛（核心算法团队）
- 贾彦灏、王博伦（技术研发）
- 谢作如（总负责人）
- 戴娟（技术总监）
                """
            )
        ]

        doc.sections = sections
        self.doc_index.add_document(doc)
        print("完成：创建XEdu核心概念文档")

    def _create_mmedu_detailed(self):
        """创建MMEdu详细文档"""
        doc = XEduDocument(
            id="mmedu-detailed",
            metadata=DocumentMetadata(
                title="MMEdu计算机视觉库完全指南",
                category="component",
                tags=["计算机视觉", "OpenMMLab", "图像分类", "目标检测", "实例分割", "语义分割", "模型训练", "模型部署"],
                difficulty="intermediate",
                component="MMEdu",
                keywords=["MMEdu", "MMClassification", "MMDetection", "MMSegmentation", "预训练模型", "数据集"],
                last_updated=datetime.now().isoformat()
            )
        )

        sections = [
            DocumentSection(
                id="introduction",
                title="MMEdu简介",
                level=1,
                content="""
MMEdu是XEdu的计算机视觉组件，基于著名的OpenMMLab开发的教育版本。它提供了从数据准备、模型训练到模型部署的完整计算机视觉解决方案。

### 为什么选择MMEdu
1. **教育友好**：简化了复杂的OpenMMLab配置，让初学者能够快速上手
2. **功能完整**：支持图像分类、目标检测、实例分割、语义分割等主流任务
3. **性能优秀**：基于SOTA（State-of-the-Art）模型，提供业界领先的性能
4. **易于扩展**：保留OpenMMLab的灵活性，支持高级用户进行定制

### 核心功能
- **MMClassification**：图像分类任务
- **MMDetection**：目标检测和实例分割
- **MMSegmentation**：语义分割
- **MMPose**：姿态估计（规划中）
- **MMAction**：视频理解（规划中）
                """
            ),
            DocumentSection(
                id="installation-setup",
                title="安装与环境配置",
                level=1,
                content="""
### 安装方式

#### 方式1：pip安装（推荐）
```bash
pip install MMEdu
```

#### 方式2：从源码安装
```bash
git clone https://github.com/OpenXLab-Edu/MMEdu.git
cd MMEdu
pip install -e .
```

#### 方式3：使用XEdu一键安装包
下载XEdu一键安装包，已包含所有依赖。

### 环境要求
- Python >= 3.7
- PyTorch >= 1.8
- CUDA >= 10.2（GPU版本）
- OpenCV >= 4.5

### 验证安装
```python
from MMEdu import MMClassification, MMDetection
print("MMEdu安装成功！")
print(f"MMClassification version: {MMClassification.__version__}")
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
                id="mmclassification",
                title="图像分类（MMClassification）",
                level=1,
                content="""
MMClassification是MMEdu的图像分类模块，支持多种经典和先进的神经网络架构。

### 支持的模型架构

#### 经典CNN模型
- **LeNet-5**：最早的CNN之一，适合MNIST等简单任务
- **AlexNet**：2012年ImageNet冠军模型
- **VGG系列**：VGG11, VGG13, VGG16, VGG19

#### 现代CNN模型
- **ResNet系列**：ResNet18, ResNet34, ResNet50, ResNet101
  - 深度残差网络，解决深度网络梯度消失问题
  - 最常用的分类网络架构
- **ResNeXt**：分组卷积版本，进一步提升性能
- **SENet**：Squeeze-and-Excitation网络，注意力机制

#### 轻量级模型
- **MobileNet系列**：MobileNetV2, MobileNetV3
- **ShuffleNet系列**：ShuffleNetV1, ShuffleNetV2
- **EfficientNet**：高效网络，平衡精度和计算成本

### 快速开始示例
```python
from MMEdu import MMClassification as cls

# 1. 初始化模型
model = cls(backbone='ResNet50')  # 可选其他backbone

# 2. 准备数据集
model.load_dataset(
    path='dataset/CIFAR10',  # 数据集路径
    batch_size=32,
    num_workers=4
)

# 3. 训练模型
model.train(
    epochs=100,
    lr=0.001,
    save_ckpt=True,
    work_dir='work_dirs/cifar10'
)

# 4. 评估模型
metrics = model.test(
    checkpoint='work_dirs/cifar10/latest.pth',
    metric=['accuracy', 'precision', 'recall', 'f1_score']
)
print(f"测试准确率: {metrics['accuracy']:.4f}")

# 5. 推理预测
result = model.inference(
    image='test_image.jpg',
    checkpoint='work_dirs/cifar10/latest.pth',
    show=True
)
print(f"预测类别: {result['class']}")
print(f"置信度: {result['score']:.4f}")
```

### 自定义数据集
```python
# 使用自定义数据集
model.load_dataset(
    dataset_type='CustomDataset',
    data_root='path/to/dataset',
    ann_file='annotations/train.json',
    img_prefix='images/train/',
    classes=['cat', 'dog', 'bird'],  # 自定义类别
    pipeline=[
        dict(type='LoadImageFromFile'),
        dict(type='Resize', img_scale=(256, -1)),
        dict(type='CenterCrop', crop_size=224),
        dict(type='Normalize',
             mean=[123.675, 116.28, 103.53],
             std=[58.395, 57.12, 57.375]),
        dict(type='DefaultFormatBundle'),
        dict(type='Collect', keys=['img', 'gt_label']),
        dict(type='PackImgInputs')
    ]
)
```
                """,
                code_examples=[
                    {
                        "language": "python",
                        "code": """from MMEdu import MMClassification as cls\n\nmodel = cls(backbone='ResNet50')\nmodel.load_dataset(path='dataset/CIFAR10')\nmodel.train(epochs=100)\nresult = model.inference(image='test.jpg')"""
                    }
                ]
            ),
            DocumentSection(
                id="mmdetection",
                title="目标检测（MMDetection）",
                level=1,
                content="""
MMDetection是MMEdu的目标检测模块，支持各种单阶段和两阶段检测器。

### 支持的检测器

#### 两阶段检测器
- **Faster R-CNN**：经典的两阶段检测器
- **Mask R-CNN**：实例分割，同时检测和分割
- **Cascade R-CNN**：级联结构，提高精度

#### 单阶段检测器
- **YOLO系列**：YOLOv3, YOLOv5, YOLOv8
  - 实时检测，速度快
  - 适合实时应用场景
- **RetinaNet**：Focal Loss解决样本不平衡
- **FCOS**：无锚框检测器
- **DETR**：基于Transformer的检测器

### 使用示例
```python
from MMEdu import MMDetection as det

# 1. 初始化模型
model = det(backbone='YOLOv8')  # 或 'FasterRCNN', 'RetinaNet'

# 2. 准备数据集（COCO格式）
model.load_dataset(
    dataset_type='CocoDataset',
    ann_file='annotations/instances_train2017.json',
    img_prefix='train2017/',
    classes=['person', 'car', 'bicycle']  # 自定义类别
)

# 3. 训练模型
model.train(
    epochs=12,
    lr=0.002,
    work_dir='work_dirs/yolov8'
)

# 4. 测试模型
results = model.test(
    checkpoint='work_dirs/yolov8/latest.pth',
    eval_metric=['bbox', 'segm']
)

# 5. 推理检测
detections = model.inference(
    image='test_image.jpg',
    checkpoint='work_dirs/yolov8/latest.pth',
    score_thr=0.5,  # 置信度阈值
    device='cuda'
)

# 处理检测结果
for det in detections:
    print(f"检测到: {det['class']}")
    print(f"置信度: {det['score']:.4f}")
    print(f"边界框: {det['bbox']}")

    # 可视化
    if det.get('mask') is not None:
        print(f"分割掩码形状: {det['mask'].shape}")
```

### 自定义配置
```python
# 自定义模型配置
model = det(backbone='CustomRCNN',
            config=dict(
                model=dict(
                    backbone=dict(
                        type='ResNet50',
                        depth=50,
                        num_stages=4,
                        out_indices=(0, 1, 2, 3),
                        frozen_stages=1,
                        norm_cfg=dict(type='BN', requires_grad=False),
                        norm_eval=True,
                        style='pytorch'
                    ),
                    neck=dict(
                        type='FPN',
                        in_channels=[256, 512, 1024, 2048],
                        out_channels=256,
                        num_outs=5
                    ),
                    rpn_head=dict(
                        type='RPNHead',
                        in_channels=256,
                        feat_channels=256,
                        anchor_generator=dict(
                            type='AnchorGenerator',
                            scales=[8],
                            ratios=[0.5, 1.0, 2.0],
                            strides=[4, 8, 16, 32, 64]
                        ),
                        bbox_coder=dict(
                            type='DeltaXYWHBBoxCoder',
                            target_means=[0., 0., 0., 0.],
                            target_stds=[1., 1., 1., 1.]
                        )
                    )
                )
            ))
```
                """,
                code_examples=[
                    {
                        "language": "python",
                        "code": """from MMEdu import MMDetection as det\n\nmodel = det(backbone='YOLOv8')\nmodel.load_dataset(dataset_type='CocoDataset')\ndetections = model.inference(image='test.jpg', score_thr=0.5)"""
                    }
                ]
            ),
            DocumentSection(
                id="advanced-topics",
                title="高级主题",
                level=1,
                content="""
### 迁移学习
```python
# 加载预训练模型进行微调
model = cls(backbone='ResNet50', pretrained=True)

# 冻结部分层进行微调
model.fine_tune(
    num_classes=10,  # 新的类别数
    freeze_backbone=True,  # 冻结骨干网络
    freeze_epochs=5,  # 前5个epoch冻结
    unfreeze_lr=0.0001  # 解冻后的学习率
)
```

### 模型集成
```python
# 测试时集成（TTA）
model.test(
    checkpoint='best.pth',
    average_checkpoints=True,  # 平均多个checkpoint
   tta=True,  # 测试时增强
    eval_metric=['accuracy', 'precision', 'recall']
)
```

### 模型导出
```python
# 导出为ONNX格式
model.export(
    checkpoint='best.pth',
    output_file='model.onnx',
    opset_version=11,
    input_names=['input'],
    output_names=['output'],
    dynamic_axes={'input': {0: 'batch_size'}}
)

# 验证导出的模型
import onnxruntime as ort
ort_session = ort.InferenceSession('model.onnx')
outputs = ort_session.run(None, {'input': input_data})
```

### 性能优化
```python
# 使用混合精度训练
model.train(
    fp16=True,  # 启用半精度训练
    lr=0.001,
    optimizer='AdamW',
    gradient_clip=None
)

# 使用分布式训练
model.train(
    gpu_ids=[0, 1],  # 多GPU训练
    workflow_type='IterBasedRunner',
    workflow_args=dict(max_iters=100000)
)
```
                """
            ),
            DocumentSection(
                id="troubleshooting",
                title="常见问题与解决方案",
                level=2,
                content="""
### 训练相关

**Q: 训练时loss不下降怎么办？**
- 检查学习率是否合适，尝试降低学习率
- 检查数据预处理是否正确
- 检查模型配置是否适合数据集
- 尝试使用预训练权重

**Q: 内存不足（CUDA out of memory）怎么办？**
- 减小batch_size
- 使用gradient_accumulation_steps累积梯度
- 使用混合精度训练（fp16=True）
- 使用更小的模型

**Q: 训练速度很慢怎么办？**
- 增加num_workers
- 使用更快的硬件（GPU）
- 启用自动混合精度
- 使用分布式训练

### 数据相关

**Q: 如何处理不平衡的数据集？**
```python
# 在配置中添加
model.config.dataset_type = 'RepeatDataset'
model.config.times = 10  # 重复少数类10次
# 或者使用Focal Loss
model.config.loss_cls = dict(
    type='FocalLoss',
    use_sigmoid=False,
    gamma=2.0,
    alpha=0.25,
    loss_weight=1.0
)
```

**Q: 如何添加自定义数据增强？**
```python
# 在数据pipeline中添加
pipeline = [
    dict(type='LoadImageFromFile'),
    dict(type='RandomFlip', flip_ratio=0.5),
    dict(type='RandomRotate', degrees=10),
    dict(type='PhotoMetricDistortion'),
    dict(type='Expand', mean=[123.675, 116.28, 103.53], to_rgb=True),
    dict(type='RandomCrop', crop_size=224),
    # ... 其他transform
]
```
                """
            )
        ]

        doc.sections = sections
        self.doc_index.add_document(doc)
        print("完成：创建MMEdu详细文档")

    def _create_tag_system(self):
        """创建标签体系"""
        # 这里可以定义标签的层次结构和关系
        pass

    def _create_comprehensive_tutorials(self):
        """创建综合教程"""
        # 这里创建更详细的教程
        pass


if __name__ == "__main__":
    structurer = XEduDocStructurer()
    structurer.create_tagged_documents()