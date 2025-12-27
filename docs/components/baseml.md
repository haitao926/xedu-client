---
title: "BaseML完整使用指南"
component: "BaseML"
category: "guide"
tags: ["机器学习", "传统算法", "Scikit-learn", "数据挖掘"]
difficulty: "intermediate"
keywords: ["BaseML", "机器学习", "分类", "回归", "聚类", "特征工程"]
last_updated: "2024-12-04"
---

# BaseML完整使用指南

## 简介

BaseML是XEdu的传统机器学习库，提供了类似Scikit-learn的简洁API，专门为教育场景优化。它涵盖了机器学习的核心任务：分类、回归、聚类和特征工程。

主要特点：
- 统一的API设计
- 丰富的算法实现
- 可视化支持
- 教育友好的错误提示
- 详细的算法解释

## 安装

```bash
pip install BaseML
```

## 快速开始

### 基础示例

```python
from BaseML import classifiers, regressors, clusterers
from BaseML.datasets import load_iris, load_boston
from BaseML.metrics import accuracy_score, mean_squared_error

# 分类任务
X, y = load_iris()
clf = classifiers.DecisionTreeClassifier(max_depth=3)
clf.fit(X, y)
predictions = clf.predict(X)
print(f"准确率: {accuracy_score(y, predictions):.4f}")

# 回归任务
X, y = load_boston()
reg = regressors.LinearRegression()
reg.fit(X, y)
predictions = reg.predict(X)
print(f"均方误差: {mean_squared_error(y, predictions):.4f}")

# 聚类任务
X, _ = load_iris()
kmeans = clusterers.KMeans(n_clusters=3)
labels = kmeans.fit_predict(X)
print(f"聚类标签: {labels[:10]}")
```

## 监督学习

### 1. 分类算法

#### 决策树分类器

```python
from BaseML.classifiers import DecisionTreeClassifier
from BaseML.datasets import load_iris
from BaseML.model_selection import train_test_split
from BaseML.metrics import classification_report, confusion_matrix
import matplotlib.pyplot as plt

# 加载数据
X, y = load_iris()
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.3)

# 创建模型
clf = DecisionTreeClassifier(
    max_depth=3,
    criterion='gini',  # 或 'entropy'
    min_samples_split=5,
    min_samples_leaf=2
)

# 训练
clf.fit(X_train, y_train)

# 预测
y_pred = clf.predict(X_test)

# 评估
print("分类报告:")
print(classification_report(y_test, y_pred))

print("混淆矩阵:")
print(confusion_matrix(y_test, y_pred))

# 可视化决策树
plt.figure(figsize=(15, 10))
clf.plot_tree(feature_names=['sepal_length', 'sepal_width', 'petal_length', 'petal_width'],
              class_names=['setosa', 'versicolor', 'virginica'])
plt.show()
```

#### 随机森林

```python
from BaseML.classifiers import RandomForestClassifier
from BaseML.datasets import load_digits
from BaseML.metrics import accuracy_score

# 加载手写数字数据集
X, y = load_digits(n_class=10)

# 创建随机森林
rf = RandomForestClassifier(
    n_estimators=100,
    max_depth=10,
    min_samples_split=5,
    random_state=42
)

# 训练和评估
rf.fit(X_train, y_train)
y_pred = rf.predict(X_test)
print(f"随机森林准确率: {accuracy_score(y_test, y_pred):.4f}")

# 特征重要性
importances = rf.feature_importances_
plt.figure(figsize=(10, 6))
plt.bar(range(len(importances)), importances)
plt.title('特征重要性')
plt.show()
```

#### 支持向量机

```python
from BaseML.classifiers import SVC
from BaseML.preprocessing import StandardScaler
from BaseML.datasets import make_classification

# 创建合成数据集
X, y = make_classification(
    n_samples=1000,
    n_features=2,
    n_redundant=0,
    n_informative=2,
    random_state=42,
    n_clusters_per_class=1
)

# 标准化
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

# 创建SVM分类器
svm = SVC(
    kernel='rbf',  # 'linear', 'poly', 'rbf', 'sigmoid'
    C=1.0,
    gamma='scale',
    probability=True
)

# 训练
svm.fit(X_scaled, y)

# 可视化决策边界
import numpy as np

def plot_decision_boundary(model, X, y):
    x_min, x_max = X[:, 0].min() - 1, X[:, 0].max() + 1
    y_min, y_max = X[:, 1].min() - 1, X[:, 1].max() + 1
    xx, yy = np.meshgrid(np.arange(x_min, x_max, 0.1),
                         np.arange(y_min, y_max, 0.1))

    Z = model.predict(np.c_[xx.ravel(), yy.ravel()])
    Z = Z.reshape(xx.shape)

    plt.contourf(xx, yy, Z, alpha=0.4)
    plt.scatter(X[:, 0], X[:, 1], c=y, s=20, edgecolor='k')
    plt.show()

plot_decision_boundary(svm, X_scaled, y)
```

### 2. 回归算法

#### 线性回归

```python
from BaseML.regressors import LinearRegression
from BaseML.datasets import load_boston
from BaseML.metrics import mean_squared_error, r2_score
import matplotlib.pyplot as plt

# 加载数据
X, y = load_boston()
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2)

# 创建线性回归模型
lr = LinearRegression(
    fit_intercept=True,
    normalize=False
)

# 训练
lr.fit(X_train, y_train)

# 预测
y_pred = lr.predict(X_test)

# 评估
mse = mean_squared_error(y_test, y_pred)
r2 = r2_score(y_test, y_pred)
print(f"均方误差: {mse:.4f}")
print(f"R²分数: {r2:.4f}")

# 系数分析
print(f"截距: {lr.intercept_:.4f}")
for i, coef in enumerate(lr.coef_):
    print(f"特征{i}的系数: {coef:.4f}")

# 预测vs真实值可视化
plt.figure(figsize=(10, 6))
plt.scatter(y_test, y_pred, alpha=0.6)
plt.plot([y_test.min(), y_test.max()], [y_test.min(), y_test.max()], 'r--')
plt.xlabel('真实值')
plt.ylabel('预测值')
plt.title('预测值vs真实值')
plt.show()
```

#### 多项式回归

```python
from BaseML.regressors import PolynomialRegression
from BaseML.preprocessing import PolynomialFeatures
import numpy as np

# 生成非线性数据
np.random.seed(42)
X = np.sort(5 * np.random.rand(80, 1), axis=0)
y = np.sin(X).ravel() + np.random.normal(0, 0.1, X.shape[0])

# 创建多项式回归模型
poly_reg = PolynomialRegression(degree=3)
poly_reg.fit(X, y)

# 预测
X_test = np.arange(0.0, 5.0, 0.01)[:, np.newaxis]
y_pred = poly_reg.predict(X_test)

# 可视化
plt.figure(figsize=(10, 6))
plt.scatter(X, y, color='darkorange', label='数据')
plt.plot(X_test, y_pred, color='cornflowerblue', linewidth=2, label='多项式回归')
plt.xlabel('X')
plt.ylabel('y')
plt.title('多项式回归')
plt.legend()
plt.show()
```

## 无监督学习

### 1. 聚类算法

#### K-Means聚类

```python
from BaseML.clusterers import KMeans
from BaseML.datasets import make_blobs
from BaseML.metrics import silhouette_score
import matplotlib.pyplot as plt

# 生成聚类数据
X, y_true = make_blobs(
    n_samples=500,
    centers=4,
    cluster_std=0.7,
    random_state=42
)

# 使用肘部法则选择K
inertias = []
K_range = range(1, 11)

for k in K_range:
    kmeans = KMeans(n_clusters=k, random_state=42)
    kmeans.fit(X)
    inertias.append(kmeans.inertia_)

plt.figure(figsize=(10, 5))
plt.plot(K_range, inertias, 'bo-')
plt.xlabel('K值')
plt.ylabel('Inertia')
plt.title('肘部法则')
plt.show()

# 使用K=4进行聚类
kmeans = KMeans(n_clusters=4, random_state=42)
labels = kmeans.fit_predict(X)

# 计算轮廓系数
silhouette_avg = silhouette_score(X, labels)
print(f"轮廓系数: {silhouette_avg:.4f}")

# 可视化聚类结果
plt.figure(figsize=(10, 6))
plt.scatter(X[:, 0], X[:, 1], c=labels, s=50, cmap='viridis')
centers = kmeans.cluster_centers_
plt.scatter(centers[:, 0], centers[:, 1], c='red', s=200, alpha=0.75, marker='X')
plt.title('K-Means聚类结果')
plt.show()
```

#### 层次聚类

```python
from BaseML.clusterers import AgglomerativeClustering
from BaseML.datasets import load_iris
from scipy.cluster.hierarchy import dendrogram

# 加载数据
X, y = load_iris()

# 创建层次聚类模型
agg = AgglomerativeClustering(
    n_clusters=3,
    linkage='ward'  # 'ward', 'complete', 'average', 'single'
)

# 训练和预测
labels = agg.fit_predict(X)

# 绘制树状图
def plot_dendrogram(model, **kwargs):
    counts = np.zeros(model.children_.shape[0])
    n_samples = len(model.labels_)
    for i, merge in enumerate(model.children_):
        current_count = 0
        for child_idx in merge:
            if child_idx < n_samples:
                current_count += 1
            else:
                current_count += counts[child_idx - n_samples]
        counts[i] = current_count

    linkage_matrix = np.column_stack([model.children_, model.distances_, counts]).astype(float)

    dendrogram(linkage_matrix, **kwargs)

plt.figure(figsize=(12, 8))
plot_dendrogram(agg, truncate_mode='level', p=3)
plt.title('层次聚类树状图')
plt.show()
```

### 2. 降维算法

#### 主成分分析(PCA)

```python
from BaseML.decomposition import PCA
from BaseML.datasets import load_digits
import matplotlib.pyplot as plt

# 加载手写数字数据集
X, y = load_digits()

# 使用PCA降维到2维
pca = PCA(n_components=2)
X_pca = pca.fit_transform(X)

print(f"原始维度: {X.shape[1]}")
print(f"降维后维度: {X_pca.shape[1]}")
print(f"解释方差比: {pca.explained_variance_ratio_.sum():.4f}")

# 可视化降维结果
plt.figure(figsize=(10, 8))
scatter = plt.scatter(X_pca[:, 0], X_pca[:, 1], c=y, cmap='viridis', alpha=0.6)
plt.colorbar(scatter)
plt.xlabel('第一主成分')
plt.ylabel('第二主成分')
plt.title('PCA降维结果')
plt.show()

# 查看主成分
plt.figure(figsize=(12, 6))
for i in range(5):
    plt.subplot(1, 5, i+1)
    plt.imshow(pca.components_[i].reshape(8, 8), cmap='gray')
    plt.title(f'PC{i+1}')
    plt.axis('off')
plt.show()
```

## 特征工程

### 1. 特征选择

```python
from BaseML.feature_selection import SelectKBest, RFE
from BaseML.classifiers import RandomForestClassifier
from BaseML.datasets import load_wine

# 加载数据
X, y = load_wine()

# 方法1: 单变量特征选择
selector = SelectKBest(k=10)
X_selected = selector.fit_transform(X, y)
print(f"选择前的特征数: {X.shape[1]}")
print(f"选择后的特征数: {X_selected.shape[1]}")

# 方法2: 递归特征消除
rf = RandomForestClassifier(n_estimators=100)
rfe = RFE(estimator=rf, n_features_to_select=10)
X_rfe = rfe.fit_transform(X, y)

# 查看被选择的特征
selected_features = rfe.support_
print("被选择的特征索引:", np.where(selected_features)[0])
```

### 2. 特征缩放

```python
from BaseML.preprocessing import StandardScaler, MinMaxScaler, RobustScaler
import numpy as np

# 创建示例数据
X = np.array([[1, -1, 2],
              [2, 0, 0],
              [0, 1, -1]])

# 标准化 (Z-score)
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)
print("标准化后的数据:")
print(X_scaled)

# 归一化到[0,1]
minmax = MinMaxScaler()
X_minmax = minmax.fit_transform(X)
print("\n归一化后的数据:")
print(X_minmax)

# 鲁棒缩放 (使用中位数和四分位数)
robust = RobustScaler()
X_robust = robust.fit_transform(X)
print("\n鲁棒缩放后的数据:")
print(X_robust)
```

### 3. 特征生成

```python
from BaseML.preprocessing import PolynomialFeatures
import numpy as np

# 创建示例数据
X = np.arange(6).reshape(6, 1)

# 生成多项式特征
poly = PolynomialFeatures(degree=3, include_bias=False)
X_poly = poly.fit_transform(X)

print("原始特征:")
print(X)
print("\n多项式特征:")
print(X_poly)
print(f"\n特征名称: {poly.get_feature_names_out(['x'])}")
```

## 模型评估和选择

### 1. 交叉验证

```python
from BaseML.model_selection import cross_val_score, KFold
from BaseML.classifiers import SVC
from BaseML.datasets import load_iris

# 加载数据
X, y = load_iris()

# 创建模型
svm = SVC(kernel='rbf', C=1.0)

# 5折交叉验证
cv_scores = cross_val_score(svm, X, y, cv=5)
print(f"交叉验证分数: {cv_scores}")
print(f"平均分数: {cv_scores.mean():.4f}")
print(f"标准差: {cv_scores.std():.4f}")

# 自定义交叉验证策略
kfold = KFold(n_splits=5, shuffle=True, random_state=42)
cv_scores = cross_val_score(svm, X, y, cv=kfold)
print(f"\n打乱后的交叉验证分数: {cv_scores}")
```

### 2. 超参数调优

```python
from BaseML.model_selection import GridSearchCV, RandomizedSearchCV
from BaseML.classifiers import RandomForestClassifier
from BaseML.datasets import load_breast_cancer
import numpy as np

# 加载数据
X, y = load_breast_cancer()
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2)

# 创建随机森林
rf = RandomForestClassifier()

# 定义参数网格
param_grid = {
    'n_estimators': [50, 100, 200],
    'max_depth': [None, 10, 20, 30],
    'min_samples_split': [2, 5, 10],
    'min_samples_leaf': [1, 2, 4],
    'max_features': ['sqrt', 'log2']
}

# 网格搜索
grid_search = GridSearchCV(
    estimator=rf,
    param_grid=param_grid,
    cv=5,
    n_jobs=-1,
    verbose=1
)

grid_search.fit(X_train, y_train)

print(f"最佳参数: {grid_search.best_params_}")
print(f"最佳交叉验证分数: {grid_search.best_score_:.4f}")

# 在测试集上评估
best_rf = grid_search.best_estimator_
test_score = best_rf.score(X_test, y_test)
print(f"测试集准确率: {test_score:.4f}")
```

## 实际应用案例

### 1. 泰坦尼克号生存预测

```python
from BaseML.classifiers import LogisticRegression
from BaseML.preprocessing import StandardScaler
from BaseML.model_selection import train_test_split
from BaseML.metrics import accuracy_score, classification_report
import pandas as pd

# 创建模拟数据
data = {
    'Pclass': [3, 1, 3, 1, 3, 1, 3, 3, 1, 2],
    'Sex': [0, 1, 1, 1, 0, 0, 1, 1, 1, 0],  # 0=male, 1=female
    'Age': [22, 38, 26, 35, 28, 54, 2, 27, 14, 4],
    'SibSp': [1, 1, 0, 1, 0, 0, 3, 0, 1, 1],
    'Parch': [0, 0, 0, 0, 0, 0, 1, 0, 2, 1],
    'Fare': [7.25, 71.28, 7.92, 53.1, 8.05, 51.86, 21.07, 11.33, 30.07, 16.7],
    'Survived': [0, 1, 1, 1, 0, 0, 0, 0, 0, 1]
}

df = pd.DataFrame(data)

# 特征工程
df['Family_Size'] = df['SibSp'] + df['Parch']
df['Is_Alone'] = (df['Family_Size'] == 0).astype(int)

# 选择特征
features = ['Pclass', 'Sex', 'Age', 'Fare', 'Family_Size', 'Is_Alone']
X = df[features]
y = df['Survived']

# 标准化
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

# 训练测试分割
X_train, X_test, y_train, y_test = train_test_split(
    X_scaled, y, test_size=0.3, random_state=42
)

# 创建并训练逻辑回归模型
logreg = LogisticRegression(
    penalty='l2',
    C=1.0,
    max_iter=1000
)

logreg.fit(X_train, y_train)

# 预测和评估
y_pred = logreg.predict(X_test)
print(f"准确率: {accuracy_score(y_test, y_pred):.4f}")
print("\n分类报告:")
print(classification_report(y_test, y_pred))

# 查看特征系数
feature_importance = pd.DataFrame({
    'Feature': features,
    'Coefficient': logreg.coef_[0]
})
print("\n特征重要性:")
print(feature_importance.sort_values('Coefficient', ascending=False))
```

### 2. 客户细分

```python
from BaseML.clusterers import KMeans
from BaseML.decomposition import PCA
from BaseML.preprocessing import StandardScaler
import matplotlib.pyplot as plt

# 创建模拟客户数据
import numpy as np
np.random.seed(42)

n_customers = 300

# 生成客户特征
age = np.random.randint(18, 70, n_customers)
income = np.random.normal(50000, 15000, n_customers)
spending_score = np.random.randint(1, 101, n_customers)
frequency = np.random.randint(1, 30, n_customers)

X = np.column_stack([age, income, spending_score, frequency])

# 标准化特征
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

# 使用PCA降维到2维进行可视化
pca = PCA(n_components=2)
X_pca = pca.fit_transform(X_scaled)

# 寻找最佳聚类数
inertias = []
K_range = range(1, 11)

for k in K_range:
    kmeans = KMeans(n_clusters=k, random_state=42)
    kmeans.fit(X_scaled)
    inertias.append(kmeans.inertia_)

plt.figure(figsize=(10, 5))
plt.plot(K_range, inertias, 'bo-')
plt.xlabel('聚类数K')
plt.ylabel('Inertia')
plt.title('肘部法则')
plt.show()

# 使用K=4进行聚类
kmeans = KMeans(n_clusters=4, random_state=42)
clusters = kmeans.fit_predict(X_scaled)

# 可视化聚类结果
plt.figure(figsize=(10, 6))
scatter = plt.scatter(X_pca[:, 0], X_pca[:, 1], c=clusters, s=50, cmap='viridis', alpha=0.6)
plt.colorbar(scatter)
plt.xlabel('第一主成分')
plt.ylabel('第二主成分')
plt.title('客户细分结果')
plt.show()

# 分析每个聚类的特征
feature_names = ['年龄', '收入', '消费分数', '消费频率']
for cluster_id in range(4):
    cluster_mask = clusters == cluster_id
    cluster_features = X[cluster_mask]

    print(f"\n聚类 {cluster_id} ({np.sum(cluster_mask)} 客户):")
    for i, name in enumerate(feature_names):
        print(f"  {name}: {np.mean(cluster_features[:, i]):.2f} (±{np.std(cluster_features[:, i]):.2f})")
```

## 常见问题

### Q: 如何处理类别不平衡？

```python
from BaseML.classifiers import LogisticRegression
from BaseML.datasets import make_classification
from BaseML.metrics import classification_report

# 创建不平衡数据集
X, y = make_classification(
    n_samples=1000,
    n_features=10,
    weights=[0.9, 0.1],  # 90%为类别0，10%为类别1
    random_state=42
)

# 方法1: 使用类别权重
lr_weighted = LogisticRegression(class_weight='balanced')
lr_weighted.fit(X_train, y_train)

# 方法2: 调整分类阈值
probabilities = lr.predict_proba(X_test)[:, 1]
threshold = 0.3  # 降低阈值
y_pred_custom = (probabilities >= threshold).astype(int)
```

### Q: 如何处理缺失值？

```python
from BaseML.impute import SimpleImputer, KNNImputer
import numpy as np

# 创建带缺失值的数据
X = np.array([[1, 2, np.nan],
              [3, np.nan, 6],
              [7, 8, 9]])

# 方法1: 均值填充
imputer_mean = SimpleImputer(strategy='mean')
X_filled_mean = imputer_mean.fit_transform(X)

# 方法2: 中位数填充
imputer_median = SimpleImputer(strategy='median')
X_filled_median = imputer_median.fit_transform(X)

# 方法3: K近邻填充
imputer_knn = KNNImputer(n_neighbors=2)
X_filled_knn = imputer_knn.fit_transform(X)
```

### Q: 如何选择合适的评估指标？

```python
from BaseML.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    roc_auc_score, confusion_matrix
)

# 不同场景的评估指标
# 平衡数据集：使用准确率(accuracy)
# 不平衡数据集：使用精确率(precision)、召回率(recall)、F1分数
# 二分类问题：使用AUC-ROC
# 多分类问题：使用宏平均或加权平均的指标

# 示例：计算所有指标
y_true = [0, 1, 1, 0, 1]
y_pred = [0, 1, 0, 0, 1]

print(f"准确率: {accuracy_score(y_true, y_pred):.4f}")
print(f"精确率: {precision_score(y_true, y_pred):.4f}")
print(f"召回率: {recall_score(y_true, y_pred):.4f}")
print(f"F1分数: {f1_score(y_true, y_pred):.4f}")
```

## 最佳实践

1. **数据预处理**：始终进行数据清洗和特征工程
2. **特征缩放**：对距离敏感的算法要进行特征缩放
3. **交叉验证**：使用交叉验证评估模型性能
4. **超参数调优**：使用网格搜索或随机搜索
5. **模型选择**：根据问题类型选择合适的算法
6. **特征重要性**：理解模型如何做决策
7. **避免过拟合**：使用正则化和交叉验证

## 参考资料

- [BaseML官方文档](https://xedu.openxlab.org.cn/docs/baseml)
- [机器学习入门教程](https://xedu.openxlab.org.cn/tutorials/ml)
- [Scikit-learn对照表](https://xedu.openxlab.org.cn/comparisons/sklearn)