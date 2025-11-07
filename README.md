# Excalidraw Collaboration

一个完整的 Excalidraw 协作版本项目，支持实时协作绘图、场景存储和图片上传功能。

## 项目简介

本项目是基于 Excalidraw 的协作版本，包含以下核心组件：

- **Excalidraw 前端应用** - 基于 React 的绘图界面
- **存储后端服务** - NestJS 实现的 RESTful API，用于存储场景、房间和图片
- **协作服务器** - Socket.IO 实现的实时协作服务器
- **Nginx 反向代理** - 统一入口，处理路由和负载均衡

## 项目结构

```
excalidraw-project/
├── excalidraw/                    # Excalidraw 前端应用
│   ├── excalidraw-app/           # 主应用代码
│   ├── packages/                 # 共享包
│   └── Dockerfile                # 前端 Docker 镜像
├── excalidraw-storage-backend/   # 存储后端服务 (NestJS)
│   ├── src/                      # 源代码
│   └── Dockerfile                # 后端 Docker 镜像
├── excalidraw-room/              # Socket.IO 协作服务器
│   ├── src/                      # 源代码
│   └── Dockerfile                # Room 服务 Docker 镜像
├── nginx/                        # Nginx 配置
│   └── Dockerfile                # Nginx Docker 镜像
├── docker-compose.yml            # Docker Compose 配置
├── nginx.conf                    # Nginx 配置文件
└── build-and-push.sh            # Docker 镜像构建和推送脚本
```

## 快速开始

### 前置要求

- Docker 和 Docker Compose
- 可选：Node.js 18+ (用于本地开发)

### 使用 Docker Compose 一键启动

1. **克隆项目**

```bash
git clone https://github.com/your-username/excalidraw-collaboration.git
cd excalidraw-collaboration
```

2. **配置环境变量（可选）**

创建 `.env` 文件（可选，使用默认值也可以）：

```env
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=postgres
```

3. **启动所有服务**

```bash
docker-compose up -d
```

4. **访问应用**

- 前端应用: http://localhost:1105
- Room 服务: http://localhost:1106
- 健康检查: http://localhost:1105/health

### 服务说明

- **端口 1105**: Nginx 反向代理（主入口）
- **端口 1106**: Excalidraw Room 服务（WebSocket）
- **PostgreSQL**: 内部网络，不对外暴露

## 本地开发

### 开发环境要求

- Node.js 18.0.0 - 22.x.x
- Yarn 1.22.22
- PostgreSQL (可选，用于存储后端)

### 1. Excalidraw 前端开发

```bash
cd excalidraw
yarn install
cd excalidraw-app
yarn start
```

前端将在 http://localhost:5001 启动

### 2. 存储后端开发

```bash
cd excalidraw-storage-backend
npm install
npm run start:dev
```

后端将在 http://localhost:8080 启动

**环境变量配置**（创建 `.env` 文件）：

```env
PORT=8080
GLOBAL_PREFIX=/api/v2
STORAGE_URI=postgres://postgres:postgres@localhost:5432/postgres
LOG_LEVEL=log
BODY_LIMIT=500mb
```

### 3. Room 服务开发

```bash
cd excalidraw-room
yarn install
yarn start:dev
```

Room 服务将在 http://localhost:3000 启动

**环境变量配置**：

```env
NODE_ENV=development
PORT=80
CORS_ORIGIN=*
```

## 配置说明

### Docker Compose 配置

`docker-compose.yml` 文件包含所有服务的配置：

- **nginx**: 反向代理，端口映射 1105:80
- **excalidraw**: 前端应用
- **excalidraw-storage-backend**: 存储后端，依赖 PostgreSQL
- **excalidraw-room**: WebSocket 协作服务器，端口映射 1106:80
- **postgres**: PostgreSQL 数据库

### Nginx 配置

`nginx.conf` 文件配置了：

- 前端静态文件代理
- API 路由 (`/api/v2`) 代理到存储后端
- WebSocket 升级支持
- 静态资源缓存
- 健康检查端点

### 存储后端配置

存储后端支持多种数据库（通过 Keyv 适配器）：

- PostgreSQL: `postgres://user:pass@host:port/db`
- MySQL: `mysql://user:pass@host:port/db`
- MongoDB: `mongodb://user:pass@host:port/db`
- Redis: `redis://user:pass@host:port`

### 前端构建配置

前端构建时可通过环境变量配置：

- `VITE_APP_HTTP_STORAGE_BACKEND_URL`: 存储后端 API 地址（默认: `/api/v2`）
- `VITE_APP_WS_SERVER_URL`: WebSocket 服务器地址
- `VITE_APP_STORAGE_BACKEND`: 存储后端类型（默认: `http`）

## 部署说明

### Docker 部署

1. **构建镜像**

```bash
# 构建所有镜像
docker-compose build

# 或使用提供的脚本（需要配置 AWS ECR）
./build-and-push.sh
```

2. **启动服务**

```bash
docker-compose up -d
```

3. **查看日志**

```bash
docker-compose logs -f
```

4. **停止服务**

```bash
docker-compose down
```

### 生产环境建议

1. **使用环境变量文件**

创建 `.env.production` 文件，包含生产环境的配置：

```env
POSTGRES_USER=your_prod_user
POSTGRES_PASSWORD=your_secure_password
POSTGRES_DB=excalidraw_prod
```

2. **配置 HTTPS**

在生产环境中，建议在 Nginx 前添加 SSL 终端（如 Let's Encrypt 或 AWS ALB）

3. **数据库持久化**

确保 PostgreSQL 数据卷正确挂载：

```yaml
volumes:
  postgres_data:
    driver: local
```

4. **资源限制**

在 `docker-compose.yml` 中添加资源限制：

```yaml
services:
  excalidraw:
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 2G
```

## 使用说明

### 创建协作房间

1. 访问 http://localhost:1105
2. 点击右上角的"协作"按钮
3. 创建新房间或加入现有房间
4. 分享房间链接给其他用户

### 导出和分享

1. **导出为图片**: 点击菜单 → 导出 → PNG/SVG
2. **导出为链接**: 点击菜单 → 导出 → 链接（需要存储后端支持）
3. **保存场景**: 场景会自动保存到存储后端

### API 使用

存储后端提供以下 API 端点：

- `POST /api/v2/scenes/` - 创建场景
- `GET /api/v2/scenes/:id` - 获取场景
- `POST /api/v2/rooms/` - 创建房间
- `GET /api/v2/rooms/:id` - 获取房间
- `POST /api/v2/files/` - 上传文件

## 故障排查

### 服务无法启动

1. 检查端口是否被占用：
```bash
lsof -i :1105
lsof -i :1106
```

2. 查看服务日志：
```bash
docker-compose logs [service-name]
```

### 数据库连接失败

1. 检查 PostgreSQL 服务是否运行：
```bash
docker-compose ps postgres
```

2. 检查环境变量配置是否正确

### WebSocket 连接失败

1. 检查 Room 服务是否正常运行
2. 检查 Nginx 配置中的 WebSocket 升级设置
3. 检查防火墙设置

## 贡献指南

欢迎提交 Issue 和 Pull Request！

## 许可证

本项目基于 MIT 许可证开源。

## 相关链接

- [Excalidraw 官方仓库](https://github.com/excalidraw/excalidraw)
- [Excalidraw 官网](https://excalidraw.com)

## 支持

如有问题，请提交 Issue 或联系维护者。

## 上传到 GitHub

### 创建 GitHub 仓库

1. 登录 GitHub，点击右上角的 "+" 按钮，选择 "New repository"
2. 仓库名称填写：`excalidraw-collaboration`
3. 设置为 Public（公开仓库）
4. **不要**初始化 README、.gitignore 或 license（因为我们已经有了）
5. 点击 "Create repository"

### 推送代码到 GitHub

在项目根目录执行以下命令：

```bash
# 添加远程仓库（将 YOUR_USERNAME 替换为你的 GitHub 用户名）
git remote add origin https://github.com/YOUR_USERNAME/excalidraw-collaboration.git

# 或者使用 SSH（如果你配置了 SSH 密钥）
# git remote add origin git@github.com:YOUR_USERNAME/excalidraw-collaboration.git

# 推送代码到 GitHub
git branch -M main
git push -u origin main
```

### 后续更新

当你对代码进行修改后，可以使用以下命令推送更新：

```bash
# 添加所有更改
git add .

# 提交更改
git commit -m "你的提交信息"

# 推送到 GitHub
git push
```

### 注意事项

- 确保 `.gitignore` 文件已正确配置，避免提交敏感信息（如 `.env` 文件、`node_modules` 等）
- 如果仓库中已经有一些文件，可能需要先执行 `git pull` 合并远程更改
- 如果遇到推送冲突，请先解决冲突后再推送

