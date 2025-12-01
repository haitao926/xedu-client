"""
后端日志工具
提供统一的日志记录功能
"""

import logging
import sys
from pathlib import Path
from datetime import datetime
from typing import Optional
import json


class ColoredFormatter(logging.Formatter):
    """带颜色的日志格式化器"""

    # ANSI 颜色代码
    COLORS = {
        'DEBUG': '\033[36m',    # 青色
        'INFO': '\033[32m',     # 绿色
        'WARNING': '\033[33m',  # 黄色
        'ERROR': '\033[31m',    # 红色
        'CRITICAL': '\033[35m', # 紫色
        'RESET': '\033[0m'      # 重置
    }

    def format(self, record):
        # 添加颜色
        if record.levelname in self.COLORS:
            record.levelname = f"{self.COLORS[record.levelname]}{record.levelname}{self.COLORS['RESET']}"

        return super().format(record)


class JSONFormatter(logging.Formatter):
    """JSON 格式的日志格式化器"""

    def format(self, record):
        log_data = {
            'timestamp': datetime.fromtimestamp(record.created).isoformat(),
            'level': record.levelname,
            'message': record.getMessage(),
            'module': record.module,
            'function': record.funcName,
            'line': record.lineno
        }

        # 添加异常信息
        if record.exc_info:
            log_data['exception'] = self.formatException(record.exc_info)

        # 添加额外字段
        if hasattr(record, 'extra'):
            log_data.update(record.extra)

        return json.dumps(log_data, ensure_ascii=False)


class BackendLogger:
    """后端日志管理器"""

    def __init__(self, name: str = "jupyter_backend"):
        self.name = name
        self.logger = logging.getLogger(name)
        self.setup_logger()

    def setup_logger(self):
        """设置日志器"""
        # 清除现有处理器
        self.logger.handlers.clear()

        # 设置日志级别
        self.logger.setLevel(logging.DEBUG)

        # 控制台处理器
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setLevel(logging.INFO)

        # 使用带颜色的格式化器
        console_formatter = ColoredFormatter(
            fmt='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        console_handler.setFormatter(console_formatter)
        self.logger.addHandler(console_handler)

        # 文件处理器
        log_dir = Path(__file__).parent.parent.parent / "logs"
        log_dir.mkdir(exist_ok=True)

        # 普通日志文件
        log_file = log_dir / f"{self.name}.log"
        file_handler = logging.FileHandler(log_file, encoding='utf-8')
        file_handler.setLevel(logging.DEBUG)

        file_formatter = logging.Formatter(
            fmt='%(asctime)s [%(levelname)s] %(name)s:%(lineno)d: %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        file_handler.setFormatter(file_formatter)
        self.logger.addHandler(file_handler)

        # JSON 格式日志文件（便于分析）
        json_log_file = log_dir / f"{self.name}.json"
        json_handler = logging.FileHandler(json_log_file, encoding='utf-8')
        json_handler.setLevel(logging.INFO)
        json_handler.setFormatter(JSONFormatter())
        self.logger.addHandler(json_handler)

    def debug(self, message: str, **kwargs):
        """调试日志"""
        self._log(logging.DEBUG, message, **kwargs)

    def info(self, message: str, **kwargs):
        """信息日志"""
        self._log(logging.INFO, message, **kwargs)

    def warning(self, message: str, **kwargs):
        """警告日志"""
        self._log(logging.WARNING, message, **kwargs)

    def error(self, message: str, **kwargs):
        """错误日志"""
        self._log(logging.ERROR, message, **kwargs)

    def critical(self, message: str, **kwargs):
        """严重错误日志"""
        self._log(logging.CRITICAL, message, **kwargs)

    def exception(self, message: str, **kwargs):
        """异常日志（包含堆栈跟踪）"""
        self._log(logging.ERROR, message, exc_info=True, **kwargs)

    def _log(self, level: int, message: str, **kwargs):
        """内部日志方法"""
        if kwargs.get('exc_info'):
            self.logger.log(level, message, exc_info=True)
        elif kwargs.get('extra'):
            self.logger.log(level, message, extra=kwargs['extra'])
        else:
            self.logger.log(level, message)

    def log_api_request(self, endpoint: str, method: str, data: Optional[dict] = None):
        """记录 API 请求"""
        self.info(f"API Request: {method} {endpoint}", extra={
            'type': 'api_request',
            'endpoint': endpoint,
            'method': method,
            'data': data or {}
        })

    def log_api_response(self, endpoint: str, status_code: int, success: bool, data: Optional[dict] = None):
        """记录 API 响应"""
        self.info(f"API Response: {endpoint} - {status_code} {'✓' if success else '✗'}", extra={
            'type': 'api_response',
            'endpoint': endpoint,
            'status_code': status_code,
            'success': success,
            'data': data or {}
        })

    def log_jupyter_action(self, action: str, success: bool, details: Optional[dict] = None):
        """记录 Jupyter 操作"""
        status = "✓" if success else "✗"
        self.info(f"Jupyter {action}: {status}", extra={
            'type': 'jupyter_action',
            'action': action,
            'success': success,
            'details': details or {}
        })

    def log_config_change(self, key: str, old_value, new_value):
        """记录配置变更"""
        self.info(f"Config changed: {key} = {new_value} (was: {old_value})", extra={
            'type': 'config_change',
            'key': key,
            'old_value': old_value,
            'new_value': new_value
        })


# 创建默认日志器实例
logger = BackendLogger()

# 导出便捷函数
def get_logger(name: Optional[str] = None) -> BackendLogger:
    """获取日志器实例"""
    if name:
        return BackendLogger(name)
    return logger


def setup_logging(level: str = "INFO", log_dir: Optional[Path] = None):
    """设置全局日志配置"""
    if log_dir:
        log_dir.mkdir(parents=True, exist_ok=True)

    logging_level = getattr(logging, level.upper(), logging.INFO)

    # 设置根日志器级别
    logging.getLogger().setLevel(logging_level)

    logger.info(f"Logging configured at level: {level}")
    if log_dir:
        logger.info(f"Log directory: {log_dir}")


# 日志装饰器
def log_function_call(logger_instance: Optional[BackendLogger] = None):
    """函数调用日志装饰器"""
    def decorator(func):
        def wrapper(*args, **kwargs):
            log = logger_instance or logger
            log.debug(f"Calling function: {func.__name__}")
            try:
                result = func(*args, **kwargs)
                log.debug(f"Function {func.__name__} completed successfully")
                return result
            except Exception as e:
                log.exception(f"Function {func.__name__} failed with error: {e}")
                raise
        return wrapper
    return decorator


def log_api_endpoint(endpoint_name: str):
    """API 端点日志装饰器"""
    def decorator(func):
        def wrapper(*args, **kwargs):
            log = logger
            log.log_api_request(endpoint_name, 'POST', kwargs.get('json'))
            try:
                result = func(*args, **kwargs)
                success = isinstance(result, dict) and result.get('success', False)
                log.log_api_response(endpoint_name, 200, success, result)
                return result
            except Exception as e:
                log.log_api_response(endpoint_name, 500, False, {'error': str(e)})
                raise
        return wrapper
    return decorator