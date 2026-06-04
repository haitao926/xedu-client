"""
张江图像识别 - 工具函数库
适用于七年级学生的图像识别项目
"""

import cv2
import numpy as np
import matplotlib.pyplot as plt
from PIL import Image
import os

# ==========================================
# 1. 图像加载与显示
# ==========================================

def load_image(path):
    """
    加载图片（支持中文路径）
    
    参数:
        path: 图片路径
    返回:
        numpy数组格式的图片
    """
    if not os.path.exists(path):
        print(f"❌ 错误：找不到图片 {path}")
        return None
    
    img = cv2.imread(path)
    if img is None:
        # 尝试用PIL加载（支持中文路径）
        img = np.array(Image.open(path))
        img = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
    
    print(f"✅ 成功加载图片 (尺寸: {img.shape[1]}x{img.shape[0]})")
    return img

def show(img, title="图片"):
    """
    在Notebook中漂亮地显示图片
    
    参数:
        img: 图片数组
        title: 图片标题
    """
    if img is None:
        print("❌ 图片为空，无法显示")
        return
    
    # OpenCV是BGR，Matplotlib是RGB，需要转换
    if len(img.shape) == 3 and img.shape[2] == 3:
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    else:
        img_rgb = img
    
    plt.figure(figsize=(8, 8))
    plt.imshow(img_rgb, cmap='gray' if len(img.shape) == 2 else None)
    plt.title(title, fontsize=14)
    plt.axis('off')
    plt.show()

def show_grid(images, titles=None, cols=3):
    """
    网格显示多张图片
    
    参数:
        images: 图片列表
        titles: 标题列表
        cols: 每行显示几张
    """
    n = len(images)
    rows = (n + cols - 1) // cols
    
    plt.figure(figsize=(cols * 4, rows * 4))
    for i, img in enumerate(images):
        plt.subplot(rows, cols, i + 1)
        
        if len(img.shape) == 3 and img.shape[2] == 3:
            img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        else:
            img_rgb = img
        
        plt.imshow(img_rgb, cmap='gray' if len(img.shape) == 2 else None)
        if titles and i < len(titles):
            plt.title(titles[i])
        plt.axis('off')
    
    plt.tight_layout()
    plt.show()

# ==========================================
# 2. 图像预处理
# ==========================================

def resize_image(img, size=(28, 28)):
    """
    调整图片大小（标准化）
    
    参数:
        img: 原始图片
        size: 目标尺寸 (宽, 高)
    返回:
        调整后的图片
    """
    resized = cv2.resize(img, size)
    print(f"📐 图片已调整为 {size[0]}x{size[1]}")
    return resized

def to_grayscale(img):
    """
    转换为灰度图
    
    参数:
        img: 彩色图片
    返回:
        灰度图片
    """
    if len(img.shape) == 2:
        print("ℹ️ 图片已经是灰度图")
        return img
    
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    print("🎨 已转换为灰度图")
    return gray

def binarize(img, threshold=127):
    """
    二值化处理（黑白化）
    
    参数:
        img: 灰度图片
        threshold: 阈值（0-255）
    返回:
        二值化图片
    """
    if len(img.shape) == 3:
        img = to_grayscale(img)
    
    _, binary = cv2.threshold(img, threshold, 255, cv2.THRESH_BINARY)
    print(f"⚫⚪ 二值化完成 (阈值: {threshold})")
    return binary

def normalize(img):
    """
    归一化到0-1范围
    
    参数:
        img: 图片数组
    返回:
        归一化后的图片
    """
    normalized = img.astype('float32') / 255.0
    print("📊 图片已归一化到 [0, 1]")
    return normalized

# ==========================================
# 3. 数据增强
# ==========================================

def rotate_image(img, angle):
    """
    旋转图片
    
    参数:
        img: 原始图片
        angle: 旋转角度（正数为逆时针）
    返回:
        旋转后的图片
    """
    h, w = img.shape[:2]
    center = (w // 2, h // 2)
    M = cv2.getRotationMatrix2D(center, angle, 1.0)
    rotated = cv2.warpAffine(img, M, (w, h), 
                             borderMode=cv2.BORDER_CONSTANT, 
                             borderValue=(255, 255, 255))
    return rotated

def add_noise(img, noise_level=0.1):
    """
    添加随机噪声
    
    参数:
        img: 原始图片
        noise_level: 噪声强度 (0-1)
    返回:
        添加噪声后的图片
    """
    noise = np.random.randn(*img.shape) * noise_level * 255
    noisy = np.clip(img + noise, 0, 255).astype(np.uint8)
    return noisy

# ==========================================
# 4. 特征提取
# ==========================================

def get_pixel_value(img, x, y):
    """
    获取指定位置的像素值
    
    参数:
        img: 图片
        x, y: 坐标
    返回:
        像素值（灰度图返回单个值，彩色图返回(B,G,R)）
    """
    if x < 0 or x >= img.shape[1] or y < 0 or y >= img.shape[0]:
        print(f"❌ 坐标 ({x}, {y}) 超出图片范围")
        return None
    
    pixel = img[y, x]
    if len(img.shape) == 2:
        print(f"📍 位置 ({x}, {y}) 的像素值: {pixel}")
    else:
        print(f"📍 位置 ({x}, {y}) 的像素值: B={pixel[0]}, G={pixel[1]}, R={pixel[2]}")
    return pixel

def show_histogram(img):
    """
    显示图片的直方图
    
    参数:
        img: 灰度图片
    """
    if len(img.shape) == 3:
        img = to_grayscale(img)
    
    plt.figure(figsize=(10, 4))
    plt.hist(img.ravel(), bins=256, range=[0, 256], color='blue', alpha=0.7)
    plt.title("像素值分布直方图")
    plt.xlabel("像素值 (0-255)")
    plt.ylabel("像素数量")
    plt.grid(True, alpha=0.3)
    plt.show()

# ==========================================
# 5. 模型相关
# ==========================================

def load_model(model_path):
    """
    加载训练好的模型
    
    参数:
        model_path: 模型文件路径 (.h5)
    返回:
        加载的模型
    """
    try:
        from tensorflow.keras.models import load_model as keras_load
        model = keras_load(model_path)
        print(f"✅ 模型加载成功: {model_path}")
        return model
    except Exception as e:
        print(f"❌ 模型加载失败: {e}")
        return None

def predict_image(model, img, labels):
    """
    使用模型预测图片
    
    参数:
        model: 训练好的模型
        img: 预处理后的图片
        labels: 类别标签列表
    返回:
        (预测类别, 置信度)
    """
    # 确保图片是正确的形状
    if len(img.shape) == 2:
        img = img.reshape(1, 28, 28, 1)
    elif len(img.shape) == 3:
        img = img.reshape(1, 28, 28, img.shape[2])
    
    # 归一化
    if img.max() > 1:
        img = img / 255.0
    
    # 预测
    predictions = model.predict(img, verbose=0)
    class_idx = np.argmax(predictions[0])
    confidence = predictions[0][class_idx]
    
    result = labels[class_idx]
    print(f"🎯 预测结果: {result} (置信度: {confidence:.2%})")
    
    return result, confidence

def show_predictions(predictions, labels):
    """
    可视化预测结果
    
    参数:
        predictions: 预测概率数组
        labels: 类别标签列表
    """
    plt.figure(figsize=(10, 4))
    plt.bar(labels, predictions[0])
    plt.title("各类别预测概率")
    plt.xlabel("建筑类别")
    plt.ylabel("概率")
    plt.ylim([0, 1])
    plt.grid(True, alpha=0.3, axis='y')
    plt.show()

# ==========================================
# 6. 辅助函数
# ==========================================

def print_image_info(img):
    """
    打印图片的详细信息
    
    参数:
        img: 图片数组
    """
    print("=" * 50)
    print("📊 图片信息")
    print("=" * 50)
    print(f"尺寸: {img.shape[1]} x {img.shape[0]}")
    print(f"通道数: {img.shape[2] if len(img.shape) == 3 else 1}")
    print(f"数据类型: {img.dtype}")
    print(f"像素值范围: [{img.min()}, {img.max()}]")
    print(f"平均像素值: {img.mean():.2f}")
    print("=" * 50)
