# syntax=docker/dockerfile:1.7

# ─── 构建阶段 ───────────────────────────────────────────────────
FROM node:20-bookworm-slim AS builder

# better-sqlite3 / sharp 等 native 模块编译依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ libvips-dev ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ★★★ 关键修复: node:20 镜像默认 NODE_ENV=production, 让 Next 15 build 跳过 PostCSS 流程
#     从而 @tailwindcss/postcss 没被调用, CSS 里的 @theme 不会被消费
# 解决: 显式把 builder 阶段的 NODE_ENV 改成空, 让 npm + Next 都走默认行为, 装齐 + 编译 CSS
ENV NODE_ENV=

# 先 copy manifests, 利用 Docker 层缓存
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

# 单独 copy 配置文件 (避免 cache 失效过频)
COPY next.config.ts tsconfig.json ./
COPY postcss.config.mjs ./

# copy 源码
COPY src ./src
COPY public ./public

# 不要在 builder 阶段设 NODE_ENV=production, 否则 Next 跳过 PostCSS 导致 Tailwind v4 不编译
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=file:/data/orangetrace.db

RUN npm run build

# 验证 CSS 真的被编译了
RUN head -c 50 /app/.next/static/css/*.css | head -1 | grep -E "tailwindcss|@layer properties" || (echo "CSS STILL NOT COMPILED" && exit 1)

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
ENV DATABASE_URL=file:/data/orangetrace.db

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
