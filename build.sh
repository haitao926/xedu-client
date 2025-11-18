#!/bin/bash

# Xedu Client 完整打包脚本
# 确保前后端都能正常工作

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
echo -e "${YELLOW}[1/6] 清理旧的构建文件...${NC}"
rm -rf src/dist
rm -rf src-tauri/target/release
echo -e "${GREEN}✓ 清理完成${NC}"
echo ""

# 步骤2: 检查Python环境
echo -e "${YELLOW}[2/6] 检查Python环境...${NC}"
if ! command -v python &> /dev/null && ! command -v python3 &> /dev/null; then
    echo -e "${RED}✗ 未找到Python，请先安装Python${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Python环境检查通过${NC}"
echo ""

# 步骤3: 安装Rust依赖（如果需要）
echo -e "${YELLOW}[3/6] 检查Rust环境...${NC}"
if ! command -v cargo &> /dev/null; then
    echo -e "${RED}✗ 未找到Rust，请先安装Rust${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Rust环境检查通过${NC}"
echo ""

# 步骤4: 构建前端
echo -e "${YELLOW}[4/6] 构建前端资源...${NC}"
npm run build
if [ $? -ne 0 ]; then
    echo -e "${RED}✗ 前端构建失败${NC}"
    exit 1
fi
echo -e "${GREEN}✓ 前端构建完成${NC}"
echo ""

# 步骤5: 检查server.py
echo -e "${YELLOW}[5/6] 检查后端API文件...${NC}"
if [ ! -f "server.py" ]; then
    echo -e "${RED}✗ 未找到 server.py${NC}"
    exit 1
fi
echo -e "${GREEN}✓ 后端API文件检查通过${NC}"
echo ""

# 步骤6: 构建Tauri应用
echo -e "${YELLOW}[6/6] 构建Tauri应用...${NC}"
npm run tauri:build
if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Tauri构建失败${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Tauri应用构建完成${NC}"
echo ""

echo "=================================="
echo -e "${GREEN}构建成功！${NC}"
echo "=================================="
echo ""
echo "构建输出:"
echo "  - 前端文件: src/dist/"
echo "  - Tauri应用: src-tauri/target/release/"
echo ""
echo "运行应用:"
echo "  ./src-tauri/target/release/app"
echo ""
