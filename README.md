# SPlayer Web 🎵

<p align="center">
  <img src="web/public/favicon.png" width="96" height="96" alt="SPlayer Web Logo" />
</p>

<p align="center">
  <b>现代、优雅、跨平台的轻量级 Web 音乐播放器</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.0-blue.svg" alt="Version" />
  <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License" />
  <img src="https://img.shields.io/badge/docker-multi--arch-2496ED.svg?logo=docker&logoColor=white" alt="Docker" />
  <img src="https://img.shields.io/badge/vue-3.5-42b883.svg?logo=vuedotjs&logoColor=white" alt="Vue 3" />
  <img src="https://img.shields.io/badge/typescript-5.9-3178c6.svg?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/image_size-~55MB-orange.svg" alt="Size" />
</p>

---

## 🌟 核心特性

- 🎧 **多媒体音源与流媒体支持**：
  - 支持网易云音乐、QQ 音乐、酷狗等主流音乐服务接口。
  - 支持主流私有流媒体服务：Subsonic 兼容服务、Navidrome、Jellyfin、Emby。
  - 支持本地音频文件扫描与浏览器本地索引曲库。
  - 支持基于 JavaScript 的扩展音源插件架构。
- ✨ **Apple Music 级动态歌词 (AMLL)**：
  - 逐字高亮动效、多语种翻译、罗马音/拼音音译。
  - 动态流光背景、自适应封面色调渲染与全屏沉浸模式。
- ⚡ **原生级 Web 播放体验**：
  - 基于 Web Audio API 构建音频引擎，支持 60FPS 实时音频频谱可视化。
  - 深度集成浏览器 MediaSession API：支持系统级锁屏控制、媒体通知、键盘多媒体按键。
- 🐳 **极简轻量化 Docker 容器**：
  - Alpine Linux 纯净镜像，打包压缩后体积仅约 **55MB**。
  - 原生支持多架构：`linux/amd64` 与 `linux/arm64`（完美适配云服务器、NAS、树莓派等）。
  - 内置高性能单文件服务端，静态资源 SPA 自动路由，无需复杂外部代理。
- 🎨 **高度可定制的界面与交互**：
  - 支持 Material You 动态取色算法，跟随专辑封面或自定义系统主色调。
  - 深色/浅色/跟随系统模式一键切换。
  - 自定义侧边栏导航分组与拖拽排序（支持网络终端、下载管理、播放历史等灵活编排）。
- 🔒 **隐私至上，完全离线化设计**：
  - 播放记录、歌单与所有设置项均保存在浏览器 IndexedDB / LocalStorage 中。
  - 无任何第三方隐私追踪、无遥测代码，安全纯粹。

---

## 🚀 快速开始

### 方式一：Docker 一键运行（推荐）

通过 Docker 快速启动容器，即可直接在浏览器中访问：

```bash
docker run -d \
  --name splayer-web \
  -p 5173:5173 \
  --restart unless-stopped \
  wudiming/dmsplayerwebx:latest
```

启动完成后，在浏览器打开：`http://localhost:5173` 即可开始聆听音乐！

---

### 方式二：Docker Compose 部署

1. 下载或新建 `docker-compose.yml` 文件：

```yaml
services:
  splayer-web:
    image: wudiming/dmsplayerwebx:latest
    container_name: splayer-web
    restart: unless-stopped
    ports:
      - "5173:5173"
    environment:
      - PORT=5173
      - TZ=Asia/Shanghai
      # 【可选】自建网易云音乐增强版音源服务地址 (用于解灰与无损音源解析)
      # - NETEASE_ENHANCED_URL=http://your-ncm-api:3000
    volumes:
      - splayer-plugins:/app/plugins

volumes:
  splayer-plugins:
    driver: local
```

2. 启动服务：

```bash
docker compose up -d
```

---

### 方式三：本地开发与构建

#### 环境要求
- Node.js >= 20.0.0
- pnpm >= 9.0.0

#### 本地运行
```bash
# 1. 克隆代码仓库
git clone https://github.com/wudiming/dmsplayerwebx.git
cd dmsplayerwebx

# 2. 安装依赖
pnpm install

# 3. 启动前端开发调试
pnpm dev:web
```

开发服务器默认运行在 `http://localhost:5173`。

#### 构建生产版本
```bash
# 构建后端处理模块与前端生产静态资源
pnpm build
```

---

## ⚙️ 环境变量说明

| 环境变量 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `PORT` | `5173` | 服务监听的端口号 |
| `TZ` | `Asia/Shanghai` | 容器运行时区 |
| `NETEASE_ENHANCED_URL` | *(空)* | 可选，自建网易云音乐增强版 API 接口地址，配置后自动启用该插件进行解灰与无损解析 |

---

## 📦 架构设计

```
SPlayer-Web/
├── .github/workflows/     # GitHub Actions 自动化 CI/CD (轻量化多架构 Docker 镜像自动构建与发布)
├── docker/                # Docker 部署支持脚本与内置静态服务器
│   ├── Dockerfile
│   ├── docker-compose.yml
│   ├── docker-entrypoint.sh
│   └── server.mjs
├── server/                # 后端轻量级 API 处理中间件 (esbuild 单文件打包)
│   ├── src/apis/          # 音乐源解密、评论与歌词接口
│   └── src/handler.ts     # 请求分发与 API 处理入口
├── web/                   # 前端 SPA 客户端 (Vue 3 + Vite + UnoCSS + Pinia)
│   ├── public/            # 静态资源与内置插件
│   └── src/               # 播放器核心、UI 组件、设置中心与适配层
├── Dockerfile             # 根目录多阶段构建 Dockerfile
├── docker-compose.yml     # 根目录一键编排配置
└── package.json           # pnpm workspace 工作区配置
```

---

## 🤝 参与贡献

欢迎提交 Issue 和 Pull Request 来帮助改进 SPlayer Web！

1. Fork 本项目
2. 创建您的特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交您的修改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到您的分支 (`git push origin feature/AmazingFeature`)
5. 新建 Pull Request

---

## 📄 开源许可证

本项目采用 [MIT License](LICENSE) 许可证。
