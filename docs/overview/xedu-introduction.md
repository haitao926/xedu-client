---
title: "XEdu核心概念详解"
component: "XEdu"
category: "overview"
tags: ["核心概念", "定位", "特点", "生态系统", "理念"]
difficulty: "beginner"
keywords: ["XEdu", "核心概念", "极简理念", "应用先行", "代码最简", "兼容并蓄"]
last_updated: "2024-12-04"
---

# XEdu核心概念详解

## 什么是XEdu

XEdu（全称OpenXLabEdu）是基于OpenXLab（上海人工智能实验室开源的AI工具集合）的教育版，也是为AI教育设计的一套完整的学习与开发工具，遵照"极简"理念而开发，开箱即用。

### 核心定位

XEdu关注AI模型，关注初学者用AI解决真实问题，适合用于：
- 中小学AI教育
- 大学AI通识课
- 中高职AI入门课程
- AI初学者的各种AI技术领域

### 核心价值

让学生能够通过完成各种AI实验，亲历从收集数据到训练深度学习模型的过程，并能够通过训练AI模型、部署智能信息系统的方式，解决生活中的真实问题。

## XEdu的三大特点

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

## 核心组件概览

### 1. 数据处理工具

**BaseDT（Base Data Toolkit）**：整合了常见数据处理工具
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

## XEdu开发历程

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

## 快速开始

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

## 学习资源

- [XEdu官方网站](https://xedu.openxlab.org.cn/)
- [XEdu GitHub](https://github.com/OpenXLab-Edu)
- [OpenXLab](https://openxlab.org.cn/)
- [AI教材资源](https://xedu.openxlab.org.cn/教材资源)