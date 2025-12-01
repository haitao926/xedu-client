#!/bin/bash

# Xedu Client 完整打包脚本
# Electron + Python Backend

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
echo -e "${YELLOW}[1/5] 清理旧的构建文件...${NC}"
rm -rf build
rm -rf dist-installer
echo -e "${GREEN}✓ 清理完成${NC}"
echo ""

# 步骤2: 检查Python环境
echo -e "${YELLOW}[2/5] 检查Python环境...${NC}"
if ! command -v python &> /dev/null && ! command -v python3 &> /dev/null; then
    echo -e "${RED}✗ 未找到Python，请先安装Python${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Python环境检查通过${NC}"
echo ""

# 步骤3: 检查Node.js环境
echo -e "${YELLOW}[3/5] 检查Node.js环境...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}✗ 未找到Node.js，请先安装Node.js${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Node.js环境检查通过${NC}"
echo ""

# 步骤4: 构建前端
echo -e "${YELLOW}[4/5] 构建前端资源...${NC}"
npm run build
if [ $? -ne 0 ]; then
    echo -e "${RED}✗ 前端构建失败${NC}"
    exit 1
fi
echo -e "${GREEN}✓ 前端构建完成${NC}"
echo ""

# 步骤5: 构建Electron应用
echo -e "${YELLOW}[5/5] 构建Electron应用...${NC}"
npm run electron:build
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
echo "  - Electron应用: dist-installer/"
echo ""
