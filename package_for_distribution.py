#!/usr/bin/env python3
"""
自动化打包脚本 - 将Tauri应用和Python环境打包为完整部署包
"""

import os
import sys
import shutil
import subprocess
from pathlib import Path

def run_command(cmd, cwd=None):
    """执行命令"""
    print(f"执行: {cmd}")
    result = subprocess.run(cmd, shell=True, cwd=cwd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"错误: {result.stderr}")
        return False
    print(f"成功: {result.stdout}")
    return True

def build_tauri():
    """构建Tauri应用"""
    print("\n" + "="*60)
    print("步骤 1/4: 构建Tauri应用")
    print("="*60)

    if not Path("package.json").exists():
        print("错误: 未找到package.json，请在项目根目录运行此脚本")
        return False

    print("正在构建Tauri应用 (这可能需要5-10分钟)...")
    if not run_command("npm run tauri:build"):
        print("构建失败")
        return False

    print("✓ Tauri应用构建完成")
    return True

def find_tauri_output():
    """查找Tauri构建输出"""
    print("\n" + "="*60)
    print("步骤 2/4: 查找Tauri输出文件")
    print("="*60)

    possible_paths = [
        "src-tauri/target/release/Jupyter-Lab-Client.exe",
        "src-tauri/target/release/bundle/msi/Jupyter Lab Client_1.0.0_x64_en-US.msi",
        "src-tauri/target/release/bundle/appimage/Jupyter-Lab-Client_1.0.0_amd64.AppImage",
        "src-tauri/target/release/bundle/dmg/Jupyter Lab Client_1.0.0_x64.dmg",
    ]

    for path in possible_paths:
        if Path(path).exists():
            print(f"✓ 找到: {path}")
            return path

    print("未找到构建输出文件")
    return None

def create_deploy_package(tauri_app):
    """创建部署包"""
    print("\n" + "="*60)
    print("步骤 3/4: 创建部署包")
    print("="*60)

    deploy_dir = Path("jupyter-tauri-distribution")
    if deploy_dir.exists():
        shutil.rmtree(deploy_dir)

    deploy_dir.mkdir()

    # 复制Tauri应用
    tauri_path = Path(tauri_app)
    if tauri_path.suffix == ".msi":
        dest_name = "Jupyter-Lab-Client-Setup.msi"
    elif tauri_path.suffix == ".AppImage":
        dest_name = "Jupyter-Lab-Client.AppImage"
    elif tauri_path.suffix == ".dmg":
        dest_name = "Jupyter-Lab-Client.dmg"
    else:
        dest_name = "Jupyter-Lab-Client.exe"

    shutil.copy2(tauri_path, deploy_dir / dest_name)
    print(f"✓ 复制Tauri应用: {dest_name}")

    # 复制启动器
    if Path("launch_jupyter.bat").exists():
        shutil.copy2("launch_jupyter.bat", deploy_dir)
        print("✓ 复制Windows启动器")

    if Path("launch_jupyter.sh").exists():
        shutil.copy2("launch_jupyter.sh", deploy_dir)
        os.chmod(deploy_dir / "launch_jupyter.sh", 0o755)
        print("✓ 复制Linux/Mac启动器")

    # 复制说明文档
    docs = ["PACKAGE_INSTRUCTIONS.md", "TAURI_PACKAGE_SUMMARY.md", "FINAL_REPORT.md"]
    for doc in docs:
        if Path(doc).exists():
            shutil.copy2(doc, deploy_dir)
            print(f"✓ 复制文档: {doc}")

    # 复制资源目录
    resources_src = Path("src-tauri/resources")
    if not resources_src.exists():
        print("错误: src-tauri/resources 目录不存在")
        return False

    resources_dst = deploy_dir / "resources"
    shutil.copytree(resources_src, resources_dst)
    print("✓ 复制Python环境 (resources)")

    print(f"\n✓ 部署包创建完成: {deploy_dir.absolute()}")

    return deploy_dir

def create_install_script(deploy_dir):
    """创建安装脚本"""
    print("\n" + "="*60)
    print("步骤 4/4: 创建安装脚本")
    print("="*60)

    # Windows安装脚本
    install_bat = deploy_dir / "INSTALL.bat"
    with open(install_bat, "w", encoding="gbk") as f:
        f.write("""@echo off
title 安装 Jupyter Lab Client
color 0A

echo ===========================================
echo  Jupyter Lab Client - 安装程序
echo ===========================================
echo.
echo 正在安装...
echo.

REM 检查是否有安装包
if exist "Jupyter-Lab-Client-Setup.msi" (
    echo 正在安装MSI包...
    msiexec /i "Jupyter-Lab-Client-Setup.msi" /quiet
    echo ✓ 安装完成
    echo.
    echo 现在可以双击 launch_jupyter.bat 启动应用
) else (
    echo 未找到安装包
    echo 请手动双击 Jupyter-Lab-Client.exe
)

pause
""")
    print("✓ 创建Windows安装脚本: INSTALL.bat")

    # Linux/Mac安装脚本
    install_sh = deploy_dir / "INSTALL.sh"
    with open(install_sh, "w", encoding="utf-8") as f:
        f.write("""#!/bin/bash

echo "=========================================="
echo " Jupyter Lab Client - 安装程序"
echo "=========================================="
echo ""
echo "正在安装..."

# 检查是否有AppImage
if [ -f "Jupyter-Lab-Client.AppImage" ]; then
    echo "设置AppImage权限..."
    chmod +x "Jupyter-Lab-Client.AppImage"
    echo "✓ 安装完成"
    echo ""
    echo "现在可以运行: ./launch_jupyter.sh"
fi

# 检查是否有DMG
if [ -f "Jupyter-Lab-Client.dmg" ]; then
    echo "请手动挂载DMG文件并安装应用"
    open "Jupyter-Lab-Client.dmg"
fi
""")
    os.chmod(install_sh, 0o755)
    print("✓ 创建Linux/Mac安装脚本: INSTALL.sh")

def main():
    """主函数"""
    print("=" * 60)
    print(" Jupyter Tauri 自动化打包工具")
    print("=" * 60)
    print()
    print("此脚本将:")
    print("  1. 构建Tauri应用")
    print("  2. 查找构建输出")
    print("  3. 创建完整部署包")
    print("  4. 生成安装脚本")
    print()
    print("预计耗时: 5-10分钟")
    print()

    # 检查必要文件
    if not Path("src-tauri").exists():
        print("错误: 未找到 src-tauri 目录")
        return 1

    if not Path("src-tauri/resources").exists():
        print("错误: 未找到 src-tauri/resources 目录")
        print("请先运行: python setup_tauri_bundle.py")
        return 1

    # 构建Tauri
    if not build_tauri():
        return 1

    # 查找输出
    tauri_app = find_tauri_output()
    if not tauri_app:
        return 1

    # 创建部署包
    deploy_dir = create_deploy_package(tauri_app)
    if not deploy_dir:
        return 1

    # 创建安装脚本
    create_install_script(deploy_dir)

    # 完成
    print("\n" + "=" * 60)
    print("✓ 打包完成!")
    print("=" * 60)
    print()
    print(f"📦 部署包位置: {deploy_dir.absolute()}")
    print()
    print("📁 包含文件:")
    print("  - Jupyter-Lab-Client.exe / .msi / .AppImage / .dmg")
    print("  - launch_jupyter.bat / launch_jupyter.sh")
    print("  - resources/ (Python环境)")
    print("  - INSTALL.bat / INSTALL.sh")
    print("  - 说明文档")
    print()
    print("🚀 部署说明:")
    print("  1. 将整个目录分发给用户")
    print("  2. 用户运行 INSTALL.bat/sh 安装")
    print("  3. 用户运行 launch_jupyter.bat/sh 启动")
    print()
    print(f"📊 部署包大小:")
    total_size = sum(f.stat().st_size for f in deploy_dir.rglob('*') if f.is_file())
    print(f"  {total_size / (1024*1024):.1f} MB")

    return 0

if __name__ == "__main__":
    sys.exit(main())
