#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Xedu Client 后端入口

这一层只负责把 backend 包加入 sys.path，然后构建并运行 Flask 应用。
业务逻辑、路由以及服务都在 backend/api 模块中实现，方便测试和复用。
"""

from __future__ import annotations

import sys
from pathlib import Path
import os

BASE_DIR = Path(__file__).resolve().parent

# 确保 backend 包可以被导入
sys.path.insert(0, str(BASE_DIR))

from api.app import create_app  # noqa: E402
from utils.logger import get_logger  # noqa: E402


logger = get_logger(__name__)


def main() -> None:
    """构建并运行 Flask 应用。"""
    app = create_app()

    logger.info("Xedu Client API Server 启动中 (port=5000)")
    app.run(host="0.0.0.0", port=5000, debug=False)


if __name__ == "__main__":
    main()
