---
title: "XEdu快速入门指南"
component: "XEdu"
category: "overview"
tags: ["入门", "新手", "快速开始", "教程"]
difficulty: "beginner"
keywords: ["快速入门", "新手指南", "安装教程", "第一个项目"]
last_updated: "2024-12-04"
---

# XEdu快速入门指南

## 5分钟快速开始

### 第一步：安装XEdu

选择安装需要的组件：

```bash
# 计算机视觉（MMEdu）
pip install MMEdu

# 神经网络（BaseNN）
pip install BaseNN

# 传统机器学习（BaseML）
pip install BaseML

# 数据处理（BaseDT）
pip install BaseDT

# 模型推理（XEduHub）
pip install XEduHub

# 大模型应用（XEduLLM）
pip install XEduLLM

# 模型部署（BaseDeploy）
pip install BaseDeploy
```

### 第二步：运行第一个示例

#### 图像分类示例

```python
from MMEdu import MMClassification as cls

# 1. 初始化模型
model = cls(backbone='LeNet')

# 2. 加载数据集（自动下载MNIST）
model.load_dataset(path='dataset/MNIST')

# 3. 训练模型
model.train(epochs=5)

# 4. 进行预测
result = model.inference(predict='test.jpg')
print(f"预测结果: {result['class']}")
```

#### 目标检测示例

```python
from MMEdu import MMDetection as det

# 1. 初始化YOLO模型
model = det(backbone='YOLO')

# 2. 准备数据
model.load_dataset(
    dataset_type='CocoDataset',
    ann_file='annotations.json',
    img_prefix='images/'
)

# 3. 训练
model.train(epochs=10)

# 4. 检测
results = model.inference(predict='street.jpg')
print(f"检测到 {len(results)} 个对象")
```

### 第三步：探索更多

查看[完整文档](../components)或尝试[实战教程](../tutorials)。

## 核心概念

### XEdu的设计理念

1. **极简主义**：代码最少，功能最全
2. **应用先行**：先用起来，再学原理
3. **统一语法**：所有组件使用一致的API
4. **教育友好**：专为AI教育设计

### 核心组件

| 组件 | 功能 | 适用场景 |
|------|------|----------|
| MMEdu | 计算机视觉 | 图像分类、目标检测 |
| BaseNN | 神经网络 | 自定义神经网络模型 |
| BaseML | 机器学习 | 传统ML算法 |
| BaseDT | 数据处理 | 数据预处理、增强 |
| XEduHub | 模型推理 | 预训练模型应用 |
| XEduLLM | 大模型 | LLM应用开发 |
| BaseDeploy | 模型部署 | 生产环境部署 |

## 安装指南

### 系统要求

- Python 3.7 或更高版本
- Windows / Linux / macOS
- 4GB+ RAM（推荐8GB+）
- GPU（可选，用于加速训练）

### 安装选项

#### 选项1：安装单个组件

```bash
# 只安装需要的组件
pip install MMEdu
pip install XEduHub
```

#### 选项2：使用XEdu全家桶

```bash
# 安装所有核心组件
pip install xedu-all
```

#### 选项3：使用conda环境

```bash
# 创建新环境
conda create -n xedu python=3.8
conda activate xedu

# 安装XEdu
pip install MMEdu BaseNN BaseML XEduHub
```

#### 选项4：从源码安装

```bash
git clone https://github.com/OpenXLab-Edu/XEdu.git
cd XEdu
pip install -e .
```

### 验证安装

```python
# 检查MMEdu
from MMEdu import MMClassification, MMDetection
print("MMEdu安装成功!")

# 检查BaseNN
from BaseNN import BaseNN
print("BaseNN安装成功!")

# 检查XEduHub
from XEduHub import inference
print("XEduHub安装成功!")
```

## 快速项目示例

### 项目1：手写数字识别（5分钟）

```python
from MMEdu import MMClassification as cls
import matplotlib.pyplot as plt

# 初始化模型
model = cls(backbone='LeNet')

# 加载MNIST数据集
model.load_dataset(path='dataset/MNIST')

# 训练模型
print("开始训练...")
history = model.train(epochs=5)

# 绘制训练过程
plt.figure(figsize=(10, 4))
plt.subplot(1, 2, 1)
plt.plot(history['train_loss'], label='Training Loss')
plt.plot(history['val_loss'], label='Validation Loss')
plt.legend()
plt.title('Loss')

plt.subplot(1, 2, 2)
plt.plot(history['train_acc'], label='Training Accuracy')
plt.plot(history['val_acc'], label='Validation Accuracy')
plt.legend()
plt.title('Accuracy')
plt.show()

# 测试模型
accuracy = model.test()
print(f"测试准确率: {accuracy:.2f}%")
```

### 项目2：垃圾分类（10分钟）

```python
from MMEdu import MMClassification as cls
from BaseDT import DataSplitter, Augmentation

# 数据准备
splitter = DataSplitter('garbage_dataset/', train_ratio=0.8, val_ratio=0.2)
splitter.split()

# 数据增强
aug = Augmentation([
    'random_rotation',  # 随机旋转
    'random_flip',      # 随机翻转
    'color_jitter',     # 颜色抖动
    'gaussian_blur'     # 高斯模糊
])

# 初始化模型（使用MobileNetV2）
model = cls(backbone='MobileNetV2')

# 加载数据
model.load_dataset(
    path='garbage_dataset/train',
    augmentation=aug,
    batch_size=32
)

# 训练
model.train(epochs=20)

# 评估
test_acc = model.test(path='garbage_dataset/test')
print(f"垃圾分类准确率: {test_acc:.2f}%")

# 保存模型
model.save('garbage_classifier.pth')
```

### 项目3：实时人脸检测（15分钟）

```python
import cv2
from MMEdu import MMDetection as det

# 初始化YOLO模型
model = det(backbone='YOLO')
model.load_dataset('dataset/COCO/person')
model.train(epochs=10)

# 打开摄像头
cap = cv2.VideoCapture(0)

while True:
    ret, frame = cap.read()
    if not ret:
        break

    # 检测人脸
    results = model.inference(predict=frame)

    # 绘制检测结果
    for result in results:
        if result['class'] == 'person':
            bbox = result['bbox']
            cv2.rectangle(frame,
                         (int(bbox[0]), int(bbox[1])),
                         (int(bbox[2]), int(bbox[3])),
                         (0, 255, 0), 2)

    cv2.imshow('Face Detection', frame)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
```

## 学习路径

### 初学者路径（0基础）

1. **第1周**：了解AI和机器学习基础
   - 阅读[XEdu核心概念](xedu-introduction.md)
   - 完成手写数字识别项目

2. **第2-3周**：学习图像分类
   - 掌握MMEdu基本用法
   - 完成垃圾分类项目

3. **第4周**：学习目标检测
   - 理解YOLO原理
   - 完成简单检测项目

### 进阶路径（有基础）

1. **自定义模型**：使用BaseNN搭建网络
2. **数据处理**：掌握BaseDT数据增强
3. **模型优化**：学习超参数调优
4. **模型部署**：使用BaseDeploy部署应用

### 高级路径（熟悉深度学习）

1. **模型开发**：参与开源项目
2. **算法研究**：探索新算法
3. **系统集成**：构建完整AI应用
4. **教育推广**：分享教学经验

## 常见问题

### Q: 训练时出现CUDA内存不足

```python
# 解决方法1：减小batch_size
model.train(batch_size=16)

# 解决方法2：使用混合精度
model.train(fp16=True)

# 解决方法3：使用更小的模型
model = cls(backbone='MobileNetV2')
```

### Q: 训练速度太慢

```python
# 1. 增加num_workers
model.load_dataset(num_workers=8)

# 2. 使用GPU
model.train(device='cuda')

# 3. 使用预训练模型
model = cls(backbone='ResNet50', pretrained=True)
```

### Q: 模型准确率低

```python
# 1. 增加训练轮数
model.train(epochs=100)

# 2. 调整学习率
model.train(lr=0.001)

# 3. 使用数据增强
from BaseDT import Augmentation
aug = Augmentation(['random_flip', 'random_rotation'])
```

### Q: 如何使用自定义数据集

```python
# 方法1：准备标准格式数据集
dataset/
├── train/
│   ├── class1/
│   │   ├── img1.jpg
│   │   └── img2.jpg
│   └── class2/
│       ├── img3.jpg
│       └── img4.jpg
└── test/
    ├── class1/
    └── class2/

# 方法2：使用COCO格式（用于目标检测）
model.load_dataset(
    dataset_type='CocoDataset',
    ann_file='annotations.json',
    img_prefix='images/'
)
```

## 下一步

1. **深入学习**：
   - [MMEdu完整指南](../components/mmedu.md)
   - [BaseNN使用手册](../components/basenn.md)
   - [XEduHub推理指南](../components/xeduhub.md)

2. **实践项目**：
   - [实战教程集](../tutorials/)
   - [项目案例](../examples/)

3. **社区资源**：
   - [XEdu官网](https://xedu.openxlab.org.cn/)
   - [GitHub仓库](https://github.com/OpenXLab-Edu)
   - [QQ交流群](https://xedu.openxlab.org.cn/community)

## 获取帮助

- 📖 [文档中心](https://xedu.openxlab.org.cn/docs)
- 💬 [论坛讨论](https://forum.xedu.openxlab.org.cn)
- 🐛 [问题反馈](https://github.com/OpenXLab-Edu/XEdu/issues)
- 📧 [邮件支持](support@xedu.openxlab.org.cn)

---

开始你的AI学习之旅吧！XEdu让AI学习变得简单而有趣。