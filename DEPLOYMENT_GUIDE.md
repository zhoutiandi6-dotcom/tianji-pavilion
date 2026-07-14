# ENVIRONMENT_GUIDE.md

## 环境配置指南

### 环境变量说明

| 变量 | 说明 | 必需 | 默认值 |
|------|------|------|--------|
| SERVER_PORT | 后端服务端口 | 否 | 3001 |
| JWT_SECRET | JWT 签名密钥 | **是** | — |
| JWT_EXPIRES_IN | Token 过期时间 | 否 | 7d |
| DATABASE_URL | 数据库路径 | 否 | file:./dev.db |
| NEXT_PUBLIC_API_URL | 前端 API 地址 | **是** | http://localhost:3001/api |
| ALLOWED_ORIGINS | 生产 CORS 白名单 | 否 | 空(仅开发) |
| NODE_ENV | 运行环境 | 否 | development |
| RUN_SEED | Docker 启动时初始化数据 | 否 | false |

### 配置步骤

1. 复制模板: cp .env.example apps/server/.env
2. 修改 JWT_SECRET 为随机字符串
3. 生产环境需设置 NODE_ENV=production 和 ALLOWED_ORIGINS

### JWT_SECRET 生成

`ash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
`
"@ | Set-Content "C:\Users\zhouhaojie\Documents\天帝宗--天机阁\ENVIRONMENT_GUIDE.md" -Encoding UTF8

@"
# DEPLOYMENT_GUIDE.md

## 部署指南（面向非技术人员）

### 前提条件

- 一台安装了 Docker 的 Windows 电脑
- 能访问互联网（仅首次）

### 安装 Docker

1. 下载 Docker Desktop: https://www.docker.com/products/docker-desktop/
2. 安装并启动
3. 等待 Docker 图标变绿（任务栏右下角）

### 部署步骤

1. 将项目文件夹放到电脑上
2. 双击 start.bat
   - 自动安装依赖
   - 自动初始化数据库
   - 自动启动前端和后端
3. 等待弹出浏览器窗口

或手动执行：
`ash
# 配置
cp .env.example apps/server/.env

# 启动
docker compose up -d
`

### 访问系统

- 浏览器打开: http://localhost:3000
- 登录账号: dmin / dmin123

### 常见问题

| 问题 | 解决方法 |
|------|----------|
| 端口被占用 | 修改 .env 中的 SERVER_PORT=3001 或前端端口 |
| 启动后页面空白 | 等待 1-2 分钟让前端编译完成 |
| 登录失败 | 确认后端在运行: http://localhost:3001/api/health |
