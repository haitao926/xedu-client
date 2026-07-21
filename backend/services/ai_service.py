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
from urllib.parse import urlparse

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

    def ask_question(
        self,
        question: str,
        image_data: Optional[str] = None,
        history: List[Dict[str, str]] = None,
        request_context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        向AI提问

        Args:
            question: 问题文本
            image_data: base64编码的图片数据（可选）
            history: 历史对话记录（可选）

        Returns:
            Dict[str, Any]: AI响应结果
        """
        try:
            # 友好提示未配置 API Key 的情况
            if not self.config.api_key:
                return {
                    "success": False,
                    "error": "AI 未配置：请先在设置中填写 API Key",
                }

            # 验证配置
            if not self.config.validate()[0]:
                errors = self.config.validate()[1]
                return {
                    'success': False,
                    'error': f'配置错误: {", ".join(errors)}'
                }

            # 准备消息
            messages = self._prepare_messages(question, image_data, history, request_context=request_context)

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

    def _prepare_messages(
        self,
        question: str,
        image_data: Optional[str] = None,
        history: List[Dict[str, str]] = None,
        request_context: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        """准备消息内容"""
        messages = []
        request_context = request_context or {}
        experience_mode = str(request_context.get("experience_mode") or "").strip().lower()
        is_teacher = experience_mode == "teacher"
        system_prompt = (
            "你是 XEdu 教师助教，专门帮助教师完成课程整理、课堂准备、实验设计和教学支持。"
            "回答要优先围绕课程结构、实验组织、教学步骤、课堂执行和 AI 工具使用。"
        ) if is_teacher else (
            "你是 XEdu 学习助手，专门帮助学生理解当前课程、实验任务、Scratch 步骤、Python 代码和报错原因。"
            "回答必须面向学生，语言清晰、具体、鼓励式。"
            "优先结合当前学习上下文解释学生正在做什么，再给下一步。"
            "遇到报错时，先判断是否有足够的错误信息；缺少信息时请学生补充完整报错、代码或截图。"
            "不要执行教师管理、课程打包或发布等操作。"
            "不要声称你已经修改、运行或发布了任何资源。"
        )

        # 添加系统提示
        messages.append({
            "role": "system",
            "content": system_prompt
        })

        student_context_prompt = ""
        if not is_teacher:
            student_context_prompt = self._build_student_context_prompt(request_context)
        if student_context_prompt:
            messages.append({
                "role": "system",
                "content": student_context_prompt,
            })

        # 处理历史消息
        # 前端发送的 history 包含当前问题作为最后一条。
        # 我们取 history[:-1] 作为上下文，最后一条重新构建以包含可能的图片。
        if history and len(history) > 0:
            # 简单验证并添加历史上下文
            # 注意：实际生产中可能需要限制历史长度以防 token 超出
            context_messages = history[:-1]
            for msg in context_messages:
                if 'role' in msg and 'content' in msg:
                    messages.append({
                        "role": msg['role'],
                        "content": msg['content']
                    })

        # 准备当前用户消息
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

    def _build_student_context_prompt(self, request_context: Dict[str, Any]) -> str:
        context = request_context.get("context") if isinstance(request_context.get("context"), dict) else {}
        course = context.get("course") if isinstance(context.get("course"), dict) else {}
        experiment_context = (
            context.get("experiment_context")
            if isinstance(context.get("experiment_context"), dict)
            else {}
        )
        section = (
            experiment_context.get("section")
            if isinstance(experiment_context.get("section"), dict)
            else {}
        )
        experiment = (
            experiment_context.get("experiment")
            if isinstance(experiment_context.get("experiment"), dict)
            else {}
        )
        entries = (
            experiment_context.get("entries")
            if isinstance(experiment_context.get("entries"), dict)
            else {}
        )

        lines = []
        if course.get("title"):
            lines.append(f"当前课程：{course.get('title')}")
        if section.get("title"):
            lines.append(f"当前课节：{section.get('title')}")
        if experiment.get("title"):
            lines.append(f"当前实验：{experiment.get('title')}")
        if experiment.get("description"):
            lines.append(f"实验说明：{experiment.get('description')}")

        entry_labels = {
            "html": "HTML 体验页",
            "blockly": "旧图形资源（不支持）",
            "notebook": "Notebook 资源",
            "python": "Python 资源",
        }
        for key, label in entry_labels.items():
            entry = entries.get(key)
            if isinstance(entry, dict) and entry.get("path"):
                lines.append(f"{label}：{entry.get('path')}")

        if not lines:
            return ""
        return "当前学习上下文：\n" + "\n".join(f"- {line}" for line in lines)

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

            # JPEG 不支持透明通道，统一转成 RGB，避免 RGBA 图片处理失败
            if image.mode != 'RGB':
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
            api_mode = self._resolve_api_mode()
            endpoint_path = "/responses" if api_mode == "responses" else "/chat/completions"
            payload = (
                self._prepare_responses_payload(messages)
                if api_mode == "responses"
                else self._prepare_chat_completions_payload(messages)
            )

            logger.info(f"调用AI API: {self.config.base_url}")
            logger.info(f"使用模型: {self.config.model}")
            logger.info(f"AI 接口类型: {api_mode}")

            response = self.session.post(
                f"{self.config.base_url.rstrip('/')}{endpoint_path}",
                headers=headers,
                json=payload,
                timeout=self.config.timeout
            )

            if response.status_code == 200:
                result = response.json()
                if api_mode == "responses":
                    content = self._extract_responses_text(result)
                else:
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
                    if isinstance(error_detail, dict):
                        provider_error = error_detail.get("error")
                        if isinstance(provider_error, dict):
                            provider_message = provider_error.get("message")
                        elif isinstance(provider_error, str):
                            provider_message = provider_error
                        else:
                            provider_message = error_detail.get("message")
                        if provider_message:
                            error_msg += f" - {provider_message}"
                except ValueError:
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

    def _resolve_api_mode(self) -> str:
        configured = str(getattr(self.config, "api_mode", "auto") or "auto").strip().lower()
        base_url = str(getattr(self.config, "base_url", "") or "").strip()
        hostname = (urlparse(base_url).hostname or "").lower()

        # These providers expose their native models through Chat Completions.
        if (
            hostname in {"api.moonshot.cn", "api.deepseek.com"}
            or hostname.endswith(".moonshot.cn")
            or hostname.endswith(".deepseek.com")
        ):
            return "chat_completions"

        if configured in {"responses", "chat_completions"}:
            return configured

        if hostname == "api.openai.com" or hostname.endswith(".openai.com"):
            return "responses"
        return "chat_completions"

    def _prepare_chat_completions_payload(self, messages: List[Dict[str, Any]]) -> Dict[str, Any]:
        """准备 Chat Completions payload"""
        return {
            "model": self.config.model,
            "messages": messages,
        }

    def _prepare_responses_payload(self, messages: List[Dict[str, Any]]) -> Dict[str, Any]:
        """准备 OpenAI Responses API payload"""
        return {
            "model": self.config.model,
            "input": [self._convert_message_to_responses_input(message) for message in messages],
        }

    def _convert_message_to_responses_input(self, message: Dict[str, Any]) -> Dict[str, Any]:
        role = str(message.get("role") or "user").strip().lower()
        if role not in {"user", "assistant", "system", "developer"}:
            role = "user"

        content = message.get("content", "")
        content_items: List[Dict[str, Any]] = []
        if isinstance(content, str):
            content_items.append({"type": "input_text", "text": content})
        elif isinstance(content, list):
            for item in content:
                if not isinstance(item, dict):
                    continue
                item_type = item.get("type")
                if item_type == "text" and item.get("text"):
                    content_items.append({"type": "input_text", "text": item["text"]})
                elif item_type == "input_text" and item.get("text"):
                    content_items.append({"type": "input_text", "text": item["text"]})
                elif item_type in {"image_url", "input_image"}:
                    raw_image = item.get("image_url")
                    image_url = raw_image.get("url") if isinstance(raw_image, dict) else raw_image
                    if image_url:
                        content_items.append({
                            "type": "input_image",
                            "image_url": image_url,
                            "detail": "auto",
                        })

        if not content_items:
            content_items.append({"type": "input_text", "text": str(content or "")})

        return {
            "type": "message",
            "role": role,
            "content": content_items,
        }

    def _extract_responses_text(self, result: Dict[str, Any]) -> str:
        texts: List[str] = []
        output = result.get("output")
        if isinstance(output, list):
            for item in output:
                if not isinstance(item, dict) or item.get("type") != "message":
                    continue
                content_items = item.get("content")
                if not isinstance(content_items, list):
                    continue
                for content_item in content_items:
                    if not isinstance(content_item, dict):
                        continue
                    if content_item.get("type") == "output_text" and content_item.get("text"):
                        texts.append(str(content_item["text"]))
                    elif content_item.get("type") == "refusal" and content_item.get("refusal"):
                        texts.append(str(content_item["refusal"]))

        if texts:
            return "\n".join(part for part in texts if part).strip()

        if isinstance(result.get("output_text"), str) and result.get("output_text").strip():
            return result["output_text"].strip()

        raise ValueError("Responses API 未返回可解析的文本内容")

    def test_connection(self) -> Dict[str, Any]:
        """测试AI连接"""
        test_question = "你好，请简单介绍一下你自己。"

        try:
            if not self.config.api_key:
                return {
                    "success": False,
                    "message": "AI 未配置：请先在设置中填写 API Key",
                }

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
            'api_mode': getattr(self.config, "api_mode", "auto"),
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
