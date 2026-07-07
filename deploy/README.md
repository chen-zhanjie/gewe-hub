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

## 生产 profile

`production` profile 会同时启动 MySQL、Redis、server、web 和 Caddy。Caddy 是唯一公网入口，负责 TLS 证书和反向代理：`/api/*`、`/webhook/*`、`/files/*` 转发到 server，其余路径转发到 web。

启动前至少设置：

- `GEWEHUB_DOMAIN`：公网域名，例如 `hub.example.com`。
- `ACME_EMAIL`：证书通知邮箱。
- `PUBLIC_BASE_URL`：建议在 `server/.env` 中设为 `https://${GEWEHUB_DOMAIN}`，用于生成回调与文件 URL。
- `WEB_ORIGIN`：建议设为 `https://${GEWEHUB_DOMAIN}`。

```bash
PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH" \
GEWEHUB_DOMAIN="hub.example.com" \
ACME_EMAIL="ops@example.com" \
DATABASE_URL="mysql://gewehub:gewehub@mysql:3306/gewehub" \
REDIS_URL="redis://redis:6379/0" \
/Applications/Docker.app/Contents/Resources/bin/docker compose \
  -f deploy/docker-compose.yml --profile production up --build
```

GeWe 后台回调地址使用：

```text
https://<GEWEHUB_DOMAIN>/webhook/gewe/<WEBHOOK_SECRET>
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
- 媒体文件保存在 compose volume `file-storage`。
- Caddy 证书和运行状态保存在 `caddy-data`，配置缓存保存在 `caddy-config`。
