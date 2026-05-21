# NeteaseMusicCloudManager API 启动脚本
# 自动安装 Bun 并启动 API 服务

param(
    [int]$Port = 3000
)

$ErrorActionPreference = "Stop"

$API_PACKAGE = "@neteasecloudmusicapienhanced/api"

# 颜色输出函数
function Write-Info {
    param([string]$Message)
    Write-Host "[INFO] " -ForegroundColor Green -NoNewline
    Write-Host $Message
}

function Write-Warn {
    param([string]$Message)
    Write-Host "[WARN] " -ForegroundColor Yellow -NoNewline
    Write-Host $Message
}

function Write-LogError {
    param([string]$Message)
    Write-Host "[ERROR] " -ForegroundColor Red -NoNewline
    Write-Host $Message
}

# 检测命令是否存在
function Test-Command {
    param([string]$Command)
    return [bool](Get-Command $Command -ErrorAction SilentlyContinue)
}

# 检测 npm 官方源是否可用（实际获取包信息）
function Test-NpmConnectivity {
    Write-Info "检测 npm 官方源可用性..."
    try {
        $response = Invoke-WebRequest -Uri "https://registry.npmjs.org/@neteasecloudmusicapienhanced/api/latest" -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
        
        if ($response.Content -match '"version"') {
            Write-Info "npm 官方源可用"
            return $true
        }
        else {
            Write-Warn "npm 官方源响应无效"
            return $false
        }
    }
    catch {
        Write-Warn "npm 官方源不可用: $($_.Exception.Message)"
        return $false
    }
}

# 设置 npmmirror 镜像
function Set-NpmMirror {
    Write-Info "设置 npmmirror 镜像..."
    $env:NPM_CONFIG_REGISTRY = "https://registry.npmmirror.com"
    $env:BUN_CONFIG_REGISTRY = "https://registry.npmmirror.com"
    Write-Info "已设置镜像: https://registry.npmmirror.com"
}

# 使用 winget 安装 Bun
function Install-Bun {
    Write-Info "正在通过 winget 安装 Bun..."
    
    # 检测 winget 是否可用
    if (-not (Test-Command "winget")) {
        Write-LogError "未找到 winget，请手动安装 Bun:"
        Write-Host ""
        Write-Host "  方式一: PowerShell 安装脚本"
        Write-Host "    powershell -c `"irm bun.sh/install.ps1|iex`""
        Write-Host ""
        Write-Host "  方式二: 下载安装包"
        Write-Host "    https://github.com/oven-sh/bun/releases"
        Write-Host ""
        exit 1
    }
    
    try {
        # 使用 winget 安装 Bun
        $ErrorActionPreference = "Continue"
        winget install --id Oven-sh.Bun --accept-package-agreements --accept-source-agreements
        $ErrorActionPreference = "Stop"
        
        if ($LASTEXITCODE -ne 0) {
            throw "winget 安装失败"
        }
        
        Write-Info "Bun 安装完成"
    }
    catch {
        Write-Warn "winget 安装失败，尝试使用 PowerShell 脚本安装..."
        try {
            irm bun.sh/install.ps1 | iex
            Write-Info "Bun 安装完成"
        }
        catch {
            Write-LogError "Bun 安装失败: $_"
            exit 1
        }
    }
}

# 刷新环境变量
function Update-Environment {
    Write-Info "刷新环境变量..."
    
    # 从注册表获取最新的 PATH
    $machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
    $env:PATH = "$userPath;$machinePath"
    
    # 确保 bun 路径在 PATH 中
    $bunPath = "$env:USERPROFILE\.bun\bin"
    if (Test-Path $bunPath) {
        if (-not $env:PATH.Contains($bunPath)) {
            $env:PATH = "$bunPath;$env:PATH"
        }
    }
}

# 主流程
function Main {
    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host "  NeteaseMusicCloudManager API 启动器" -ForegroundColor Cyan
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host ""
    
    # 1. 检测并安装 Bun
    if (Test-Command "bun") {
        $bunVersion = bun --version
        Write-Info "Bun 已安装: $bunVersion"
    }
    else {
        Write-Warn "未检测到 Bun，开始安装..."
        Install-Bun
        Update-Environment
        
        # 再次检测
        if (-not (Test-Command "bun")) {
            Write-LogError "Bun 安装后仍无法使用，请重新打开终端"
            Write-Host ""
            Write-Host "如果问题持续，请手动将以下路径添加到 PATH:"
            Write-Host "  $env:USERPROFILE\.bun\bin"
            Write-Host ""
            exit 1
        }
        $bunVersion = bun --version
        Write-Info "Bun 安装成功: $bunVersion"
    }
    
    # 2. 检测 npm 连接并设置镜像
    if (-not (Test-NpmConnectivity)) {
        Set-NpmMirror
    }
    
    # 3. 启动 API 服务
    Write-Host ""
    Write-Info "正在启动 API 服务..."
    Write-Info "端口: $Port"
    Write-Info "包名: $API_PACKAGE"
    Write-Host ""
    Write-Info "API 服务启动后，可通过以下地址访问:"
    Write-Info "  http://localhost:$Port"
    Write-Info "  http://localhost:$Port/login/status (验证服务状态)"
    Write-Host ""
    Write-Info "按 Ctrl+C 停止服务"
    Write-Host ""
    
    $env:PORT = $Port.ToString()
    bunx $API_PACKAGE
}

# 运行主流程
Main
