#!/bin/sh
# Docker 容器启动入口
# 1. 确保数据目录存在
# 2. 首次启动自动 seed 数据库 (getDb 会自动建表 + seed)
# 3. 启动 Next.js prod server

set -e

# 容器持久化 Volume
mkdir -p /data
mkdir -p /app/uploads
mkdir -p /app/public/uploads

echo "[entrypoint] DATABASE_URL=$DATABASE_URL"
echo "[entrypoint] PORT=$PORT  HOSTNAME=$HOSTNAME"
echo "[entrypoint] starting: $@"

# 把 PORT 暴露给 next start
export PORT="${PORT:-3230}"
export HOSTNAME="${HOSTNAME:-0.0.0.0}"

# 把 npm start 改写成直接 node next start 让 PORT 生效
exec npx next start -p "$PORT" -H "$HOSTNAME"
