import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from sklearn.model_selection import train_test_split

def load_data(file_path='training_data.csv'):
    """
    读取训练数据
    Returns:
        X: 特征数据 (5个特征)
        y: 标签 (站立/深蹲/半蹲)
    """
    # 1. 读取CSV文件
    df = pd.read_csv(file_path, encoding='gbk')
    
    # 2. 准备特征 (X)
    # 使用全部数值特征：排除 image_name, label
    # keypoint_count 都是17，对训练没用，也可以排除
    drop_cols = ['image_name', 'label', 'keypoint_count']
    # 确保只删除存在的列
    cols_to_drop = [c for c in drop_cols if c in df.columns]
    
    X = df.drop(columns=cols_to_drop).values
    
    # 3. 准备标签 (y)
    # 将英文标签转换为中文，方便理解
    label_map = {
        'standing': '站立',
        'squatting': '深蹲',
        'half_squat': '半蹲'
    }
    y = df['label'].map(label_map).values
    
    return X, y

def plot_data_distribution(X, y, title="数据分布"):
    """
    绘制数据分布图
    为了在平面上画图，我们只选取两个最有代表性的特征：
    X轴：左膝角
    Y轴：腿身比
    """
    plt.figure(figsize=(10, 6))
    # 设置中文字体，防止乱码
    plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei', 'Arial Unicode MS'] 
    plt.rcParams['axes.unicode_minus'] = False
    
    # 定义不同动作的颜色
    colors = {'站立': 'blue', '深蹲': 'red', '半蹲': 'green'}
    
    # 遍历每种动作画点
    for label in set(y):
        # 找到属于这个动作的所有数据
        mask = (y == label)
        # X[:, 0]是左膝角，X[:, 4]是腿身比
        plt.scatter(X[mask, 0], X[mask, 4], c=colors.get(label, 'gray'), label=label, alpha=0.6)
    
    plt.xlabel('左膝角 (度)')
    plt.ylabel('腿身比')
    plt.title(title)
    plt.legend()
    plt.grid(True, linestyle='--', alpha=0.7)
    plt.show()

def visualize_results(results):
    """可视化不同层数模型的表现"""
    layers = [r['layers'] for r in results]
    train_scores = [r['train'] for r in results]
    test_scores = [r['test'] for r in results]
    
    plt.figure(figsize=(10, 6))
    plt.plot(layers, train_scores, 'o-', label='训练集成绩', color='blue')
    plt.plot(layers, test_scores, 's-', label='测试集成绩', color='red')
    
    plt.xlabel('模型层数')
    plt.ylabel('准确率')
    plt.title('模型层数 vs 性能表现')
    plt.legend()
    plt.grid(True)
    plt.ylim(0, 1.1)
    
    # 标注数值
    for i, txt in enumerate(test_scores):
        plt.annotate(f'{txt:.1%}', (layers[i], test_scores[i]), 
                    textcoords="offset points", xytext=(0,10), ha='center')
    
    plt.show()

def plot_loss_curve(loss_curve, train_steps=None):
    """绘制训练过程的Loss曲线"""
    plt.figure(figsize=(8, 4))
    plt.plot(loss_curve, color='red', linewidth=2)
    if train_steps:
        plt.title(f"Training Process (Steps={train_steps})")
    else:
        plt.title("Training Process")
    plt.xlabel("Steps (Iterations)")
    plt.ylabel("Loss (Error)")
    plt.grid(True, linestyle='--', alpha=0.5)
    plt.show()
