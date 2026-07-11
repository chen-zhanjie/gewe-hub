# GeWeHub 本地部署说明

第一版本地验证默认使用本机已有 MySQL/Redis，Docker Compose 只启动一次性迁移任务、server 和 web。若机器上没有可用 MySQL/Redis，也可以用可选 `infra` profile 启动容器版 MySQL/Redis；默认路径不强制拉基础镜像。

## 准备环境

1. 复制 `server/.env.example` 为真实环境变量文件。Compose 会读取 `server/.env`，不要把真实密钥写回 `.env.example`。

```bash
cp server/.env.example server/.env
```

2. 至少修改：
   - `GEWE_BASE_URL`
   - `GEWE_TOKEN`
   - `WEBHOOK_SECRET`
   - `ADMIN_PASSWORD_HASH`
   - `SESSION_SECRET`
3. 生成管理员密码 hash：

```bash
pnpm --filter @gewehub/server exec tsx ../scripts/generate-admin-hash.ts "your-password"
```

## 本机基础服务

默认 compose 通过 `host.docker.internal:3306` 和 `host.docker.internal:6379` 连接本机 MySQL/Redis。确认本机 MySQL 和 Redis 可连接：

```bash
/Applications/ServBay/bin/mysqladmin ping -h127.0.0.1 -P3306 -ugewehub -pgewehub
/Applications/ServBay/bin/redis-cli -h 127.0.0.1 -p 6379 ping
```

首次本机没有 `gewehub` 库和用户时，使用本机 root 账号创建：

```bash
/Applications/ServBay/bin/mysql -h127.0.0.1 -P3306 -uroot -proot <<'SQL'
CREATE DATABASE IF NOT EXISTS gewehub CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'gewehub'@'localhost' IDENTIFIED BY 'gewehub';
CREATE USER IF NOT EXISTS 'gewehub'@'127.0.0.1' IDENTIFIED BY 'gewehub';
CREATE USER IF NOT EXISTS 'gewehub'@'%' IDENTIFIED BY 'gewehub';
GRANT ALL PRIVILEGES ON gewehub.* TO 'gewehub'@'localhost';
GRANT ALL PRIVILEGES ON gewehub.* TO 'gewehub'@'127.0.0.1';
GRANT ALL PRIVILEGES ON gewehub.* TO 'gewehub'@'%';
FLUSH PRIVILEGES;
SQL
```

## 启动

```bash
PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH" \
/Applications/Docker.app/Contents/Resources/bin/docker compose -f deploy/docker-compose.yml up --build
```

Compose 通过 `host.docker.internal:3306` 和 `host.docker.internal:6379` 连接本机 MySQL/Redis，并在 server 启动前自动执行 `prisma migrate deploy`。

启动后：

- Web: `http://localhost:8080`
- Server health: `http://localhost:3000/api/health`

## 可选容器基础服务

如果本机没有可用 MySQL/Redis，可以启用 `infra` profile。容器 MySQL/Redis 映射到宿主机 `3307/6380`，避免占用常见本机端口。

```bash
PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH" \
DATABASE_URL="mysql://gewehub:gewehub@mysql:3306/gewehub" \
REDIS_URL="redis://redis:6379/0" \
/Applications/Docker.app/Contents/Resources/bin/docker compose \
  -f deploy/docker-compose.yml --profile infra up --build
```

使用 `infra` profile 时，server/migrate 在 compose 网络内通过服务名 `mysql`、`redis` 访问基础服务；宿主机调试可连 `127.0.0.1:3307` 和 `127.0.0.1:6380`。

## 服务器生产部署

服务器生产部署使用 `deploy/docker-compose.prod.yml`，只启动一个 `gewehub` 应用容器。这个容器内包含前端静态入口、后端 API、`/webhook/*`、`/files/*` 代理和 Prisma 迁移；MySQL、Redis 复用同服务器现有 1Panel 容器，公网 TLS 和域名反代由服务器现有 OpenResty/1Panel 负责。

当前服务器入口约定：

- 公网域名：`https://gewehub.yunzxu.com`
- 服务器本机端口：`127.0.0.1:1870`
- 远端目录：`/opt/gewehub`
- Docker 网络：`1panel-network`
- 媒体文件挂载：`/opt/gewehub/runtime/files`
- 原始回调审计日志挂载：`/opt/gewehub/runtime/logs`

一键部署从本机构建 `linux/amd64` 镜像，上传到服务器后 `docker load` 并启动：

```bash
scripts/deploy-gewehub.sh
```

服务器 `/opt/gewehub/.env.production` 是生产配置的唯一事实来源。部署脚本只校验该文件存在、必要配置非空且管理员 bcrypt 哈希已正确引用，**不会从本地生成、上传或覆盖线上环境文件**。如需修改生产密钥，应在服务器上单独变更并保留备份，不应通过代码部署同步。

脚本不会把真实密钥写入仓库。生产容器启动时会先执行 `prisma migrate deploy`，再启动后端和 nginx。

GeWe 后台回调地址使用：

```text
https://gewehub.yunzxu.com/webhook/gewe/<WEBHOOK_SECRET>
```

部署后验证：

```bash
curl -fsS https://gewehub.yunzxu.com/api/health
ssh root@1panel.yunzxu.com 'cd /opt/gewehub && docker compose -f docker-compose.prod.yml --env-file .env.production ps'
```

## 本地冒烟

使用 `server/.env` 中配置的 `WEBHOOK_SECRET` 回放一个样本并等待 outbox 处理完成：

```bash
WEBHOOK_SECRET="<server/.env 里的 WEBHOOK_SECRET>" \
BASE_URL=http://localhost:3000 \
scripts/smoke-test.sh
```

## 不使用 Docker 时

```bash
DATABASE_URL="mysql://gewehub:gewehub@127.0.0.1:3306/gewehub" \
REDIS_URL="redis://127.0.0.1:6379/0" \
PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma \
pnpm --filter @gewehub/server exec prisma migrate deploy

pnpm --filter @gewehub/server start
pnpm --filter @gewehub/web dev -- --port 5173
```

## 备份

- 默认模式下 MySQL/Redis 数据由本机服务管理。
- `infra` / `production` profile 模式下 MySQL 数据保存在 compose volume `mysql-data`，Redis 数据保存在 `redis-data`。
- 媒体文件挂载到项目目录 `runtime/files/`，容器内路径为 `/app/server/storage/files`。
- GeWe 原始回调审计日志挂载到项目目录 `runtime/logs/`，文件名为 `webhook-raw-YYYYMMDD.log`。
- Caddy 证书和运行状态保存在 `caddy-data`，配置缓存保存在 `caddy-config`。
