---
title: "BaseDeploy完整使用指南"
component: "BaseDeploy"
category: "guide"
tags: ["模型部署", "服务化", "容器化", "云部署"]
difficulty: "advanced"
keywords: ["BaseDeploy", "模型部署", "Docker", "FastAPI", "REST API", "Web服务"]
last_updated: "2024-12-04"
---

# BaseDeploy完整使用指南

## 简介

BaseDeploy是XEdu的模型部署库，提供了一站式的模型部署解决方案。它支持将训练好的模型快速部署为Web服务、API接口、移动应用或嵌入式设备，支持多种部署方式和平台。

主要特点：
- 简单的部署API
- 支持多种部署格式（ONNX、TensorRT、OpenVINO等）
- 自动化的性能优化
- 内置的监控和日志
- 容器化支持
- 云平台集成
- 边缘设备部署

## 安装

```bash
pip install BaseDeploy

# 安装可选依赖
pip install BaseDeploy[fastapi]     # FastAPI支持
pip install BaseDeploy[flask]       # Flask支持
pip install BaseDeploy[docker]      # Docker支持
pip install BaseDeploy[tensorrt]    # TensorRT支持
pip install BaseDeploy[openvino]    # OpenVINO支持
pip install BaseDeploy[all]         # 安装所有依赖
```

## 快速开始

### 基础示例

```python
from BaseDeploy import ModelDeployment

# 1. 加载模型
deployment = ModelDeployment()
deployment.load_model('model.pth', framework='pytorch')

# 2. 部署为FastAPI服务
app = deployment.deploy_as_api(
    name='image_classifier',
    input_type='image',
    output_type='json'
)

# 3. 运行服务
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

### 5分钟部署指南

```python
from BaseDeploy import QuickDeploy
from MMEdu import MMClassification

# 训练模型（示例）
model = MMClassification(backbone='ResNet18')
model.train(epochs=10)
model.save('my_model.pth')

# 快速部署
deployer = QuickDeploy()
service = deployer.deploy(
    model_path='my_model.pth',
    framework='pytorch',
    port=8080,
    auto_optimize=True  # 自动优化模型
)

# 测试服务
import requests
response = requests.post(
    'http://localhost:8080/predict',
    files={'image': open('test.jpg', 'rb')}
)
print(response.json())
```

## 模型格式转换

### 1. PyTorch转ONNX

```python
from BaseDeploy.converters import PyTorchToONNX

converter = PyTorchToONNX()

# 基础转换
converter.convert(
    model_path='model.pth',
    output_path='model.onnx',
    input_shape=(1, 3, 224, 224),
    dynamic_axes={'input': {0: 'batch_size'}, 'output': {0: 'batch_size'}}
)

# 带示例输入的转换
import torch
dummy_input = torch.randn(1, 3, 224, 224)

converter.convert(
    model=your_model,
    output_path='model.onnx',
    example_input=dummy_input,
    export_params=True,
    opset_version=11
)
```

### 2. 转换为TensorRT

```python
from BaseDeploy.converters import ONNXToTensorRT

converter = ONNXToTensorRT()

# 转换为TensorRT引擎
converter.convert(
    onnx_path='model.onnx',
    engine_path='model.trt',
    max_batch_size=32,
    max_workspace_size=1 << 30,  # 1GB
    fp16_mode=True,  # 使用半精度
    int8_mode=False  # INT8量化
)
```

### 3. 转换为OpenVINO

```python
from BaseDeploy.converters import PyTorchToOpenVINO

converter = PyTorchToOpenVINO()

converter.convert(
    model_path='model.pth',
    output_dir='openvino_model',
    input_shape=(1, 3, 224, 224),
    mean_values=[123.675, 116.28, 103.53],
    scale_values=[58.395, 57.12, 57.375]
)
```

## Web服务部署

### 1. FastAPI部署

```python
from BaseDeploy import FastAPIDeployer
from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse
import uvicorn

# 创建部署器
deployer = FastAPIDeployer()

# 加载模型
deployer.load_model(
    model_path='model.onnx',
    framework='onnx',
    device='cpu'  # 或 'cuda'
)

# 创建FastAPI应用
app = FastAPI(title="图像分类API", version="1.0.0")

# 定义预测端点
@app.post("/predict")
async def predict(image: UploadFile = File(...)):
    # 预处理图像
    processed_image = deployer.preprocess(await image.read())

    # 推理
    result = deployer.predict(processed_image)

    # 后处理
    response = deployer.postprocess(result)

    return JSONResponse(content=response)

# 添加健康检查端点
@app.get("/health")
async def health_check():
    return {"status": "healthy", "model": "loaded"}

# 添加模型信息端点
@app.get("/model/info")
async def model_info():
    return deployer.get_model_info()

# 运行服务
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

### 2. Flask部署

```python
from BaseDeploy import FlaskDeployer
from flask import Flask, request, jsonify

# 创建部署器
deployer = FlaskDeployer()

# 配置模型
deployer.configure(
    model_path='model.pth',
    framework='pytorch',
    device='cuda'
)

# 创建Flask应用
app = Flask(__name__)

@app.route('/predict', methods=['POST'])
def predict():
    # 获取输入数据
    if 'image' in request.files:
        # 图像输入
        image_file = request.files['image']
        image_data = image_file.read()
        input_data = deployer.preprocess_image(image_data)
    else:
        # JSON输入
        json_data = request.get_json()
        input_data = deployer.preprocess_json(json_data)

    # 推理
    result = deployer.predict(input_data)

    return jsonify({
        'success': True,
        'predictions': result.tolist()
    })

@app.route('/batch_predict', methods=['POST'])
def batch_predict():
    # 批量预测
    json_data = request.get_json()
    batch_data = json_data['data']

    results = []
    for item in batch_data:
        processed = deployer.preprocess_item(item)
        prediction = deployer.predict(processed)
        results.append(prediction)

    return jsonify({
        'success': True,
        'results': results
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
```

### 3. 高级API功能

```python
from BaseDeploy import APIDeployer
from typing import List, Dict
import asyncio

class AdvancedAPI(APIDeployer):
    def __init__(self):
        super().__init__()
        self.setup_endpoints()

    def setup_endpoints(self):
        """设置API端点"""

        @self.app.middleware("http")
        async def add_process_time_header(request, call_next):
            """添加响应时间头"""
            start_time = time.time()
            response = await call_next(request)
            process_time = time.time() - start_time
            response.headers["X-Process-Time"] = str(process_time)
            return response

        @self.app.post("/predict_async")
        async def predict_async(request):
            """异步预测"""
            data = await request.json()

            # 异步处理
            task = asyncio.create_task(
                self.async_predict(data)
            )

            result = await task

            return JSONResponse({
                "task_id": task.get_name(),
                "status": "completed",
                "result": result
            })

        @self.app.post("/predict_stream")
        async def predict_stream(request):
            """流式预测"""
            async def generate():
                data = await request.json()

                # 流式处理
                for chunk in self.stream_predict(data):
                    yield f"data: {chunk}\n\n"

            return StreamingResponse(
                generate(),
                media_type="text/plain"
            )

        @self.app.get("/metrics")
        async def metrics():
            """获取服务指标"""
            return {
                "requests_total": self.metrics.requests_total,
                "avg_latency": self.metrics.avg_latency,
                "error_rate": self.metrics.error_rate,
                "model_load_time": self.metrics.model_load_time
            }
```

## 容器化部署

### 1. 生成Dockerfile

```python
from BaseDeploy.containers import DockerGenerator

generator = DockerGenerator()

# 生成基础Dockerfile
dockerfile = generator.create_dockerfile(
    base_image='python:3.8-slim',
    requirements_file='requirements.txt',
    model_path='model.onnx',
    app_file='app.py',
    expose_port=8000
)

# 保存Dockerfile
generator.save_dockerfile('Dockerfile')

# 生成多阶段构建Dockerfile
dockerfile = generator.create_multistage_dockerfile(
    base_image='python:3.8-slim',
    requirements_file='requirements.txt',
    model_path='model.onnx',
    app_file='app.py',
    optimize_size=True
)
```

### 2. Docker Compose配置

```python
from BaseDeploy.containers import ComposeGenerator

compose_generator = ComposeGenerator()

# 创建服务配置
services = {
    'api': {
        'build': '.',
        'ports': ['8000:8000'],
        'environment': {
            'MODEL_PATH': '/app/model/model.onnx',
            'LOG_LEVEL': 'INFO'
        },
        'volumes': ['./logs:/app/logs'],
        'deploy': {
            'replicas': 3,
            'resources': {
                'limits': {
                    'cpus': '0.5',
                    'memory': '512M'
                }
            }
        }
    },
    'redis': {
        'image': 'redis:alpine',
        'ports': ['6379:6379']
    }
}

# 生成docker-compose.yml
compose_generator.create_compose(
    services=services,
    version='3.8',
    output_file='docker-compose.yml'
)
```

### 3. Kubernetes部署

```python
from BaseDeploy.k8s import K8sGenerator

k8s = K8sGenerator()

# 生成Deployment
deployment = k8s.create_deployment(
    name='model-api',
    image='myregistry/model-api:latest',
    replicas=3,
    resources={
        'requests': {
            'cpu': '100m',
            'memory': '256Mi'
        },
        'limits': {
            'cpu': '500m',
            'memory': '512Mi'
        }
    },
    env_vars={
        'MODEL_PATH': '/app/model',
        'GPU_ENABLED': 'true'
    }
)

# 生成Service
service = k8s.create_service(
    name='model-api-service',
    selector={'app': 'model-api'},
    ports=[80, 8000],
    target_port=8000
)

# 生成Ingress
ingress = k8s.create_ingress(
    name='model-api-ingress',
    host='api.example.com',
    service='model-api-service',
    service_port=8000
)

# 保存所有配置
k8s.save_all_configs('k8s/')
```

## 云平台部署

### 1. AWS部署

```python
from BaseDeploy.cloud import AWSDeployer

aws = AWSDeployer(
    access_key='your-access-key',
    secret_key='your-secret-key',
    region='us-west-2'
)

# 部署到AWS Lambda
aws.deploy_lambda(
    function_name='image-classifier',
    model_path='model.onnx',
    handler='app.handler',
    runtime='python3.8',
    memory_size=1024,
    timeout=30
)

# 部署到SageMaker
aws.deploy_sagemaker(
    model_name='xedu-model',
    model_path='model.tar.gz',
    instance_type='ml.m5.large',
    initial_instance_count=1
)
```

### 2. Azure部署

```python
from BaseDeploy.cloud import AzureDeployer

azure = AzureDeployer(
    subscription_id='your-subscription-id',
    resource_group='my-resource-group'
)

# 部署到Azure Functions
azure.deploy_function(
    function_name='text-processor',
    model_path='model.pkl',
    app_service_plan='my-app-plan',
    storage_account='mystorage'
)

# 部署到Azure ML
azure.deploy_aml(
    model_name='classification-model',
    model_path='model/',
    compute_target='my-cluster',
    environment_name='xedu-env'
)
```

### 3. 私有云部署

```python
from BaseDeploy.cloud import PrivateCloudDeployer

private = PrivateCloudDeployer()

# 创建自定义部署配置
config = private.create_config({
    'cluster_type': 'kubernetes',
    'nodes': [
        {'role': 'master', 'cpu': 4, 'memory': '16G'},
        {'role': 'worker', 'cpu': 8, 'memory': '32G', 'gpu': True}
    ],
    'network': {
        'subnet': '192.168.1.0/24',
        'gateway': '192.168.1.1'
    },
    'storage': {
        'type': 'nfs',
        'capacity': '1TB'
    }
})

# 部署应用
private.deploy(
    config=config,
    model_path='model/',
    service_name='xedu-api',
    replicas=5
)
```

## 性能优化

### 1. 模型优化

```python
from BaseDeploy.optimization import ModelOptimizer

optimizer = ModelOptimizer()

# 量化模型
quantized_model = optimizer.quantize(
    model_path='model.pth',
    quantization_type='int8',  # 'int8', 'fp16', 'dynamic'
    calibration_data='calibration_dataset/'
)

# 剪枝模型
pruned_model = optimizer.prune(
    model_path='model.pth',
    pruning_ratio=0.5,  # 剪枝50%的参数
    method='magnitude'  # 'magnitude', 'gradual'
)

# 知识蒸馏
distilled_model = optimizer.distill(
    teacher_model='large_model.pth',
    student_model='small_model.pth',
    distillation_alpha=0.5,
    temperature=4.0
)
```

### 2. 推理优化

```python
from BaseDeploy.inference import InferenceOptimizer

iopt = InferenceOptimizer()

# 批处理优化
iopt.enable_batching(
    max_batch_size=32,
    batch_timeout_ms=50
)

# 动态批处理
iopt.enable_dynamic_batching(
    preferred_batch_size=[4, 8, 16],
    max_queue_delay_microseconds=100
)

# 模型并行
iopt.enable_model_parallelism(
    pipeline_parallel_degree=2,
    tensor_parallel_degree=4
)
```

### 3. 缓存策略

```python
from BaseDeploy.cache import CacheManager

cache = CacheManager()

# Redis缓存
cache.setup_redis(
    host='redis-server',
    port=6379,
    ttl=3600  # 缓存1小时
)

# 内存缓存
cache.setup_memory(
    max_size=1000,  # 最多缓存1000个结果
    ttl=300
)

@cache.cache_result(ttl=60)
def predict_with_cache(input_data):
    """带缓存的预测函数"""
    return model.predict(input_data)
```

## 监控和日志

### 1. 性能监控

```python
from BaseDeploy.monitoring import PerformanceMonitor

monitor = PerformanceMonitor()

# 启用监控
monitor.enable(
    metrics_port=9090,
    collect_interval=10  # 每10秒收集一次指标
)

# 自定义指标
@monitor.track_metrics
def predict(input_data):
    start_time = time.time()
    result = model.predict(input_data)
    end_time = time.time()

    # 记录指标
    monitor.record_latency(end_time - start_time)
    monitor.record_prediction_count()

    return result

# 健康检查
@monitor.health_check
def check_model_health():
    """检查模型健康状态"""
    if not model.loaded:
        return False, "Model not loaded"
    if memory_usage() > 0.9:
        return False, "High memory usage"
    return True, "Healthy"
```

### 2. 日志管理

```python
from BaseDeploy.logging import DeployLogger

logger = DeployLogger()

# 配置日志
logger.configure(
    level='INFO',
    format='json',
    outputs=['console', 'file', 'elasticsearch'],
    file_path='logs/deployment.log'
)

# 结构化日志
logger.info(
    "Prediction completed",
    extra={
        'request_id': 'req-123',
        'model_version': '1.0.0',
        'input_shape': [1, 3, 224, 224],
        'prediction_time': 0.123,
        'confidence': 0.95
    }
)
```

### 3. 错误追踪

```python
from BaseDeploy.tracing import ErrorTracer

tracer = ErrorTracer()

# 错误捕获
@tracer.catch_errors
def safe_predict(input_data):
    try:
        return model.predict(input_data)
    except Exception as e:
        tracer.log_error(
            error=e,
            context={
                'input_shape': input_data.shape,
                'model_version': model.version
            }
        )
        raise

# 性能追踪
@tracer.trace_performance
def batch_predict(batch_data):
    """批量预测with性能追踪"""
    results = []
    for data in batch_data:
        with tracer.trace_operation('single_predict'):
            result = model.predict(data)
            results.append(result)
    return results
```

## A/B测试和灰度发布

### 1. A/B测试

```python
from BaseDeploy.experiments import ABTestManager

ab_manager = ABTestManager()

# 配置A/B测试
ab_manager.setup_test(
    test_name='model_v1_vs_v2',
    model_a='model_v1.pth',
    model_b='model_v2.pth',
    traffic_split={'A': 0.7, 'B': 0.3}  # 70%流量给v1，30%给v2
)

# 使用A/B测试进行预测
@ab_manager.route_prediction
def predict_with_abtest(input_data, user_id):
    """根据用户ID路由到不同模型"""
    model = ab_manager.get_model(user_id)
    return model.predict(input_data)

# 收集指标
ab_manager.record_metrics(
    model_version='v1',
    user_id='user123',
    prediction_result='cat',
    confidence=0.85,
    latency=0.1
)
```

### 2. 灰度发布

```python
from BaseDeploy.deployment import GrayDeployment

gray = GrayDeployment()

# 配置灰度发布
gray.configure(
    new_model='model_v2.pth',
    old_model='model_v1.pth',
    rollout_strategy={
        'phase1': {'traffic': 0.1, 'duration': '1h'},
        'phase2': {'traffic': 0.3, 'duration': '2h'},
        'phase3': {'traffic': 0.5, 'duration': '4h'},
        'phase4': {'traffic': 1.0, 'duration': 'forever'}
    }
)

# 开始灰度发布
gray.start_rollout()

# 监控发布状态
status = gray.get_rollout_status()
if status['error_rate'] > 0.05:
    gray.rollback()
```

## 实际应用案例

### 1. 实时图像处理服务

```python
from BaseDeploy import RealTimeService
import cv2
import asyncio

class ImageProcessingService(RealTimeService):
    def __init__(self):
        super().__init__()
        self.setup_models()

    def setup_models(self):
        """设置多个模型"""
        self.face_detector = self.load_model('face_detect.onnx')
        self.face_recognizer = self.load_model('face_recognize.onnx')
        self.emotion_analyzer = self.load_model('emotion_analyze.onnx')

    async def process_image_stream(self, image_stream):
        """处理图像流"""
        async for frame in image_stream:
            # 检测人脸
            faces = await self.detect_faces(frame)

            # 识别人脸和情绪
            results = []
            for face in faces:
                identity = await self.recognize_face(face)
                emotion = await self.analyze_emotion(face)

                results.append({
                    'identity': identity,
                    'emotion': emotion,
                    'confidence': emotion['confidence']
                })

            yield results

    async def detect_faces(self, image):
        """异步人脸检测"""
        return await asyncio.to_thread(
            self.face_detector.predict,
            image
        )

# 部署服务
service = ImageProcessingService()
service.deploy(port=8001, workers=4)
```

### 2. 批量推理服务

```python
from BaseDeploy import BatchInferenceService
import pandas as pd

class DataAnalysisService(BatchInferenceService):
    def __init__(self):
        super().__init__()
        self.model = self.load_model('data_analysis.onnx')

    def process_batch(self, data_batch):
        """处理批量数据"""
        results = []

        # 批量预处理
        processed_batch = self.preprocess_batch(data_batch)

        # 批量推理
        predictions = self.model.predict_batch(processed_batch)

        # 后处理
        for i, pred in enumerate(predictions):
            results.append({
                'id': data_batch[i]['id'],
                'prediction': pred,
                'timestamp': datetime.now()
            })

        return results

    def schedule_job(self, schedule='0 */6 * * *'):
        """定时任务（每6小时执行一次）"""
        self.add_scheduled_job(
            func=self.process_new_data,
            schedule=schedule,
            max_retries=3
        )

# 启动批量服务
service = DataAnalysisService()
service.start_scheduler()
service.deploy(port=8002)
```

### 3. 边缘设备部署

```python
from BaseDeploy.edge import EdgeDeployment

class EdgeModelServer(EdgeDeployment):
    def __init__(self):
        super().__init__()
        self.setup_edge_optimizations()

    def setup_edge_optimizations(self):
        """设置边缘优化"""
        # 模型量化
        self.quantize_model('int8')

        # 启用GPU加速
        self.enable_gpu_acceleration()

        # 设置模型缓存
        self.setup_model_cache('/tmp/model_cache')

    def deploy_to_raspberry_pi(self, device_ip):
        """部署到树莓派"""
        self.compress_model()

        self.transfer_to_device(
            device_ip=device_ip,
            model_path='compressed_model.tflite',
            runtime='tflite'
        )

        self.start_edge_service(
            device_ip=device_ip,
            port=5000,
            max_memory='512MB'
        )

    def deploy_to_jetson(self, device_ip):
        """部署到Jetson"""
        self.convert_to_tensorrt()

        self.transfer_to_device(
            device_ip=device_ip,
            model_path='model.trt',
            runtime='tensorrt'
        )

        self.start_edge_service(
            device_ip=device_ip,
            port=5000,
            use_gpu=True
        )

# 部署到边缘设备
edge_server = EdgeModelServer()
edge_server.deploy_to_raspberry_pi('192.168.1.100')
edge_server.deploy_to_jetson('192.168.1.101')
```

## 常见问题

### Q: 如何处理高并发请求？

```python
from BaseDeploy.scaling import AutoScaler

# 设置自动扩缩容
scaler = AutoScaler()

scaler.configure(
    min_instances=2,
    max_instances=20,
    target_cpu=70,  # CPU使用率超过70%时扩容
    target_memory=80,  # 内存使用率超过80%时扩容
    scale_up_cooldown=300,  # 扩容冷却时间
    scale_down_cooldown=600  # 缩容冷却时间
)

# 启用自动扩缩容
scaler.enable()
```

### Q: 如何保证服务的可靠性？

```python
from BaseDeploy.reliability import HealthChecker, CircuitBreaker

# 健康检查
health_checker = HealthChecker()
health_checker.add_check('model', check_model_health)
health_checker.add_check('database', check_database_connection)
health_checker.add_check('redis', check_redis_connection)

# 熔断器
circuit_breaker = CircuitBreaker(
    failure_threshold=5,  # 失败5次后打开熔断
    recovery_timeout=60,  # 60秒后尝试恢复
    expected_exception=Exception
)

@circuit_breaker
def safe_predict(input_data):
    return model.predict(input_data)
```

### Q: 如何更新生产模型？

```python
from BaseDeploy.update import ModelUpdater

updater = ModelUpdater()

# 零停机更新
updater.zero_downtime_update(
    new_model_path='model_v2.pth',
    backup_old_model=True,
    health_check_endpoint='/health',
    rollback_on_failure=True
)

# 蓝绿部署
updater.blue_green_deployment(
    green_model='model_v2.pth',
    health_check_duration=30,
    switch_traffic=True
)
```

## 最佳实践

1. **版本管理**：始终管理好模型版本
2. **渐进式部署**：使用灰度发布降低风险
3. **监控告警**：设置完善的监控和告警
4. **性能优化**：针对部署环境优化模型
5. **安全考虑**：实现认证和授权机制
6. **文档记录**：维护部署文档
7. **备份策略**：制定数据备份和恢复计划

## 参考资料

- [BaseDeploy官方文档](https://xedu.openxlab.org.cn/docs/basedeploy)
- [Docker部署指南](https://xedu.openxlab.org.cn/guides/docker-deployment)
- [Kubernetes部署教程](https://xedu.openxlab.org.cn/tutorials/k8s-deployment)
- [性能优化手册](https://xedu.openxlab.org.cn/handbooks/performance-optimization)