# NeteaseMusicCloudManager

<p align="center">
  <img src="assets/logo.webp" alt="NeteaseMusicCloudManager Logo" width="200">
</p>

一个基于 [NeteaseCloudMusicApiEnhanced](https://neteasecloudmusicapienhanced.js.org/#/) 的网易云音乐云盘管理工具，支持：

- 跨平台 CLI（Windows/macOS/Linux）
- 独立 TUI 全屏界面（基于 [OpenTUI](https://opentui.com)）
- 多种登录（手机号/邮箱/二维码）
- 云盘列表、上传、删除、匹配、下载
- 本地音乐库扫描与云盘差异比对
- 双向同步（同步云盘端 / 同步本地端）
- 音质更新（匹配歌曲大小差异超阈值时重传）
- 上传实时速度显示与失败重试

---

## 0. 软件截图

![Command-Line Interface](https://github.com/zdxiaoda/NeteaseMusicCloudManager/blob/main/assets/CLI.png?raw=true)

![TUI](https://github.com/zdxiaoda/NeteaseMusicCloudManager/blob/main/assets/TUI.png?raw=true)

---

## 1. 环境要求

- [Bun](https://bun.sh) 1.0+
- 可访问网易云 API 服务（本项目默认会自动尝试拉起）

---

## 2. 安装与启动

在项目目录执行：

```bash
bun install
bun run generate:api
bun run build
```

开发模式：

```bash
# CLI 命令行模式
bun run dev -- --help

# TUI 全屏界面
bun run dev:tui
```

生产模式（编译后）：

```bash
# CLI 模式
bun run start -- --help

# TUI 模式
bun run start:tui
```

编译为单个可执行文件：

```bash
bun run compile
```

输出：`artifacts/ncm-cloud`

使用方式：
```bash
# CLI 模式
./artifacts/ncm-cloud --help

# TUI 模式
./artifacts/ncm-cloud tui
```

---

## 3. API 服务说明

本工具默认 API 地址：

- `http://localhost:3000`

并会自动探活/拉起 API（本地地址场景）。如果自动拉起失败，可手动启动：

```bash
PORT=3000 bunx @neteasecloudmusicapienhanced/api
```

可通过环境变量关闭自动拉起：

```bash
NCM_AUTO_START_API=0
```

指定 API 地址：

```bash
NCM_API_BASE_URL=http://127.0.0.1:3000
```

---

## 4. 登录机制

支持登录方式：

- 手机号 + 密码
- 邮箱 + 密码
- 二维码登录

会话会持久化，下次启动会自动检查登录态并尽量复用。

常用命令：

```bash
bun run dev -- login
bun run dev -- status
```

二维码展示兜底顺序：

1. 终端文本二维码渲染
2. `xdg-open` 打开二维码图片（Linux）
3. 最后输出 data URL

---

## 5. 核心命令

### 云盘管理

```bash
bun run dev -- cloud:list --refresh
bun run dev -- cloud:upload "/path/to/song.flac"
bun run dev -- cloud:delete 123 456
bun run dev -- cloud:match 123 987654
bun run dev -- cloud:match:unmatched --refresh
bun run dev -- cloud:download 123 "/path/to/download-dir"
```

说明：

- 上传默认使用网易云文档中的"客户端直传流程"：
  - `POST /cloud/upload/token`
  - 上传到返回的 `uploadUrl`
  - `POST /cloud/upload/complete`
- `complete` 阶段会自动读取本地音频元数据并提交可选参数：
  - `song`
  - `artist`
  - `album`
- `cloud:match:unmatched` 会先筛选云盘未匹配歌曲（`songId` 为空），再逐首用"歌名 + 歌手"搜索并让你选择对应歌曲，也可跳过不匹配

### 本地扫描与差异分析

```bash
bun run dev -- scan "/path/to/music-folder"
bun run dev -- diff --limit 100
bun run dev -- diff --all
```

### 同步

```bash
# 同步云盘端：删除云盘独有 + 上传本地独有
bun run dev -- sync --target cloud

# 同步本地端：删除本地独有
bun run dev -- sync --target local --delete-local-only

# 同步本地端：下载云盘独有
bun run dev -- sync --target local --download-cloud-only --download-dir "/path/to/dir"

# 音质更新：匹配歌曲中，文件大小差异 > 3MB 执行"删云端+重传"
bun run dev -- sync --target quality-update

# 自定义阈值（MB）
bun run dev -- sync --target quality-update --quality-threshold-mb 6
```

同步说明：

- 上传任务失败最多重试 3 次
- 重试间隔固定 5 秒
- 上传进度会显示实时速度（`B/s`、`KB/s`、`MB/s`）
- 上传成功判定以上传接口返回为准（不做"上传后立即拉云端"复核，避免 2 分钟缓存误判）

---

## 6. 匹配策略（当前实现）

差异匹配优先级：

1. 从文件名提取 `歌手 - 歌曲名` 做精确匹配
2. 文件名整体归一化匹配
3. 标签匹配（标题 + 歌手 + 时长）
4. 标题 + 时长容差匹配
5. 最后才做模糊匹配（并带误匹配保护）

说明：

- 不使用 MD5 作为匹配主条件
- 对 `feat/ft/cover/ver`、中日文符号、全角半角等做归一化处理
- 对"同名但歌手差异过大"进行拦截，降低误匹配

---

## 7. TUI 使用说明

启动：

```bash
bun run dev:tui
```

操作要点：

- `↑/↓` 或鼠标滚轮选择菜单项
- `Enter` 或鼠标点击确认执行
- `Tab` 切换焦点到输出区域
- `Esc` 快速回到菜单焦点
- `q` / `Ctrl+C` 退出
- 弹窗中支持 `← →` 左右滚动查看表格

TUI 特性：

- 紫色主题配色
- ASCII 艺术 Logo
- 美观的表格显示（歌曲列表、差异比对）
- 动态加载动画（spinner）
- 日志分级显示（✓ 成功 / ⚠ 警告 / ✗ 错误）
- 底部状态栏实时显示执行状态

---

## 8. 数据存储位置

- 本地缓存（JSON）：`~/.ncm-cloud-manager/cache.json`
- 配置与会话（含 cookie）：`~/.config/ncm-cloud-manager-nodejs/config.json`（Linux）

> 不同系统下配置目录由 `conf` 库按平台规则决定。
>
> 当前版本云盘列表读取为"每次实时拉取远端"，不会命中本地云盘列表缓存。

---

## 9. 常见问题

### Q1: `diff` 数量看起来不合理？

先执行一次全流程：

```bash
bun run dev -- scan "/your/music/folder"
bun run dev -- cloud:list --refresh
bun run dev -- diff --all
```

确认扫描目录与缓存都已更新。

### Q2: 二维码登录提示网络错误/超时？

重试登录即可。当前轮询已对 `timeout`、`socket hang up`、`ECONNRESET` 等瞬时网络错误做重试容错。

### Q3: TUI 点击后无法操作？

按 `Esc` 回菜单焦点，或直接鼠标点击左侧菜单项。

### Q4: 为什么上传后马上在列表里看不到？

网易云 API 存在短时缓存（常见约 2 分钟）与后端处理延迟，属于正常现象。当前工具不会用"立即拉取列表"来判定上传失败。

### Q5: `Cannot find module './embedded-api.js'`？

首次运行或重新安装依赖后，需要先生成嵌入的 API 模块：

```bash
bun run generate:api
```

---

## 10. 技术栈

| 类别 | 技术 |
|------|------|
| 运行时 | [Bun](https://bun.sh) |
| TUI 框架 | [OpenTUI](https://opentui.com) |
| 二维码显示 | [@vincentkoc/qrcode-tui](https://github.com/VincentKoc/qrcode-tui) |
| 包管理 | Bun 内置 |
| 编译打包 | `bun build --compile` |
| 类型检查 | TypeScript |

---

## 11. 免责声明

本项目仅用于个人学习与数据管理，请遵守网易云音乐及相关服务条款与法律法规。
