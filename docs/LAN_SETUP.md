# 天机阁 — 局域网 (LAN) 访问设置指南

## 概述

本文档说明如何让其他电脑在同一个局域网内访问天机阁系统。

---

## 一、获取宿主机 IP 地址

在运行天机阁的电脑上执行：

```powershell
ipconfig
```

找到你的局域网 IP（通常是 `192.168.x.x` 或 `10.x.x.x`），记下来。

示例输出：

```
IPv4 地址 . . . . . . . . . . . : 192.168.1.100
```

这个 IP 就是其他电脑访问时用的地址。

---

## 二、需要开放的端口

| 端口  | 服务   | 说明               |
|-------|--------|--------------------|
| 3000  | 前端   | 浏览器访问入口     |
| 3001  | 后端   | API 服务           |

如果宿主机开启了 Windows 防火墙，需要添加入站规则允许这两个端口。

### Windows 防火墙开放端口

```powershell
# 以管理员身份运行
netsh advfirewall firewall add rule name="TianJi-Web" dir=in action=allow protocol=TCP localport=3000
netsh advfirewall firewall add rule name="TianJi-Server" dir=in action=allow protocol=TCP localport=3001
```

---

## 三、配置后端 (NestJS)

### 方式 A：开发模式（本地启动）

在 `apps/server/.env` 中设置：

```ini
# 填写宿主机局域网 IP，多个用逗号分隔
DEV_ALLOWED_ORIGINS=http://192.168.1.100:3000
```

每台访问电脑的前端来源 IP 都需要加到这里。

### 方式 B：生产模式（Docker）

在 `docker-compose.yml` 的 `server` 服务 environment 中添加：

```yaml
- NODE_ENV=production
- ALLOWED_ORIGINS=http://192.168.1.100:3000
```

---

## 四、配置前端 (Next.js)

前端通过 `NEXT_PUBLIC_API_URL` 环境变量连接后端。

### 方式 A：开发模式（本地启动）

修改 `apps/web/.env`：

```ini
# 将 localhost 改为宿主机 IP
NEXT_PUBLIC_API_URL=http://192.168.1.100:3001/api
```

### 方式 B：Docker 部署

修改 `docker-compose.yml` 的 `web` 服务：

```yaml
environment:
  - NEXT_PUBLIC_API_URL=http://192.168.1.100:3001/api
```

---

## 五、其他电脑访问

1. 确保宿主机和访问电脑在同一个局域网
2. 打开浏览器，访问：

```
http://192.168.1.100:3000
```

3. 使用测试账号登录：

| 角色     | 用户名            | 密码    |
|----------|-------------------|---------|
| 管理员   | admin             | admin123 |

> 其他角色的测试账号需要管理员登录后在「用户管理」页面创建。

---

## 六、快速启动（开发模式）

在宿主机上依次执行：

```powershell
# 1. 启动后端
cd apps/server
node dist/main

# 2. 启动前端（新终端）
cd apps/web
node node_modules/next/dist/bin/next dev --port 3000
```

---

## 七、常见问题

### 7.1 浏览器报 CORS 错误

症状：浏览器控制台显示 `CORS` / `Cross-Origin` 错误。

解决：
1. 确认 `DEV_ALLOWED_ORIGINS` 已包含访问电脑的前端地址
2. 确认 `NEXT_PUBLIC_API_URL` 用的是宿主机 IP 而不是 localhost
3. 修改后**重启后端服务**

### 7.2 无法连接到后端

症状：前端页面加载，但数据为空，或 API 请求超时。

解决：
1. 在访问电脑上 ping 宿主机 IP：`ping 192.168.1.100`
2. 确认后端已启动：`netstat -ano | Select-String ":3001 "`
3. 确认防火墙已开放端口
4. 确认 `NEXT_PUBLIC_API_URL` 中的 IP 和端口正确

### 7.3 前端页面完全打不开

症状：浏览器显示「无法访问此网站」。

解决：
1. 确认前端已启动：`netstat -ano | Select-String ":3000 "`
2. 确认防火墙已开放 3000 端口
3. 尝试在宿主机本地访问 `http://localhost:3000` 确认前端正常工作

### 7.4 宿主机 IP 变更

如果宿主机重启后 IP 变了：
1. 执行 `ipconfig` 获取新 IP
2. 更新 `.env` 中的 `NEXT_PUBLIC_API_URL` 和 `DEV_ALLOWED_ORIGINS`
3. 重启前端和后端服务

---

## 八、Docker 部署（生产环境）

如果使用 Docker Compose 部署供 LAN 访问：

1. 修改 `docker-compose.yml` 中的环境变量
2. 执行：

```bash
docker compose up -d
```

3. 访问 `http://192.168.1.100:3000`

---

## 九、架构说明

```
访问电脑 (浏览器)
    │
    ├── http://192.168.1.100:3000 ──→ Next.js 前端
    │
    └── http://192.168.1.100:3001/api ──→ NestJS 后端
                                              │
                                              └── SQLite 数据库
```

前端和后端在宿主机上分别监听 `0.0.0.0:3000` 和 `0.0.0.0:3001`，局域网内其他电脑通过宿主机 IP 访问。
