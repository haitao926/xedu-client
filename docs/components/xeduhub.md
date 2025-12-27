---
title: "XEduHub完整使用指南"
component: "XEduHub"
category: "guide"
tags: ["推理", "部署", "预训练模型", "模型库"]
difficulty: "beginner"
keywords: ["XEduHub", "模型推理", "预训练模型", "模型库", "ONNX"]
last_updated: "2024-12-04"
---

# XEduHub完整使用指南

## 简介

XEduHub是XEdu的深度学习推理工具库，提供了统一的接口来使用各种预训练模型。它支持：
- 统一的推理API
- 内置丰富的预训练模型
- 支持多种模型格式（PyTorch、ONNX、TensorRT）
- 自动下载和管理模型
- 高性能推理优化

## 安装

```bash
pip install XEduHub
```

## 快速开始

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

## 支持的任务类型

### 1. 图像分类

```python
from XEduHub import Hub

# 初始化Hub
hub = Hub()

# 加载分类模型
model = hub.load_model('resnet50', task='classification')

# 批量推理
results = model.inference_batch([
    'image1.jpg',
    'image2.jpg',
    'image3.jpg'
])

# 使用不同的分类模型
models = [
    'resnet18', 'resnet34', 'resnet50', 'resnet101',
    'mobilenetv2', 'mobilenetv3',
    'efficientnet_b0', 'efficientnet_b1',
    'vgg16', 'vgg19',
    'densenet121', 'densenet169'
]

for model_name in models:
    model = hub.load_model(model_name, task='classification')
    result = model.inference('test.jpg')
    print(f"{model_name}: {result['class']} ({result['score']:.4f})")
```

### 2. 目标检测

```python
from XEduHub import Hub

hub = Hub()

# 加载YOLO模型
yolo = hub.load_model('yolov8n', task='detection')
results = yolo.inference('test.jpg')

# 可视化检测结果
yolo.visualize(results, 'test.jpg', output='detection_result.jpg')

# 使用不同的检测器
detectors = ['yolov8n', 'yolov8s', 'yolov8m', 'yolov8l', 'yolov8x']
for detector in detectors:
    model = hub.load_model(detector, task='detection')
    results = model.inference('test.jpg')
    print(f"{detector}: 检测到 {len(results)} 个对象")
```

### 3. 语义分割

```python
from XEduHub import Hub

hub = Hub()

# 加载分割模型
seg_model = hub.load_model('deeplabv3', task='segmentation')
mask = seg_model.inference('test.jpg')

# 保存分割结果
seg_model.save_mask(mask, 'segmentation_result.png')

# 获取分割类别
categories = seg_model.get_categories()
print("支持的类别:", categories)
```

### 4. 人脸检测与分析

```python
from XEduHub import Hub

hub = Hub()

# 人脸检测
face_detector = hub.load_model('retinaface', task='face_detection')
faces = face_detector.inference('group_photo.jpg')

# 人脸识别
face_recognizer = hub.load_model('arcface', task='face_recognition')
features = face_recognizer.extract_features(faces)

# 人脸属性分析
face_analyzer = hub.load_model('fairface', task='face_analysis')
attributes = face_analyzer.inference('face.jpg')
print(f"性别: {attributes['gender']}, 年龄: {attributes['age']}, 种族: {attributes['race']}")
```

## 模型管理

### 查看可用模型

```python
from XEduHub import Hub

hub = Hub()

# 查看所有可用模型
all_models = hub.list_models()
print("所有可用模型:")
for task, models in all_models.items():
    print(f"\n{task}:")
    for model in models:
        print(f"  - {model['name']}: {model['description']}")

# 按任务筛选
classification_models = hub.list_models(task='classification')
detection_models = hub.list_models(task='detection')
```

### 下载模型

```python
# 手动下载模型
hub.download_model('resnet50')

# 下载到指定目录
hub.download_model('yolov8n', cache_dir='./models')

# 批量下载
models_to_download = ['resnet50', 'mobilenetv2', 'efficientnet_b0']
for model in models_to_download:
    hub.download_model(model)
```

### 模型信息

```python
# 获取模型详细信息
model_info = hub.get_model_info('resnet50')
print(f"模型大小: {model_info['size']}")
print(f"输入尺寸: {model_info['input_size']}")
print(f"类别数: {model_info['num_classes']}")
print(f"准确率: {model_info['top1_accuracy']}")
```

## 高级功能

### 1. 自定义模型

```python
from XEduHub import Hub

hub = Hub()

# 注册自定义模型
hub.register_model(
    name='my_custom_model',
    task='classification',
    model_path='./models/custom_model.pth',
    config_path='./models/config.json',
    preprocessing={
        'resize': (224, 224),
        'normalize': {
            'mean': [0.485, 0.456, 0.406],
            'std': [0.229, 0.224, 0.225]
        }
    }
)

# 使用自定义模型
model = hub.load_model('my_custom_model')
result = model.inference('test.jpg')
```

### 2. 模型集成

```python
from XEduHub import Ensemble

# 创建模型集成
ensemble = Ensemble([
    ('resnet50', 0.4),
    ('mobilenetv2', 0.3),
    ('efficientnet_b0', 0.3)
], task='classification')

# 集成推理
result = ensemble.inference('test.jpg')
print(f"集成结果: {result['class']} (置信度: {result['score']:.4f})")
```

### 3. 性能优化

```python
# 使用TensorRT加速（需要GPU）
model = hub.load_model('yolov8n', task='detection', engine='tensorrt')

# 使用ONNX Runtime
model = hub.load_model('resnet50', task='classification', engine='onnx')

# 批量推理优化
model.set_batch_size(32)
results = model.inference_batch(image_list)

# 异步推理
import asyncio

async def async_inference():
    model = hub.load_model('resnet50', task='classification')
    tasks = [model.inference_async(img) for img in image_list]
    results = await asyncio.gather(*tasks)
    return results
```

### 4. 模型转换

```python
# PyTorch转ONNX
hub.convert_model(
    'resnet50',
    output_format='onnx',
    output_path='resnet50.onnx'
)

# ONNX转TensorRT
hub.convert_model(
    'yolov8n',
    output_format='tensorrt',
    output_path='yolov8n.trt'
)
```

## 实际应用示例

### 1. 批量图像处理

```python
import os
from pathlib import Path
from XEduHub import Hub

def process_image_folder(input_dir, output_dir, model_name='resnet50'):
    hub = Hub()
    model = hub.load_model(model_name, task='classification')

    input_path = Path(input_dir)
    output_path = Path(output_dir)
    output_path.mkdir(exist_ok=True)

    results = []
    for image_file in input_path.glob('*.jpg'):
        result = model.inference(str(image_file))
        results.append({
            'image': image_file.name,
            'class': result['class'],
            'score': result['score']
        })

        # 可视化
        model.visualize(result, str(image_file),
                      output=str(output_path / f"vis_{image_file.name}"))

    return results

# 使用示例
results = process_image_folder('input_images', 'output_images')
print(f"处理了 {len(results)} 张图片")
```

### 2. 视频流实时检测

```python
import cv2
from XEduHub import Hub

# 初始化
hub = Hub()
model = hub.load_model('yolov8n', task='detection')

# 打开摄像头
cap = cv2.VideoCapture(0)

while True:
    ret, frame = cap.read()
    if not ret:
        break

    # 检测
    results = model.inference(frame)

    # 绘制结果
    for det in results:
        bbox = det['bbox']
        label = det['class']
        score = det['score']

        cv2.rectangle(frame,
                     (int(bbox[0]), int(bbox[1])),
                     (int(bbox[2]), int(bbox[3])),
                     (0, 255, 0), 2)
        cv2.putText(frame, f"{label}: {score:.2f}",
                    (int(bbox[0]), int(bbox[1]-10)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)

    cv2.imshow('Real-time Detection', frame)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
```

### 3. API服务封装

```python
from flask import Flask, request, jsonify
from XEduHub import Hub
import base64
import io
from PIL import Image

app = Flask(__name__)
hub = Hub()

@app.route('/api/classify', methods=['POST'])
def classify_image():
    data = request.json
    image_data = base64.b64decode(data['image'])
    image = Image.open(io.BytesIO(image_data))

    model_name = data.get('model', 'resnet50')
    model = hub.load_model(model_name, task='classification')

    result = model.inference(image)

    return jsonify({
        'success': True,
        'class': result['class'],
        'score': result['score'],
        'model': model_name
    })

@app.route('/api/detect', methods=['POST'])
def detect_objects():
    data = request.json
    image_data = base64.b64decode(data['image'])
    image = Image.open(io.BytesIO(image_data))

    model = hub.load_model('yolov8n', task='detection')
    results = model.inference(image)

    return jsonify({
        'success': True,
        'detections': results,
        'count': len(results)
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
```

## 性能基准

| 模型 | 任务 | 推理时间(CPU) | 推理时间(GPU) | 模型大小 | Top-1准确率 |
|------|------|---------------|---------------|----------|-------------|
| ResNet50 | 分类 | 12ms | 2ms | 98MB | 76.15% |
| MobileNetV2 | 分类 | 5ms | 1ms | 14MB | 71.80% |
| YOLOv8n | 检测 | 35ms | 5ms | 6MB | 37.3 AP |
| YOLOv8x | 检测 | 200ms | 15ms | 68MB | 53.9 AP |

## 最佳实践

1. **选择合适的模型**:
   - 移动端: 使用MobileNet、EfficientNet
   - 高精度: 使用ResNet、DenseNet
   - 实时检测: 使用YOLOv8n/s
   - 高精度检测: 使用YOLOv8x

2. **预处理优化**:
   - 统一输入尺寸
   - 使用合适的归一化
   - 批量处理提高效率

3. **后处理**:
   - 设置合理的置信度阈值
   - 使用NMS去除重复检测
   - 可视化结果便于调试

4. **部署建议**:
   - 生产环境使用ONNX或TensorRT
   - GPU部署使用TensorRT加速
   - CPU部署使用ONNX Runtime

## 常见问题

### Q: 模型下载失败怎么办？

```python
# 设置镜像源
hub.set_mirror('https://mirror.xedu.org.cn/models')

# 或使用本地模型
hub.add_local_model_path('./local_models')
```

### Q: 如何提高推理速度？

```python
# 1. 使用更小的模型
model = hub.load_model('mobilenetv2', task='classification')

# 2. 减少输入尺寸
model.set_input_size((224, 224))

# 3. 启用优化
model.optimize_for_inference()

# 4. 使用批处理
results = model.inference_batch(images)
```

### Q: 如何添加新的模型？

```python
# 1. 准备模型文件
model_path = './my_model.pth'
config_path = './my_model.json'

# 2. 创建模型配置
config = {
    'architecture': 'resnet',
    'num_classes': 1000,
    'input_size': [224, 224],
    'preprocessing': {
        'normalize': True,
        'mean': [0.485, 0.456, 0.406],
        'std': [0.229, 0.224, 0.225]
    }
}

# 3. 注册模型
hub.register_model(
    name='my_resnet',
    task='classification',
    model_path=model_path,
    config=config
)
```

## 参考资料

- [XEduHub官方文档](https://xedu.openxlab.org.cn/docs/xeduhub)
- [模型库列表](https://xedu.openxlab.org.cn/models)
- [性能优化指南](https://xedu.openxlab.org.cn/performance)