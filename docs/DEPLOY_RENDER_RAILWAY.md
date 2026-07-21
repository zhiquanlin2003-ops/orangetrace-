# OrangeTrace 公网部署手册 (Render / Railway, 0 代码改动)

> 本方案不动你的代码, 保留所有现有功能、所有数据、所有 Key 配置。
> 5-15 分钟拿到固定公网域名 + HTTPS。
>
> **前提**: 你有一个 GitHub 账号 (https://github.com)。

---

## 关键文件 (已经全部加好)

仓库新增了:
- `Dockerfile` —— Docker 镜像构建定义
- `docker-entrypoint.sh` —— 启动脚本
- `.dockerignore` —— 不要打进镜像的目录
- `render.yaml` —— Render Blueprint (一键创建)
- `railway.json` —— Railway 部署定义
- `.gitignore` 补充 —— 屏蔽 `data/`、`*.db`、`.env*`

---

## 步骤 1: 把代码 push 到 GitHub

### 1.1 在 GitHub 创建 repo

打开 https://github.com/new

| 项 | 推荐值 | 说明 |
|---|---|---|
| Repository name | `orangetrace` | 随便起 |
| **Visibility** | **Private** ⚠️ | **强烈推荐 Private**。代码本身没硬编码密钥, 但 admin 默认密码 `admin123` 出现在源码里(strip 掉会更稳), 公开 repo 会被人扫到 |
| Add README | 不勾 | 项目已经有 |
| .gitignore | 不勾 | 已配 |
| License | 不勾 | 你自己决定 |

点 **"Create repository"**。

### 1.2 本机 git init + commit + push

在终端执行(替换 `<USER>` 和确认 repo 名):

```bash
cd ~/Desktop/Rank_Test/orangetrace

# 初始化 git 仓库
git init
git branch -M main

# 配置 git 身份 (如果还没配过)
git config user.email "你的邮箱@example.com"
git config user.name  "你的名字"

# 看一眼会被 commit 哪些文件
git add -A
git status

# ★ 重要: 确认没看到以下文件, 否则会泄露 ★
#   - .env.local
#   - data/orangetrace.db
#   - data/orangetrace.db-wal
#   - data/orangetrace.db-shm
# 如果看到了 → 手动 git rm --cached <文件名>

git commit -m "Initial commit: OrangeTrace"

# 推到 GitHub (按 GitHub 页面给你的 URL 替换)
git remote add origin git@github.com:你的用户名/orangetrace.git
git push -u origin main
```

### 1.3 验证 push 没漏
打开 GitHub repo 页面:
- ✓ 没有 `.env.local`
- ✓ 没有 `data/*.db*`
- ✓ 有 `package.json`、`src/`、`Dockerfile`、`render.yaml`、`railway.json`

---

## 步骤 2: 选 Render 或 Railway, 任选其一

### 方案 A: Render (推荐新手, 完全免费层 + 自动 SSL)

#### A.1 注册 Render
1. 打开 https://dashboard.render.com/register
2. 用 **GitHub 账号登录**(点 Sign Up with GitHub)
3. 授权 Render 访问你的 repo (选 "All repositories" 或单选 `orangetrace`)

#### A.2 创建服务 (用 Blueprint 一键)
1. Render dashboard → 右上 **"New +"** → **"Blueprint"**
2. 选你的 `orangetrace` repo
3. Render 自动检测到 `render.yaml`, 列出 1 个服务 (`orangetrace`), **Apply**
4. 自动跳到部署页, 第一次构建 5-10 分钟 (装 native 模块 + next build)
5. 部署完成 → 右上角 "Manual Deploy" 旁边能看到 **公网 URL**:
   ```
   https://orangetrace-xxxx.onrender.com
   ```

#### A.3 配置必填的环境变量 (deploy 完成, 还会失败一次, 需要补)
Render dashboard → 你的服务 → 左侧 **"Environment"** → 设置以下 4 个:

| Key | Value | 说明 |
|---|---|---|
| `ADMIN_USERNAME` | `admin` | 后台登录账号 |
| `ADMIN_PASSWORD` | `你能记得住的强密码` | 后台密码 (别用 admin123) |
| `AUTH_SECRET` | 跑 `openssl rand -hex 32` 生成的 32 字节 hex | JWT 加密密钥 |
| `ENCRYPTION_KEY` | 跑 `openssl rand -hex 32` 生成的另一个 32 字节 hex | 数据库 Key 加密密钥 |

> 注意: `ENCRYPTION_KEY` **千万不要改** —— 改了之后旧的 amap key 解不开; 这是你**新部署**所以没旧数据, 用新生成的就行。

保存后 Render 自动 redeploy, 5 分钟后再次访问 URL。

### 方案 B: Railway (Console 更现代, 但 $5/月起送 $0.05/hour 等)

#### B.1 注册 Railway
1. 打开 https://railway.app/login
2. 用 **GitHub 登录**

#### B.2 从 repo 部署
1. 点 **"New Project"** → **"Deploy from GitHub Repo**
2. 选 `orangetrace` repo → "Deploy Now"
3. Railway 检测到 `railway.json`, 自动 build

#### B.3 必加配置
1. 项目页 → Settings → **"Networking"** → "Generate Domain"
   ```
   https://orangetrace-production.up.railway.app
   ```
2. 项目页 → Variables → 加上述 4 个环境变量
3. 项目页 → Settings → **"Volumes"** → Add Volume, mount path = `/data` (1 GB)

#### B.4 计费注意
Railway 试用 $5 / 500 小时, 之后按用量收费。个人小型项目每月大约 $5-10, 比 Render 体验稳但**要花钱**。

---

## 步骤 3: 验证部署

打开你的新公网 URL:

| 路径 | 预期 |
|---|---|
| `/` | 首页 (橙色 SaaS landing page) |
| `/admin/login` | 后台登录页, 用 ADMIN_USERNAME/ADMIN_PASSWORD 登录 |
| `/analyze` | 上传图分析 |
| `/admin/apis` | **必须配置**: GLM/OpenAI/通义 API Key |
| `/admin/tools` 验证工具配置 tab | **必须配置**: 高德 Web Key + JS Key + 安全密钥 |

### ⚠️ 注意:第一次部署后必须做的事

1. **后台配置 GLM Key** (否则分析会报"尚未配置模型 API")
   - `/admin/apis` → 新增 → 填 OpenAI 兼容 endpoint + Key + model
2. **后台配置 高德 Web/JS Key** (否则地图 + POI 验证不工作)
   - `/admin/tools` 验证工具配置 → 编辑 amap_web / amap_js
3. **改 ADMIN_PASSWORD 为强密码** (源码默认 admin123,容易被弱口令爆破)
4. **第一次 `/analyze`** 会跑 5-10 秒, 等模型 + 工具跑完 → 自动跳转结果页

---

## 步骤 4: 后续维护

### 想更新代码?
```bash
git add -A && git commit -m "your change" && git push
```
Render / Railway 自动重新 build + redeploy, 5-10 分钟后生效。

### 想保留本地数据库?
**不需要** —— Render/Railway 部署后是全新的 SQLite + 你的种子数据, 本地数据不会污染公网版本。两边数据各自独立。

### Render 免费层限制
- **15 分钟无访问会 sleep**, 下次访问 30-60s 冷启动
- 100 GB/月 流量 (个人用绰绰有余)
- 750 小时/月 (大约 31 天,够一个完整月)
- 解决 sleep: 给自己挂一个 UptimeRobot https://stats.uptimerobot.com/ 免费 ping, 每 10 分钟戳一次, 保持唤醒

### Railway 计费警告
- 部署后立刻在 Settings → Usage 看用量
- 看着 $5 额度消耗情况决定是否升级或转 Render

---

## 故障排查

| 错误 | 原因 | 解决 |
|---|---|---|
| Build failed: `better-sqlite3` native build | Dockerfile 没装 编译工具 | 检查 Dockerfile `RUN apt-get install -y python3 make g++` |
| Deploy 后 / 报 500 | `ENCRYPTION_KEY` 没配置 | Environment 里加 4 个必填 env |
| `/admin/login` 提示密码错 | ADMIN_PASSWORD 没 push 正确 (本地 .env.local 没 push) | 在 Render/Railway Environment 上手动配 |
| `/analyze` 报"无模型 API" | 没配 GLM | `/admin/apis` 添加 |
| 候选地图空白 | 没配 高德 JS Key | `/admin/tools` 验证工具配置 |
| 域名访问慢 (~10s) | Render 冷启动 | 等几小时 / 加 UptimeRobot 唤醒 |
| Build 超时 | next build 慢, > 10 min | Railway 不会, Render 免费层可能要 retry |

---

## 部署完成后的公网 URL 长这样

- **Render**: `https://orangetrace-xxxx.onrender.com`
- **Railway**: `https://orangetrace-production.up.railway.app`

两者都是 **永久固定 + HTTP + 自动续期 SSL**, 7x24 在线,不依赖你的 Mac 是否开机。

---

## 你做完部署后告诉我, 我帮你验证域名 + 配 GLM/高德 Key
