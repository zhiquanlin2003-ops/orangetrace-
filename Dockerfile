# syntax=docker/dockerfile:1.7

# ─── 构建阶段 ───────────────────────────────────────────────────
FROM node:20-bookworm-slim AS builder

# better-sqlite3 / sharp 等 native 模块编译依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ libvips-dev ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 先 copy manifests, 利用 Docker 层缓存
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# 单独 copy 配置文件 (避免 cache 失效过频)
COPY next.config.ts tsconfig.json ./

# copy 源码
COPY src ./src
COPY public ./public

# 注意:不要把 data/ 上传到镜像,因为容器是只读的,数据库运行时落在 /data Volume
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=file:/data/orangetrace.db

RUN npm run build


# ─── 运行阶段 ───────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runner

# sharp 运行时仍需 libvips
RUN apt-get update && apt-get install -y --no-install-recommends \
    libvips-dev ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3230
ENV HOSTNAME=0.0.0.0
# 数据库 Volume (Render/Railway 都会挂这块)
ENV DATABASE_URL=file:/data/orangetrace.db

# 只 copy 运行时必要内容(镜像更小,冷启动更快)
COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json* ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./

# 启动脚本 (创建 /data 目录 + 自动 seed 数据库)
RUN mkdir -p /data /app/uploads /app/public/uploads
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3230

# tini 解决 SIGTERM 信号转发,优雅关闭
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["npm", "start"]
