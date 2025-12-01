#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
配置管理服务
提供配置的持久化存储、加载、验证和迁移功能
"""

import json
import os
import sys
from pathlib import Path
from typing import Optional, Dict, Any, Tuple
import logging

# 导入配置模型
try:
    from models.config import AppConfig, JupyterConfig, UIConfig, AIConfig
    from utils.logger import get_logger
    logger = get_logger(__name__)
except ImportError:
    # 简化模式
    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger(__name__)

    # 简化的配置类
    class AppConfig:
        def __init__(self):
            self.python_executable = ""
            self.project_dir = ""
            self.activate_script = ""
            self.jupyter_port = 8888
            self.use_notebook = False
            self.auto_restart = False
            self.check_interval = 2000
            self.max_restarts = 3
            self.theme = "dark"
            self.language = "zh-CN"
            self.auto_refresh = True
            self.show_notifications = True

        def to_dict(self):
            return {
                "python_executable": self.python_executable,
                "project_dir": self.project_dir,
                "activate_script": self.activate_script,
                "jupyter_port": self.jupyter_port,
                "use_notebook": self.use_notebook,
                "auto_restart": self.auto_restart,
                "check_interval": self.check_interval,
                "max_restarts": self.max_restarts,
                "theme": self.theme,
                "language": self.language,
                "auto_refresh": self.auto_refresh,
                "show_notifications": self.show_notifications
            }

        @classmethod
        def from_dict(cls, data):
            config = cls()
            for key, value in data.items():
                if hasattr(config, key):
                    setattr(config, key, value)
            return config


class ConfigService:
    """配置管理服务"""

    def __init__(self, config_dir: Optional[Path] = None):
        """
        初始化配置服务

        Args:
            config_dir: 配置目录，如果为None则使用默认路径
        """
        if config_dir is None:
            # 获取配置目录
            if getattr(sys, 'frozen', False):
                # 打包后的应用
                if sys.platform == "win32":
                    config_dir = Path(os.environ['APPDATA']) / 'XeduClient'
                else:
                    config_dir = Path.home() / '.xeduclient'
            else:
                # 开发环境
                config_dir = Path(__file__).parent.parent.parent.parent

        self.config_dir = Path(config_dir)
        self.config_file = self.config_dir / 'config.json'
        self.backup_dir = self.config_dir / 'backups'

        # 确保目录存在
        self.config_dir.mkdir(parents=True, exist_ok=True)
        self.backup_dir.mkdir(parents=True, exist_ok=True)

        # 当前配置
        self._config: Optional[AppConfig] = None

        logger.info(f"配置服务初始化: {self.config_file}")

    def load_config(self) -> AppConfig:
        """
        加载配置

        Returns:
            AppConfig: 应用配置对象
        """
        if self._config is not None:
            return self._config

        if self.config_file.exists():
            try:
                with open(self.config_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)

                # 检查是否需要迁移配置
                data = self._migrate_config(data)

                self._config = AppConfig.from_dict(data)
                logger.info("配置文件加载成功")
                return self._config

            except Exception as e:
                logger.error(f"加载配置文件失败: {e}")
                # 尝试加载备份
                backup_config = self._load_backup_config()
                if backup_config:
                    self._config = backup_config
                    return self._config

        # 如果没有配置文件，创建默认配置
        self._config = AppConfig()
        self._save_config_internal(self._config)
        logger.info("创建默认配置")
        return self._config

    def save_config(self, config: AppConfig) -> bool:
        """
        保存配置

        Args:
            config: 要保存的配置

        Returns:
            bool: 是否保存成功
        """
        try:
            # 验证配置
            if hasattr(config, 'validate'):
                is_valid, errors = config.validate()
                if not is_valid:
                    logger.error(f"配置验证失败: {errors}")
                    return False

            # 创建备份
            self._create_backup()

            # 保存配置
            success = self._save_config_internal(config)
            if success:
                self._config = config
                logger.info("配置保存成功")

            return success

        except Exception as e:
            logger.error(f"保存配置失败: {e}")
            return False

    def _save_config_internal(self, config: AppConfig) -> bool:
        """内部保存配置方法"""
        try:
            # 写入临时文件
            temp_file = self.config_file.with_suffix('.tmp')
            with open(temp_file, 'w', encoding='utf-8') as f:
                json.dump(config.to_dict(), f, indent=2, ensure_ascii=False)

            # 原子性替换
            temp_file.replace(self.config_file)
            return True

        except Exception as e:
            logger.error(f"内部保存配置失败: {e}")
            return False

    def _migrate_config(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        配置迁移

        Args:
            data: 原始配置数据

        Returns:
            Dict[str, Any]: 迁移后的配置数据
        """
        # 检查配置版本
        version = data.get('version', '1.0.0')

        if version == '1.0.0':
            # 从旧版本配置迁移
            logger.info("检测到旧版本配置，开始迁移...")

            # 合并扁平化的配置到新结构
            migrated = {
                'version': '2.0.0',
                'jupyter': {},
                'ui': {},
                'ai': {}
            }

            # 迁移Jupyter相关配置
            jupyter_fields = [
                'python_executable', 'project_dir', 'activate_script',
                'jupyter_port', 'use_notebook', 'auto_restart',
                'check_interval', 'max_restarts'
            ]

            for field in jupyter_fields:
                if field in data:
                    migrated['jupyter'][field] = data[field]

            # 设置默认UI配置
            migrated['ui'] = {
                'theme': data.get('theme', 'dark'),
                'language': data.get('language', 'zh-CN'),
                'auto_refresh': data.get('auto_refresh', True),
                'refresh_interval': data.get('refresh_interval', 2000),
                'show_notifications': data.get('show_notifications', True),
                'minimize_to_tray': data.get('minimize_to_tray', True),
                'auto_open_browser': data.get('auto_open_browser', True)
            }

            # 设置默认AI配置
            migrated['ai'] = {
                'api_key': '',
                'base_url': 'https://api.moonshot.cn/v1',
                'model': 'moonshot-v1-8k-vision-preview',
                'max_history': 50,
                'timeout': 30
            }

            logger.info("配置迁移完成")
            return migrated

        return data

    def _create_backup(self) -> bool:
        """创建配置备份"""
        if not self.config_file.exists():
            return True

        try:
            from datetime import datetime
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            backup_file = self.backup_dir / f'config_{timestamp}.json'

            # 复制配置文件到备份目录
            import shutil
            shutil.copy2(self.config_file, backup_file)

            # 保留最近10个备份
            self._cleanup_backups(keep_count=10)

            logger.debug(f"创建配置备份: {backup_file}")
            return True

        except Exception as e:
            logger.error(f"创建配置备份失败: {e}")
            return False

    def _load_backup_config(self) -> Optional[AppConfig]:
        """加载最新的备份配置"""
        try:
            backup_files = list(self.backup_dir.glob('config_*.json'))
            if not backup_files:
                return None

            # 获取最新的备份文件
            latest_backup = max(backup_files, key=lambda f: f.stat().st_mtime)

            with open(latest_backup, 'r', encoding='utf-8') as f:
                data = json.load(f)

            config = AppConfig.from_dict(data)
            logger.info(f"从备份加载配置: {latest_backup}")
            return config

        except Exception as e:
            logger.error(f"加载备份配置失败: {e}")
            return None

    def _cleanup_backups(self, keep_count: int = 10):
        """清理旧备份文件"""
        try:
            backup_files = list(self.backup_dir.glob('config_*.json'))
            backup_files.sort(key=lambda f: f.stat().st_mtime, reverse=True)

            # 删除多余的备份
            for backup_file in backup_files[keep_count:]:
                backup_file.unlink()
                logger.debug(f"删除旧备份: {backup_file}")

        except Exception as e:
            logger.error(f"清理备份文件失败: {e}")

    def reset_config(self) -> bool:
        """
        重置配置为默认值

        Returns:
            bool: 是否重置成功
        """
        try:
            # 创建备份
            self._create_backup()

            # 创建默认配置
            self._config = AppConfig()
            success = self._save_config_internal(self._config)

            if success:
                logger.info("配置已重置为默认值")

            return success

        except Exception as e:
            logger.error(f"重置配置失败: {e}")
            return False

    def export_config(self, export_path: Path) -> bool:
        """
        导出配置到指定路径

        Args:
            export_path: 导出路径

        Returns:
            bool: 是否导出成功
        """
        try:
            config = self.load_config()

            with open(export_path, 'w', encoding='utf-8') as f:
                json.dump(config.to_dict(), f, indent=2, ensure_ascii=False)

            logger.info(f"配置已导出到: {export_path}")
            return True

        except Exception as e:
            logger.error(f"导出配置失败: {e}")
            return False

    def import_config(self, import_path: Path) -> bool:
        """
        从指定路径导入配置

        Args:
            import_path: 导入路径

        Returns:
            bool: 是否导入成功
        """
        try:
            if not import_path.exists():
                logger.error(f"配置文件不存在: {import_path}")
                return False

            with open(import_path, 'r', encoding='utf-8') as f:
                data = json.load(f)

            config = AppConfig.from_dict(data)
            return self.save_config(config)

        except Exception as e:
            logger.error(f"导入配置失败: {e}")
            return False

    def get_config_info(self) -> Dict[str, Any]:
        """获取配置信息"""
        config = self.load_config()

        return {
            'config_file': str(self.config_file),
            'config_exists': self.config_file.exists(),
            'config_modified': self.config_file.stat().st_mtime if self.config_file.exists() else None,
            'backup_count': len(list(self.backup_dir.glob('config_*.json'))),
            'config_preview': config.to_dict()
        }


# 全局配置服务实例
_config_service: Optional[ConfigService] = None


def get_config_service() -> ConfigService:
    """获取全局配置服务实例"""
    global _config_service
    if _config_service is None:
        _config_service = ConfigService()
    return _config_service


def load_config() -> AppConfig:
    """加载配置的便捷函数"""
    return get_config_service().load_config()


def save_config(config: AppConfig) -> bool:
    """保存配置的便捷函数"""
    return get_config_service().save_config(config)