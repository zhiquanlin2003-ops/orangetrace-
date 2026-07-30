# OrangeTrace · VPS 部署完整手册 (阿里云轻量 + 国内备案 + 自有域名)

> 适用场景: 30-50 元/月预算, 个人/演示用, 域名在国内备案.
> 完成时间: 不含备案等待期约 2-3 小时; 含备案 7-20 天.

---

## 阶段 1: 准备云资源 + 域名 (~30 分钟)

### 1.1 买域名 (阿里云万网)

1. 浏览器打开 https://wanwang.aliyun.com
2. 用支付宝扫码登录
3. 搜索你想要的域名(例:`orangetrace.cn` / `lawrence-os.top`)
   - `.cn` 一年 ¥29 适合国内备案
   - `.com` 一年 ¥69 通用
   - `.top` / `.site` 一年 ¥9-15 便宜但搜索引擎权重低
4. 点 **立即购买** → 实名认证(身份证拍照几分钟过审) → ¥29-69 付款
5. 在阿里云「域名控制台」→ 找到你的域名 → 看到「备案」按钮在这里

### 1.2 买 VPS (阿里云轻量服务器)

1. 阿里云首页 → 产品 → **轻量应用服务器**
2. 立即购买:
   | 配置项 | 推荐值 |
   |---|---|
   | 地域 | **杭州 / 北京 / 上海** (备案时服务器地域必须和备案主体一致) |
   | 镜像 | Ubuntu 22.04 LTS |
   | 套餐 | 2核 2GB / 3M 流量 / 60GB SSD —— **¥56/月** (有点超预算但够), 1核 1G **¥24/月 也行但 build sharp 会卡** |
   | 购买时长 | 至少 3 个月(备案要求) |
3. 创建后,在控制台 → 服务器详情 → **重置密码** (root 用户,设个强密码)
4. **开放端口**: 防火墙 → 添加规则: `TCP 80, 443, 22, 3230` 都允许

### 1.3 域名备案 (等待 7-20 天, 这是最大瓶颈)

1. 阿里云控制台 → **备案** → 新增备案
2. 走完 5 步表单:
   - 主体信息: 个人,身份证
   - 网站信息: 域名 + 服务内容选 "个人博客 / 项目展示"
   - 上传资料: 身份证正反面, 手持身份证照, 域名证书截图
3. **阿里云初审 1-2 天 → 管局审核 5-15 天 → 通过短信通知**
4. 备案通过后, 阿里云会**自动**把你的域名 + 服务器 IP 在公安备案系统登记
5. **备案期间可用 IP+端口调试** (见阶段 2), 但不要让公网通过 80 端口访问

**备案审核期间不要停服务器**, 否则备案会作废.

---

## 阶段 2: 部署服务 (~1-2 小时, 与备案并行)

### 2.1 SSH 连上 VPS

```bash
# 用你 Mac 终端
ssh root@你的VPS-IP
# 输入阶段 1.2 设的密码
```

### 2.2 装运行环境

```bash
# 更新系统
apt update && apt upgrade -y

# 装 Docker (一条命令搞定)
curl -fsSL https://get.docker.com | sh

# 装 nginx + certbot (后面 SSL 用)
apt install -y nginx certbot python3-certbot-nginx

# 装 git
apt install -y git
```

### 2.3 拉代码并构建镜像

```bash
cd /root
git clone https://github.com/zhiquanlin2003-ops/orangetrace-.git orangetrace

cd orangetrace

# 生成必要的环境变量
cat > .env.deploy <<EOF
ADMIN_USERNAME=admin
ADMIN_PASSWORD=改你的强密码
AUTH_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)
PORT=3230
NODE_ENV=production
EOF

# 构建镜像 (5-10 分钟, sharp + better-sqlite3 native 编译)
docker build -t orangetrace .

# 创建数据持久化目录
mkdir -p /data/orangetrace
```

### 2.4 用 Docker Compose 持久运行

```bash
cat > /root/orangetrace/docker-compose.yml <<EOF
version: '3.8'
services:
  app:
    image: orangetrace
    restart: always
    ports:
      - "127.0.0.1:3230:3230"   # 只监听本地, 外网通过 nginx 反代
    volumes:
      - /data/orangetrace:/data
      - /root/orangetrace/uploads:/app/uploads
      - /root/orangetrace/public/uploads:/app/public/uploads
    env_file: .env.deploy
EOF

# 启动!
docker compose up -d

# 看日志确认起来了
docker compose logs -f --tail 30
# 看到 "Ready in Xs" 就成功, Ctrl+C 退出查看
```

### 2.5 配 nginx 反向代理 + SSL

**备案没通过期间**: 直接用 `http://你的VPS-IP:3230` 访问 (调试用).

**备案通过后**, 配域名:

```bash
cat > /etc/nginx/sites-available/orangetrace <<'EOF'
server {
    listen 80;
    server_name 你的域名.com;   # ← 改成你的域名

    # SSL 证书由 certbot 后续配置, 先不要加 443
    client_max_body_size 30M;   # 重要: 允许上传图 ~20MB

    location / {
        proxy_pass http://127.0.0.1:3230;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        # 长连接 + SSE 支持 (结果页轮询用)
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_read_timeout 300s;
    }
}
EOF

# 启用配置 + 重载 nginx
ln -sf /etc/nginx/sites-available/orangetrace /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

### 2.6 域名 DNS 解析 + SSL

回到**阿里云域名控制台**:
1. 找到你的域名 → **解析** → 添加记录
2. 记录类型 `A` | 主机记录 `@` | 记录值 `你的VPS-IP` | 保存
3. (可选)再加一条:`www` → 同 IP

DNS 通常 5-10 分钟生效. 验证:
```bash
# 在 VPS 上 ping 一下自己域名
ping 你的域名.com
# 看到 解析到你自己 IP 就 OK
```

申请 SSL 证书 (Let's Encrypt 免费, 自动续期):
```bash
# 跑 certbot, 跟着交互选 1 (你的域名) → 自动配 443 + 80 跳转
certbot --nginx -d 你的域名.com -d www.你的域名.com
```

完成后访问 `https://你的域名.com` 就有锁了.

---

## 阶段 3: 验证 + 后续维护

### 3.1 首次访问,必做配置

1. 浏览器打开 `https://你的域名.com/admin/login`
2. 用 `ADMIN_USERNAME` / `ADMIN_PASSWORD` (你在 .env.deploy 里设的) 登录
3. **`/admin/apis` → 配 GLM 模型 API Key** (没有就分析跑不通)
4. **`/admin/tools` → 验证工具配置 → 配高德 Web Key + JS Key** (没地图就空)
5. 上传一张测试图验证整个流程

### 3.2 日常运维命令

| 操作 | 命令 |
|---|---|
| 看应用日志 | `docker compose logs -f --tail 50` |
| 重启应用 | `docker compose restart` |
| 停掉应用 | `docker compose down` |
| 更新代码 (push 后) | 见 3.3 |
| 查看磁盘空间 | `df -h` |
| 查看内存 | `free -m` |
| 看证书到期 | `certbot certificates` |

### 3.3 更新代码

本地:
```bash
cd ~/Desktop/Rank_Test/orangetrace
git add -A && git commit -m "feature..."
git push
```

VPS 上:
```bash
cd /root/orangetrace
git pull
docker build -t orangetrace .
docker compose up -d   # 自动 recreate 容器
```

也可以写个脚本 `/root/deploy.sh`:
```bash
#!/bin/bash
cd /root/orangetrace
git pull
docker build -t orangetrace .
docker compose up -d
docker image prune -f    # 清旧镜像
```
然后 `chmod +x /root/deploy.sh`,以后就 `bash /root/deploy.sh`.

### 3.4 备份

数据库 + 上传图定期备份到别处 (别等数据没了哭):
```bash
# 手动备份
tar -czf /tmp/orangetrace-backup-$(date +%F).tar.gz \
  /data/orangetrace /root/orangetrace/uploads

# 或加到 crontab 每天 3 点自动备份
crontab -e
# 加这行:
0 3 * * * tar -czf /data/backups/orangetrace-$(date +\%F).tar.gz /data/orangetrace /root/orangetrace/uploads
```

更稳的做法是配合阿里云 OSS / 七牛云 把备份 push 到对象存储.

---

## 常见问题

| 问题 | 解决 |
|---|---|
| `docker build` 失败 `out of memory` | 1G 内存机器容易爆, 升 2G 或加 swap: `fallocate -l 2G /swap && mkswap /swap && swapon /swap` |
| 备案拒绝 (个人备案不能放商业内容) | 网站信息选 "个人项目展示", 不要写 "AI 服务" / "工具" 等敏感词 |
| 高德地图在国内服务器上正常, 域名访问空白 | 检查高德控制台的域名白名单, 加你的域名进去 |
| 上传图显示 404 | 检查 `docker volume` 路径 + `public/uploads` 权限 |
| 502 Bad Gateway | `docker compose ps` 看容器是否在跑, `docker compose logs` 看 Next 是否报错 |
| 续费到期被回收 | 设阿里云控制台「自动续费」, 备案是绑定服务器实例的, 实例丢了备案就作废 |

---

## 时间线总览

```
Day 0 买域名 + VPS + 实名
Day 1 提交备案申请
Day 2-7 阿里云初审 (需补充材料则要几天响应)
Day 7-20 管局审核
并行: Day 1-7 部署服务 + 用 IP 调试
Day 7-20 备案完成后 DNS + nginx + SSL → 公网域名访问
```

---

## 替代方案 (无需备案)

如果不想等 7-20 天备案, 以下变体都能即用:
- **阿里云香港轻量**: ¥34/月, 不需备案, 5 分钟部署好. 国内访问速度 OK 但不如大陆节点.
- **Vultr 东京 / 新加坡**: ~$5/月 (~¥36), 不需备案.
- **Cloudflare Tunnel**: 你 Mac 上的 dev server 通过 tunnel 暴露公网. 不需服务器. 之前 cpolar 的方案, 但 Cloudflare 国内稳得多.

需要哪个变体的具体操作流程跟我说.
