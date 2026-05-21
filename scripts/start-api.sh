#!/usr/bin/env bash
set -eo pipefail

# NeteaseMusicCloudManager API 启动脚本
# 自动安装 Bun 并启动 API 服务

export PORT="${PORT:-3000}"
API_PACKAGE="@neteasecloudmusicapienhanced/api"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检测命令是否存在
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# 检测 npm 官方源是否可用（实际获取包信息）
check_npm_connectivity() {
    info "检测 npm 官方源可用性..."
    
    # 尝试获取一个包的版本信息
    if curl -s --connect-timeout 5 --max-time 10 "https://registry.npmjs.org/@neteasecloudmusicapienhanced/api/latest" 2>/dev/null | grep -q '"version"'; then
        info "npm 官方源可用"
        return 0
    fi
    
    warn "npm 官方源不可用"
    return 1
}

# 设置 npmmirror 镜像
setup_npmmirror() {
    info "设置 npmmirror 镜像..."
    export NPM_CONFIG_REGISTRY="https://registry.npmmirror.com"
    export BUN_CONFIG_REGISTRY="https://registry.npmmirror.com"
    info "已设置镜像: https://registry.npmmirror.com"
}

# 安装 Bun
install_bun() {
    info "正在安装 Bun..."
    if ! curl -fsSL https://bun.sh/install | bash; then
        error "Bun 安装失败"
        exit 1
    fi
    info "Bun 安装完成"
}

# 刷新环境变量
refresh_env() {
    info "刷新环境变量..."
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
}

# 主流程
main() {
    echo ""
    echo "=========================================="
    echo "  NeteaseMusicCloudManager API 启动器"
    echo "=========================================="
    echo ""
    
    # 1. 检测并安装 Bun
    if command_exists bun; then
        info "Bun 已安装: $(bun --version)"
    else
        warn "未检测到 Bun，开始安装..."
        install_bun
        refresh_env
        
        # 再次检测
        if ! command_exists bun; then
            error "Bun 安装后仍无法使用，请手动将 ~/.bun/bin 添加到 PATH"
            echo ""
            echo "执行以下命令:"
            echo "  export BUN_INSTALL=\"\$HOME/.bun\""
            echo "  export PATH=\"\$BUN_INSTALL/bin:\$PATH\""
            echo ""
            exit 1
        fi
        info "Bun 安装成功: $(bun --version)"
    fi
    
    # 2. 检测 npm 连接并设置镜像
    if ! check_npm_connectivity; then
        setup_npmmirror
    fi
    
    # 3. 启动 API 服务
    echo ""
    info "正在启动 API 服务..."
    info "端口: ${PORT}"
    info "包名: ${API_PACKAGE}"
    echo ""
    info "API 服务启动后，可通过以下地址访问:"
    info "  http://localhost:${PORT}"
    info "  http://localhost:${PORT}/login/status (验证服务状态)"
    echo ""
    info "按 Ctrl+C 停止服务"
    echo ""
    
    exec bunx "${API_PACKAGE}"
}

# 运行主流程
main
