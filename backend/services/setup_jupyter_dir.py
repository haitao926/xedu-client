#!/usr/bin/env python3
"""
快速设置 Jupyter 项目目录
这个脚本会帮助你配置 Jupyter Notebook 的工作目录
"""

import os
import sys
from pathlib import Path

def setup_jupyter_directory():
    """交互式设置 Jupyter 目录"""

    print("=" * 60)
    print(" Jupyter Notebook 项目目录配置向导")
    print("=" * 60)
    print()

    # 获取用户输入的项目路径
    while True:
        print("请输入你的项目目录路径：")
        print("示例：")
        print("  Windows: D:\\project\\xedu-client")
        print("  Linux/Mac: /home/user/my-project")
        print()
        project_path = input("项目目录路径: ").strip()

        if not project_path:
            print("❌ 路径不能为空，请重新输入\n")
            continue

        # 验证路径
        path = Path(project_path).expanduser().resolve()

        if not path.exists():
            print(f"❌ 路径不存在: {path}")
            print("是否要创建此目录？ (y/n): ", end="")
            create = input().strip().lower()
            if create == 'y':
                try:
                    path.mkdir(parents=True, exist_ok=True)
                    print(f"✅ 目录已创建: {path}")
                except Exception as e:
                    print(f"❌ 创建目录失败: {e}")
                    continue
            else:
                continue

        if not path.is_dir():
            print(f"❌ 路径不是目录: {path}")
            continue

        print(f"✅ 目录验证成功: {path}")
        break

    print()
    print("-" * 60)
    print("选择配置方式：")
    print("1. 保存到配置文件（推荐）")
    print("2. 设置环境变量")
    print("3. 同时使用两种方式")
    print()
    choice = input("请选择 (1-3): ").strip()

    if choice in ['1', '3']:
        save_to_config_file(path)

    if choice in ['2', '3']:
        setup_environment_variable(path)

    print()
    print("=" * 60)
    print("配置完成！")
    print("=" * 60)
    print()
    print("启动 Jupyter 的方式：")
    print()
    print("方式 1: 使用 Xedu Client")
    print("  - 在前端界面中输入项目路径")
    print("  - 点击确认并启动")
    print()
    print("方式 2: 直接启动 Jupyter")
    print("  - 确保环境变量已设置：")
    if choice in ['2', '3']:
        print(f"    Windows: set JUPYTER_PROJECT_DIR={path}")
        print(f"    Linux/Mac: export JUPYTER_PROJECT_DIR={path}")
    print()
    print("现在可以启动 Jupyter 了！")
    print()


def save_to_config_file(project_path):
    """保存到配置文件"""
    print("\n正在保存到配置文件...")

    # 查找 Jupyter 配置目录
    try:
        from jupyter_core.paths import jupyter_config_dir
        config_dir = jupyter_config_dir()
    except ImportError:
        # 如果没有 jupyter_core，手动查找
        if os.name == 'nt':  # Windows
            config_dir = Path.home() / '.jupyter'
        else:  # Unix-like
            config_dir = Path.home() / '.jupyter'

    config_dir = Path(config_dir)
    config_file = config_dir / 'jupyter_notebook_config.py'

    # 创建配置目录
    try:
        config_dir.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        print(f"❌ 创建配置目录失败: {e}")
        return False

    # 创建或追加配置
    config_content = f'''
# Jupyter Notebook 配置文件
# 由 Xedu Client 自动生成
# 项目目录: {project_path}

c.ServerApp.ip = '0.0.0.0'
c.ServerApp.port = 8888
c.ServerApp.open_browser = False
c.ServerApp.allow_root = False
c.ServerApp.notebook_dir = r'{project_path}'
c.ServerApp.token = ''
c.ServerApp.password = ''
c.ServerApp.disable_check_xsrf = True
c.ServerApp.allow_origin = '*'
'''

    try:
        # 如果文件已存在，先备份
        if config_file.exists():
            backup_file = config_file.with_suffix('.py.bak')
            config_file.rename(backup_file)
            print(f"✅ 已备份原配置文件到: {backup_file}")

        # 写入新配置
        with open(config_file, 'w', encoding='utf-8') as f:
            f.write(config_content)

        print(f"✅ 配置已保存到: {config_file}")
        return True

    except Exception as e:
        print(f"❌ 保存配置失败: {e}")
        return False


def setup_environment_variable(project_path):
    """设置环境变量"""
    print("\n正在设置环境变量...")

    # Windows 批处理脚本
    if os.name == 'nt':
        batch_file = Path(project_path).parent / 'set_jupyter_env.bat'
        batch_content = f'''@echo off
REM 设置 Jupyter 项目目录环境变量
REM 使用方法：双击运行此脚本或在命令提示符中执行

set JUPYTER_PROJECT_DIR={project_path}

echo Jupyter 项目目录已设置: %JUPYTER_PROJECT_DIR%
echo.
echo 要使环境变量永久生效，请将此脚本添加到启动项或手动添加到系统环境变量。
echo.
pause
'''
        try:
            with open(batch_file, 'w', encoding='gbk') as f:
                f.write(batch_content)
            print(f"✅ 已创建环境变量设置脚本: {batch_file}")
            print("   双击运行此脚本可设置临时环境变量")
        except Exception as e:
            print(f"❌ 创建脚本失败: {e}")

    # Linux/Mac Shell 脚本
    else:
        sh_file = Path(project_path).parent / 'set_jupyter_env.sh'
        sh_content = f'''#!/bin/bash
# 设置 Jupyter 项目目录环境变量
# 使用方法：source set_jupyter_env.sh

export JUPYTER_PROJECT_DIR="{project_path}"

echo "Jupyter 项目目录已设置: $JUPYTER_PROJECT_DIR"
echo ""
echo "要使环境变量永久生效，请将此行添加到 ~/.bashrc 或 ~/.zshrc"
echo ""
'''
        try:
            with open(sh_file, 'w', encoding='utf-8') as f:
                f.write(sh_content)
            # 添加执行权限
            os.chmod(sh_file, 0o755)
            print(f"✅ 已创建环境变量设置脚本: {sh_file}")
            print("   运行命令: source set_jupyter_env.sh")
        except Exception as e:
            print(f"❌ 创建脚本失败: {e}")

    print("\n💡 提示：重启终端后，环境变量会失效")
    print("   如需永久生效，请将环境变量添加到系统配置中")


def verify_setup():
    """验证配置"""
    print("\n正在验证配置...")

    # 检查配置目录
    try:
        from jupyter_core.paths import jupyter_config_dir
        config_dir = jupyter_config_dir()
        config_file = Path(config_dir) / 'jupyter_notebook_config.py'
        if config_file.exists():
            print(f"✅ 配置文件存在: {config_file}")
        else:
            print("⚠️  配置文件不存在")
    except ImportError:
        print("⚠️  无法检测 Jupyter 配置目录")

    # 检查环境变量
    jupyter_dir = os.environ.get('JUPYTER_PROJECT_DIR')
    if jupyter_dir:
        print(f"✅ 环境变量已设置: JUPYTER_PROJECT_DIR={jupyter_dir}")
    else:
        print("⚠️  环境变量未设置")


if __name__ == '__main__':
    try:
        setup_jupyter_directory()
        verify_setup()
    except KeyboardInterrupt:
        print("\n\n操作已取消")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ 配置过程出错: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
