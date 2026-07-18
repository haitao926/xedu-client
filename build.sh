#!/bin/bash

# Xedu Client 完整打包脚本
# Electron + local Python backend

set -e

echo "=================================="
echo "Xedu Client 打包脚本"
echo "=================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 步骤1: 清理旧文件
echo -e "${YELLOW}[1/4] 清理旧的构建文件...${NC}"
rm -rf dist-final
echo -e "${GREEN}✓ 清理完成${NC}"
echo ""

# 步骤2: 检查Node.js环境
echo -e "${YELLOW}[2/4] 检查Node.js环境...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}✗ 未找到Node.js，请先安装Node.js${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Node.js环境检查通过${NC}"
echo ""

# 步骤3: 构建Scratch编辑器
echo -e "${YELLOW}[3/4] 构建Scratch编辑器...${NC}"
npm run build:scratch
if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Scratch编辑器构建失败${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Scratch编辑器构建完成${NC}"
npm run check:scratch-build
if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Scratch编辑器产物检查失败${NC}"
    exit 1
fi
echo ""

# 步骤4: 构建前端资源与 Electron 应用
echo -e "${YELLOW}[4/4] 构建前端资源与 Electron 应用...${NC}"
npm run build
if [ $? -ne 0 ]; then
    echo -e "${RED}✗ 前端构建失败${NC}"
    exit 1
fi
echo -e "${GREEN}✓ 前端构建完成${NC}"
echo ""

npx electron-builder
if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Electron构建失败${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Electron应用构建完成${NC}"
echo ""

echo "=================================="
echo -e "${GREEN}构建成功！${NC}"
echo "=================================="
echo ""
echo "构建输出:"
echo "  - 前端文件: build/"
echo "  - Electron应用: dist-final/"
echo ""
