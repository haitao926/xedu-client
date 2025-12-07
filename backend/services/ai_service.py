#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
AI助手服务模块
提供与AI模型的通信接口和功能
"""

import json
import base64
import requests
import io
from typing import Dict, Any, Optional, List
from PIL import Image
import re

from models.config import AIConfig
from utils.logger import get_logger

logger = get_logger(__name__)


class AIService:
    """AI助手服务"""

    def __init__(self, config: AIConfig = None):
        self.config = config or AIConfig()
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'XeduClient/2.0'
        })

    def ask_question(self, question: str, image_data: Optional[str] = None) -> Dict[str, Any]:
        """
        向AI提问

        Args:
            question: 问题文本
            image_data: base64编码的图片数据（可选）

        Returns:
            Dict[str, Any]: AI响应结果
        """
        try:
            # 验证配置
            if not self.config.validate()[0]:
                errors = self.config.validate()[1]
                return {
                    'success': False,
                    'error': f'配置错误: {", ".join(errors)}'
                }

            # 准备消息
            messages = self._prepare_messages(question, image_data)

            # 调用API
            response = self._call_ai_api(messages)

            if response.get('success'):
                return {
                    'success': True,
                    'answer': response.get('content', ''),
                    'usage': response.get('usage', {})
                }
            else:
                return {
                    'success': False,
                    'error': response.get('error', '未知错误')
                }

        except Exception as e:
            logger.error(f"AI提问失败: {e}")
            return {
                'success': False,
                'error': f'处理请求时出错: {str(e)}'
            }

    def _prepare_messages(self, question: str, image_data: Optional[str] = None) -> List[Dict[str, Any]]:
        """准备消息内容"""
        messages = []

        if image_data:
            # 处理图片数据
            processed_image = self._process_image(image_data)
            if processed_image:
                messages.append({
                    "role": "user",
                    "content": [
                        {"type": "text", "text": question},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{processed_image}"
                            }
                        }
                    ]
                })
            else:
                # 图片处理失败，只发送文本
                messages.append({
                    "role": "user",
                    "content": question + "\n\n注意: 图片处理失败，请重新上传图片。"
                })
        else:
            messages.append({
                "role": "user",
                "content": question
            })

        return messages

    def _process_image(self, image_data: str) -> Optional[str]:
        """处理图片数据"""
        try:
            # 移除data URL前缀（如果存在）
            if image_data.startswith('data:'):
                # 提取base64部分
                base64_part = image_data.split(',')[1] if ',' in image_data else image_data[5:]
            else:
                base64_part = image_data

            # 解码base64
            image_bytes = base64.b64decode(base64_part)

            # 使用PIL处理图片
            image = Image.open(io.BytesIO(image_bytes))

            # 检查图片格式和大小
            if image.mode not in ['RGB', 'RGBA']:
                image = image.convert('RGB')

            # 调整图片大小（如果太大）
            max_size = 1024
            if image.width > max_size or image.height > max_size:
                image.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)

            # 重新编码为JPEG并转为base64
            buffer = io.BytesIO()
            image.save(buffer, format='JPEG', quality=85)
            image_bytes = buffer.getvalue()

            # 返回base64编码的图片
            return base64.b64encode(image_bytes).decode('utf-8')

        except Exception as e:
            logger.error(f"处理图片失败: {e}")
            return None

    def _call_ai_api(self, messages: List[Dict[str, Any]]) -> Dict[str, Any]:
        """调用AI API"""
        try:
            headers = {
                "Authorization": f"Bearer {self.config.api_key}",
                "Content-Type": "application/json"
            }

            # 根据不同的AI提供商准备不同的payload
            if "moonshot" in self.config.base_url:
                payload = self._prepare_moonshot_payload(messages)
            else:
                payload = self._prepare_openai_payload(messages)

            logger.info(f"调用AI API: {self.config.base_url}")
            logger.info(f"使用模型: {self.config.model}")

            response = self.session.post(
                f"{self.config.base_url.rstrip('/')}/chat/completions",
                headers=headers,
                json=payload,
                timeout=self.config.timeout
            )

            if response.status_code == 200:
                result = response.json()
                content = result["choices"][0]["message"]["content"]

                return {
                    'success': True,
                    'content': content,
                    'usage': result.get('usage', {})
                }
            else:
                error_msg = f"AI API 调用失败: {response.status_code}"
                try:
                    error_detail = response.json()
                    if 'error' in error_detail:
                        error_msg += f" - {error_detail['error'].get('message', '未知错误')}"
                except:
                    error_msg += f" - {response.text}"

                logger.error(error_msg)
                return {
                    'success': False,
                    'error': error_msg
                }

        except requests.exceptions.Timeout:
            error_msg = f"AI API 调用超时 (超过{self.config.timeout}秒)"
            logger.error(error_msg)
            return {
                'success': False,
                'error': error_msg
            }
        except requests.exceptions.ConnectionError:
            error_msg = "无法连接到AI API服务器"
            logger.error(error_msg)
            return {
                'success': False,
                'error': error_msg
            }
        except Exception as e:
            error_msg = f"AI API 调用异常: {str(e)}"
            logger.error(error_msg)
            return {
                'success': False,
                'error': error_msg
            }

    def _prepare_moonshot_payload(self, messages: List[Dict[str, Any]]) -> Dict[str, Any]:
        """准备Moonshot API的payload"""
        return {
            "model": self.config.model,
            "messages": messages,
            "max_tokens": 2000,
            "temperature": 0.7,
            "stream": False
        }

    def _prepare_openai_payload(self, messages: List[Dict[str, Any]]) -> Dict[str, Any]:
        """准备OpenAI兼容API的payload"""
        return {
            "model": self.config.model,
            "messages": messages,
            "max_tokens": 2000,
            "temperature": 0.7,
            "stream": False
        }

    def test_connection(self) -> Dict[str, Any]:
        """测试AI连接"""
        test_question = "你好，请简单介绍一下你自己。"

        try:
            response = self.ask_question(test_question)
            if response.get('success'):
                return {
                    'success': True,
                    'message': 'AI连接测试成功',
                    'sample_response': response.get('answer', '')[:100] + "..." if response.get('answer') else ''
                }
            else:
                return {
                    'success': False,
                    'message': f'AI连接测试失败: {response.get("error", "未知错误")}'
                }

        except Exception as e:
            return {
                'success': False,
                'message': f'连接测试异常: {str(e)}'
            }

    def update_config(self, config: AIConfig) -> bool:
        """更新配置"""
        try:
            if config.validate()[0]:
                self.config = config
                return True
            else:
                logger.error("AI配置验证失败")
                return False
        except Exception as e:
            logger.error(f"更新AI配置失败: {e}")
            return False

    def get_config_info(self) -> Dict[str, Any]:
        """获取配置信息"""
        return {
            'api_key_configured': bool(self.config.api_key),
            'base_url': self.config.base_url,
            'model': self.config.model,
            'timeout': self.config.timeout,
            'max_history': self.config.max_history,
            'is_valid': self.config.validate()[0]
        }

    @staticmethod
    def sanitize_ai_response(response: str) -> str:
        """清理AI响应内容"""
        if not response:
            return ""

        # 移除可能的系统提示词泄露
        patterns_to_remove = [
            r'作为AI助手，?我',
            r'我是一个AI',
            r'请注意，?我',
            r'请记住，?我',
            r'I am an? AI',
            r'As an? AI'
        ]

        cleaned = response
        for pattern in patterns_to_remove:
            cleaned = re.sub(pattern, '', cleaned, flags=re.IGNORECASE)

        # 清理多余的空白字符
        cleaned = re.sub(r'\n\s*\n\s*\n', '\n\n', cleaned)
        cleaned = cleaned.strip()

        return cleaned


# 全局AI服务实例
_ai_service: Optional[AIService] = None


def get_ai_service() -> AIService:
    """获取全局AI服务实例"""
    global _ai_service
    if _ai_service is None:
        _ai_service = AIService()
    return _ai_service


def update_ai_service_config(config: AIConfig) -> bool:
    """更新AI服务配置"""
    global _ai_service
    service = get_ai_service()
    success = service.update_config(config)
    if success:
        _ai_service = AIService(config)  # 重新创建服务实例
    return success