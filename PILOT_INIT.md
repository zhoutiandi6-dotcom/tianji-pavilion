# PILOT_INIT.md

## 内测初始化指南

### 一键初始化步骤

**Docker 部署:**
`ash
# 首次启动
RUN_SEED=true docker compose up -d
`

**本地部署:**
`ash
cd apps/server
npx ts-node prisma/seed.ts
`

### 默认数据

| 类型 | 内容 |
|------|------|
| 默认用户 | admin (Owner), super_admin (管理员), leader (运营主管), operator (运营), designer (设计师), dm (设计主管) |
| 门店 | 天猫旗舰店、京东旗舰店、亚马逊美国站、Shopify独立站 |
| 需求类型 | 仅替换文案、附图套版、场景修改、个性化定制 |
| 系统配置 | 站点名称、版本、主题等 |

### 初始化完成后

1. 使用 dmin / admin123 登录
2. 创建实际业务所需的用户
3. 配置 CORS（生产环境）
4. 开始使用
