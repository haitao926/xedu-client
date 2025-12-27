---
title: "BaseDT完整使用指南"
component: "BaseDT"
category: "guide"
tags: ["数据处理", "数据增强", "特征工程", "数据可视化"]
difficulty: "beginner"
keywords: ["BaseDT", "数据预处理", "数据清洗", "数据增强", "数据集划分"]
last_updated: "2024-12-04"
---

# BaseDT完整使用指南

## 简介

BaseDT是XEdu的数据处理工具库，提供了完整的数据预处理、清洗、增强和可视化功能。它专为AI教育设计，简化了常见的数据处理任务，让用户可以专注于算法和模型本身。

主要特点：
- 简洁易用的API
- 丰富的数据预处理工具
- 强大的数据增强功能
- 可视化支持
- 与其他XEdu组件无缝集成

## 安装

```bash
pip install BaseDT
```

## 快速开始

### 基础示例

```python
from BaseDT import DataLoader, DataProcessor, DataAugmentation, DataSplitter
import pandas as pd

# 加载数据
loader = DataLoader()
data = loader.load_csv('data.csv')

# 数据预处理
processor = DataProcessor()
processed_data = processor.clean_data(data)
processed_data = processor.normalize(processed_data)

# 数据增强
augmentor = DataAugmentation(['random_flip', 'random_rotation'])
augmented_data = augmentor.augment(processed_data)

# 数据集划分
splitter = DataSplitter(test_size=0.2, val_size=0.2)
train_data, val_data, test_data = splitter.split(augmented_data)
```

## 数据加载

### 1. CSV文件加载

```python
from BaseDT import DataLoader

# 创建加载器
loader = DataLoader()

# 基础加载
data = loader.load_csv('dataset.csv')

# 带参数加载
data = loader.load_csv(
    'dataset.csv',
    sep=',',
    header=0,
    index_col=0,
    na_values=['?', 'NULL'],
    encoding='utf-8'
)

# 查看数据信息
print(data.head())
print(data.info())
print(data.describe())

# 加载部分数据
data_sample = loader.load_csv(
    'large_dataset.csv',
    nrows=1000,  # 只读取前1000行
    usecols=['col1', 'col2', 'col3']  # 只读取指定列
)
```

### 2. Excel文件加载

```python
# 加载Excel文件
data = loader.load_excel(
    'data.xlsx',
    sheet_name='Sheet1',  # 指定工作表
    skiprows=1,           # 跳过前1行
    usecols='A:E'         # 使用A到E列
)

# 加载多个工作表
data_dict = loader.load_excel('multi_sheet.xlsx', sheet_name=['Sheet1', 'Sheet2'])
```

### 3. 图像数据加载

```python
from BaseDT import ImageLoader

# 创建图像加载器
img_loader = ImageLoader()

# 加载单个图像
image = img_loader.load_image('photo.jpg')
print(f"图像尺寸: {image.shape}")

# 批量加载图像
images = img_loader.load_batch(
    folder_path='images/',
    extensions=['jpg', 'png', 'bmp'],
    resize=(224, 224),
    normalize=True
)

# 创建图像数据集
dataset = img_loader.create_dataset(
    'images/',
    labels_file='labels.csv',
    validation_split=0.2
)
```

## 数据清洗

### 1. 处理缺失值

```python
from BaseDT import DataCleaner

cleaner = DataCleaner()

# 检测缺失值
missing_info = cleaner.detect_missing(data)
print(missing_info)

# 删除缺失值
# 删除包含缺失值的行
data_drop = cleaner.drop_missing(data, axis=0)

# 删除缺失值比例超过50%的列
data_drop = cleaner.drop_missing(data, axis=1, threshold=0.5)

# 填充缺失值
# 使用均值填充数值列
data_filled = cleaner.fill_missing(data, strategy='mean', columns=['age', 'income'])

# 使用中位数填充
data_filled = cleaner.fill_missing(data, strategy='median', columns=['score'])

# 使用众数填充类别列
data_filled = cleaner.fill_missing(data, strategy='mode', columns=['category'])

# 使用固定值填充
data_filled = cleaner.fill_missing(data, value=0, columns=['count'])

# 使用前向填充
data_filled = cleaner.fill_missing(data, method='ffill', columns=['time_series'])

# 使用后向填充
data_filled = cleaner.fill_missing(data, method='bfill', columns=['time_series'])
```

### 2. 处理异常值

```python
# 检测异常值（IQR方法）
outliers = cleaner.detect_outliers(data, method='iqr', columns=['score'])
print(f"检测到 {len(outliers)} 个异常值")

# 检测异常值（Z-score方法）
outliers = cleaner.detect_outliers(data, method='zscore', columns=['score'], threshold=3)

# 处理异常值
# 删除异常值
data_clean = cleaner.remove_outliers(data, method='iqr', columns=['score'])

# 替换异常值为边界值
data_clean = cleaner.replace_outliers(data, method='iqr', columns=['score'])

# 使用中位数替换
data_clean = cleaner.replace_outliers(
    data,
    method='iqr',
    columns=['score'],
    replacement='median'
)
```

### 3. 处理重复值

```python
# 检测重复值
duplicates = cleaner.detect_duplicates(data)
print(f"发现 {len(duplicates)} 行重复数据")

# 删除重复值
data_unique = cleaner.remove_duplicates(data, keep='first')  # 保留第一个
data_unique = cleaner.remove_duplicates(data, keep=False)   # 删除所有重复

# 基于部分列检测重复
duplicates = cleaner.detect_duplicates(data, subset=['name', 'email'])
```

### 4. 数据类型转换

```python
from BaseDT import TypeConverter

converter = TypeConverter()

# 转换数据类型
data_converted = converter.convert_types(data, {
    'age': 'int32',
    'price': 'float64',
    'category': 'category',
    'date': 'datetime64[ns]'
})

# 智能类型推断
data_converted = converter.infer_types(data)

# 字符串转数值
data_converted = converter.str_to_numeric(
    data,
    columns=['price'],
    remove_symbols=True
)

# 日期时间解析
data_converted = converter.parse_datetime(
    data,
    columns=['date'],
    format='%Y-%m-%d',  # 指定格式
    errors='coerce'     # 解析失败设为NaT
)
```

## 特征工程

### 1. 特征编码

```python
from BaseDT import FeatureEncoder

encoder = FeatureEncoder()

# 标签编码
data_encoded = encoder.label_encode(data, columns=['category'])

# 独热编码
data_encoded = encoder.one_hot_encode(data, columns=['color', 'size'])

# 目标编码（适用于高基数类别）
data_encoded = encoder.target_encode(
    data,
    target_col='price',
    categorical_cols=['neighborhood']
)

# 频率编码
data_encoded = encoder.frequency_encode(data, columns=['brand'])

# 二进制编码
data_encoded = encoder.binary_encode(data, columns=['category'])
```

### 2. 特征生成

```python
from BaseDT import FeatureGenerator

generator = FeatureGenerator()

# 多项式特征
data_poly = generator.create_polynomial_features(
    data,
    columns=['x1', 'x2'],
    degree=2,
    include_bias=False
)

# 交互特征
data_interact = generator.create_interaction_features(
    data,
    columns=['height', 'width']
)

# 统计特征
# 在时间序列中创建滑动窗口统计
data_stats = generator.create_rolling_features(
    data,
    column='value',
    windows=[3, 7, 14],
    functions=['mean', 'std', 'min', 'max']
)

# 聚合特征
data_agg = generator.create_aggregation_features(
    data,
    group_by='category',
    agg_col='value',
    functions=['mean', 'sum', 'count']
)

# 文本特征
from BaseDT.text import TextFeatures

text_features = TextFeatures()
data['text_length'] = text_features.length(data['text'])
data['word_count'] = text_features.word_count(data['text'])
data['uppercase_ratio'] = text_features.uppercase_ratio(data['text'])
```

### 3. 特征选择

```python
from BaseDT import FeatureSelector

selector = FeatureSelector()

# 方差阈值选择
data_selected = selector.variance_threshold(data, threshold=0.1)

# 相关性选择
# 删除高度相关的特征
data_selected = selector.correlation_filter(
    data,
    threshold=0.95,
    method='pearson'
)

# 单变量统计选择
data_selected = selector.univariate_selection(
    data,
    target_col='target',
    score_func='f_classif',  # 'f_classif', 'f_regression', 'chi2'
    k=10
)

# 递归特征消除
from BaseDT.classifiers import RandomForestClassifier
model = RandomForestClassifier()
data_selected = selector.rfe_selection(
    data,
    target_col='target',
    estimator=model,
    n_features_to_select=10
)
```

## 数据增强

### 1. 图像增强

```python
from BaseDT import ImageAugmentation

augmentor = ImageAugmentation()

# 单个增强
augmented = augmentor.random_rotation(image, angle_range=(-30, 30))
augmented = augmentor.random_flip(image, direction='horizontal')
augmented = augmentor.random_crop(image, crop_ratio=(0.8, 1.0))
augmented = augmentor.random_brightness(image, factor_range=(0.8, 1.2))
augmented = augmentor.random_contrast(image, factor_range=(0.8, 1.2))
augmented = augmentor.gaussian_blur(image, kernel_size=(3, 3))

# 组合增强
augmentor.add_transform('random_rotation', angle_range=(-15, 15))
augmentor.add_transform('random_flip', direction='horizontal')
augmentor.add_transform('random_brightness', factor_range=(0.9, 1.1))
augmentor.add_transform('gaussian_noise', mean=0, std=0.01)

# 批量增强
augmented_images = augmentor.augment_batch(
    images,
    augment_per_image=3,  # 每张图生成3个增强版本
    random_order=True
)

# 创建增强数据集
augmented_dataset = augmentor.create_dataset(
    image_folder='train/',
    labels_file='labels.csv',
    output_folder='augmented/',
    augment_per_class=100  # 每个类别100张增强图
)
```

### 2. 文本增强

```python
from BaseDT import TextAugmentation

text_aug = TextAugmentation()

# 同义词替换
augmented_text = text_aug.synonym_replacement(
    text,
    n=5,  # 替换5个词
    stop_words=['the', 'a', 'an']
)

# 随机插入
augmented_text = text_aug.random_insertion(
    text,
    n=2,  # 插入2个词
    stop_words=['the', 'a', 'an']
)

# 随机交换
augmented_text = text_aug.random_swap(text, n=2)

# 随机删除
augmented_text = text_aug.random_deletion(
    text,
    p=0.1  # 每个词有10%概率被删除
)

# 回译增强
augmented_text = text_aug.back_translation(
    text,
    src_lang='en',
    target_lang='de'
)
```

### 3. 表格数据增强

```python
from BaseDT import TabularAugmentation

tab_aug = TabularAugmentation()

# SMOTE过采样（用于不平衡数据）
X_resampled, y_resampled = tab_aug.smote_oversample(
    X, y,
    sampling_strategy='auto',
    random_state=42
)

# 随机欠采样
X_resampled, y_resampled = tab_aug.random_undersample(
    X, y,
    sampling_strategy='auto',
    random_state=42
)

# 生成合成数据
synthetic_data = tab_aug.generate_synthetic(
    data,
    n_samples=1000,
    noise_level=0.05
)
```

## 数据集划分

### 1. 基础划分

```python
from BaseDT import DataSplitter

# 创建划分器
splitter = DataSplitter()

# 简单训练测试划分
train_data, test_data = splitter.train_test_split(
    data,
    test_size=0.2,
    random_state=42,
    stratify_col='label'  # 分层采样
)

# 三分法划分（训练、验证、测试）
train_data, val_data, test_data = splitter.train_val_test_split(
    data,
    train_size=0.7,
    val_size=0.15,
    test_size=0.15,
    random_state=42,
    stratify_col='label'
)
```

### 2. 交叉验证划分

```python
# K折交叉验证
cv_splits = splitter.k_fold_split(
    data,
    k=5,
    random_state=42,
    stratify_col='label'
)

for fold, (train_idx, val_idx) in enumerate(cv_splits):
    train_fold = data.iloc[train_idx]
    val_fold = data.iloc[val_idx]
    print(f"Fold {fold + 1}: Train={len(train_fold)}, Val={len(val_fold)}")

# 分层K折
cv_splits = splitter.stratified_k_fold(
    data,
    k=5,
    label_col='label',
    random_state=42
)
```

### 3. 时间序列划分

```python
# 时间序列划分（不能随机）
train_data, test_data = splitter.time_series_split(
    data,
    date_col='date',
    test_size=0.2
)

# 滑动窗口划分
window_splits = splitter.sliding_window_split(
    data,
    window_size=100,
    step_size=50,
    test_size=0.2
)
```

## 数据可视化

### 1. 基础可视化

```python
from BaseDT import DataVisualizer

visualizer = DataVisualizer()

# 数据分布直方图
visualizer.histogram(
    data,
    column='age',
    bins=30,
    title='年龄分布',
    save_path='age_distribution.png'
)

# 箱线图
visualizer.boxplot(
    data,
    column='income',
    by='education',
    title='不同教育程度的收入分布'
)

# 散点图
visualizer.scatter(
    data,
    x='age',
    y='income',
    hue='gender',
    title='年龄与收入关系'
)

# 相关性热力图
visualizer.correlation_heatmap(
    data,
    columns=['age', 'income', 'score', 'experience'],
    title='特征相关性'
)
```

### 2. 高级可视化

```python
# 缺失值可视化
visualizer.missing_values_plot(data, title='缺失值分布')

# 成对关系图
visualizer.pairplot(
    data,
    columns=['age', 'income', 'score'],
    hue='category',
    title='特征成对关系'
)

# 分类分布图
visualizer.countplot(
    data,
    column='category',
    title='类别分布',
    order=data['category'].value_counts().index
)

# 时间序列图
visualizer.time_series(
    data,
    date_col='date',
    value_col='value',
    title='时间序列趋势'
)
```

## 数据导出

### 1. 导出为文件

```python
from BaseDT import DataExporter

exporter = DataExporter()

# 导出为CSV
exporter.to_csv(
    data,
    'processed_data.csv',
    index=False,
    encoding='utf-8'
)

# 导出为Excel
exporter.to_excel(
    data,
    'processed_data.xlsx',
    sheet_name='Data',
    index=False
)

# 导出为JSON
exporter.to_json(
    data,
    'processed_data.json',
    orient='records',
    date_format='iso'
)
```

### 2. 导出为其他格式

```python
# 导出为Parquet（高效）
exporter.to_parquet(data, 'processed_data.parquet')

# 导出为HDF5（适合大数据）
exporter.to_hdf5(data, 'processed_data.h5', key='data')

# 导出为pickle（Python对象）
exporter.to_pickle(data, 'processed_data.pkl')
```

## 实际应用案例

### 1. 完整的数据预处理流水线

```python
from BaseDT import DataLoader, DataCleaner, FeatureEncoder, DataSplitter
import pandas as pd

# 1. 加载数据
loader = DataLoader()
data = loader.load_csv('raw_data.csv')

# 2. 数据清洗
cleaner = DataCleaner()

# 处理缺失值
data = cleaner.fill_missing(data, strategy='mean', columns=['age'])
data = cleaner.fill_missing(data, strategy='mode', columns=['category'])

# 处理异常值
data = cleaner.remove_outliers(data, method='iqr', columns=['income'])

# 3. 特征工程
encoder = FeatureEncoder()

# 编码类别特征
data = encoder.one_hot_encode(data, columns=['color', 'size'])
data = encoder.label_encode(data, columns=['category'])

# 4. 数据集划分
splitter = DataSplitter()
train_data, val_data, test_data = splitter.train_val_test_split(
    data,
    train_size=0.7,
    val_size=0.15,
    test_size=0.15,
    stratify_col='target'
)

# 5. 保存处理后的数据
exporter = DataExporter()
train_data.to_csv('train.csv', index=False)
val_data.to_csv('val.csv', index=False)
test_data.to_csv('test.csv', index=False)

print(f"训练集: {len(train_data)} 样本")
print(f"验证集: {len(val_data)} 样本")
print(f"测试集: {len(test_data)} 样本")
```

### 2. 图像数据增强流水线

```python
from BaseDT import ImageLoader, ImageAugmentation, DataSplitter

# 1. 加载图像
loader = ImageLoader()
images, labels = loader.load_classification_dataset(
    'images/',
    image_size=(224, 224),
    normalize=True
)

# 2. 数据增强
augmentor = ImageAugmentation()
augmentor.add_transform('random_rotation', angle_range=(-15, 15))
augmentor.add_transform('random_flip', direction='horizontal')
augmentor.add_transform('random_brightness', factor_range=(0.8, 1.2))
augmentor.add_transform('random_contrast', factor_range=(0.8, 1.2))
augmentor.add_transform('gaussian_noise', mean=0, std=0.01)

# 3. 增强数据
augmented_images, augmented_labels = augmentor.augment_dataset(
    images,
    labels,
    augment_per_image=2,
    save_path='augmented_images/'
)

# 4. 数据集划分
train_idx, test_idx = DataSplitter().train_test_split_idx(
    len(augmented_images),
    test_size=0.2,
    stratify_labels=augmented_labels
)

train_images = augmented_images[train_idx]
train_labels = augmented_labels[train_idx]
test_images = augmented_images[test_idx]
test_labels = augmented_labels[test_idx]

print(f"训练集: {len(train_images)} 张图片")
print(f"测试集: {len(test_images)} 张图片")
```

### 3. 文本数据预处理

```python
from BaseDT import TextProcessor, TextAugmentation
import pandas as pd

# 1. 加载文本数据
data = pd.read_csv('text_data.csv')

# 2. 文本预处理
processor = TextProcessor()

# 基础清洗
data['cleaned_text'] = processor.clean_text(
    data['text'],
    remove_html=True,
    remove_urls=True,
    remove_emails=True,
    remove_special_chars=True,
    lowercase=True
)

# 分词
data['tokens'] = processor.tokenize(data['cleaned_text'])

# 去除停用词
data['tokens'] = processor.remove_stopwords(
    data['tokens'],
    language='chinese'  # 或 'english'
)

# 词形还原（英文）
data['tokens'] = processor.lemmatize(data['tokens'])

# 3. 特征提取
# TF-IDF
from BaseDT.text import TFIDFVectorizer

vectorizer = TFIDFVectorizer(max_features=5000)
tfidf_features = vectorizer.fit_transform(data['cleaned_text'])

# 4. 数据增强（可选）
augmenter = TextAugmentation()
augmented_texts = []

for text in data['cleaned_text']:
    aug_text = augmenter.synonym_replacement(text, n=3)
    augmented_texts.append(aug_text)

# 5. 保存处理后的数据
data['cleaned_text'] = data['cleaned_text']
data['tokens'] = data['tokens'].apply(lambda x: ' '.join(x))
data.to_csv('processed_text_data.csv', index=False)
```

## 常见问题

### Q: 如何处理大数据集？

```python
# 分块读取
loader = DataLoader()
chunk_size = 10000
for chunk in loader.read_csv_chunks('large_dataset.csv', chunksize=chunk_size):
    processed_chunk = process_chunk(chunk)
    processed_chunk.to_csv('output.csv', mode='a', header=False)

# 使用Dask进行并行处理
from BaseDT import DaskLoader
loader = DaskLoader()
data = loader.load_csv('very_large_dataset.csv')
```

### Q: 如何处理不平衡数据集？

```python
# 方法1: 重采样
from BaseDT import Resampler

resampler = Resampler()

# 过采样
X_resampled, y_resampled = resampler.oversample(
    X, y,
    method='smote',
    sampling_strategy='auto'
)

# 欠采样
X_resampled, y_resampled = resampler.undersample(
    X, y,
    method='nearmiss',
    sampling_strategy='auto'
)

# 方法2: 类别权重
class_weights = resampler.calculate_class_weights(y)
```

### Q: 如何保存和重用预处理流水线？

```python
from BaseDT import Pipeline

# 创建流水线
pipeline = Pipeline([
    ('cleaner', DataCleaner()),
    ('encoder', FeatureEncoder()),
    ('scaler', StandardScaler())
])

# 训练流水线
pipeline.fit(data)

# 保存流水线
pipeline.save('preprocessing_pipeline.pkl')

# 加载流水线
loaded_pipeline = Pipeline.load('preprocessing_pipeline.pkl')

# 应用流水线
processed_data = loaded_pipeline.transform(new_data)
```

## 最佳实践

1. **先理解数据**：使用可视化工具了解数据分布
2. **数据清洗**：处理缺失值和异常值
3. **特征工程**：创造有意义的特征
4. **避免数据泄露**：在划分数据集后再进行预处理
5. **保存中间结果**：方便调试和复现
6. **文档记录**：记录每一步的处理过程
7. **验证结果**：确保预处理没有引入错误

## 参考资料

- [BaseDT官方文档](https://xedu.openxlab.org.cn/docs/basedt)
- [数据预处理教程](https://xedu.openxlab.org.cn/tutorials/preprocessing)
- [特征工程指南](https://xedu.openxlab.org.cn/guides/feature-engineering)