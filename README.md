# 橙迹 OrangeTrace 🍊

> 用一张图片，寻找世界的线索。  
> 多模态 AI + OSINT 方法论的图片地理定位推理工具。

上传一张图片，让多模态大模型结合 OSINT 地理定位方法，像侦探一样逐项分析线索，
给出**候选地点 + 可解释推理链路 + 验证建议**，而非武断地下结论。

---

## ✨ 特性

- **侦探报告式结果**：最可能地点 / 多候选 / 线索拆解 / 推理链路 / 验证建议，结构化呈现。
- **OSINT 方法库（SKILL）**：内置 12 条方法论，并支持上传 HTML / Markdown 自动解析扩充，作为模型上下文。
- **多模型支持**：OpenAI、智谱 GLM、通义千问、Claude、Gemini、自定义 OpenAI 兼容 API，一键切换 / 测试。
- **API Key 加密**：AES-256-GCM 入库，前端永远只看到掩码，绝不明文暴露。
- **EXIF 优先**：若图片含 GPS / 时间 / 设备元数据且用户允许，作为最可靠线索优先使用。
- **保守置信度**：高 / 中 / 低 + 0–100 分；不确定就不强编造经纬度。
- **隐私优先**：私人场所降级精度、原图可自动删除、声明必须勾选。
- **白橙配色 SaaS UI**：响应式，桌面 / 移动端皆可用。

---

## 🚀 快速开始

### 1. 安装依赖

```bash
cd orangetrace
npm install
```

### 2. 配置环境变量

复制示例配置（默认值可直接用于本地）：

```bash
cp .env.example .env.local
```

`.env.local` 关键项（默认值已可用，生产环境请修改）：

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `ADMIN_USERNAME` | 后台管理员用户名 | `admin` |
| `ADMIN_PASSWORD` | 后台管理员密码 | `admin123` |
| `AUTH_SECRET` | JWT 签名密钥（**生产必改**） | 随机串 |
| `ENCRYPTION_KEY` | API Key 加密密钥（**生产必改**，可用 `openssl rand -hex 32` 生成） | 全 0 |
| `DATABASE_URL` | SQLite 路径 | `file:./data/orangetrace.db` |

### 3. 启动开发服务器

```bash
npm run dev
```

打开 [http://localhost:3230](http://localhost:3230) 即可。

> 默认使用 **3230** 端口（在 `package.json` 的 `scripts.dev` 中以 `-p 3230` 指定），
> 避免与本机另一个同名橙迹项目（端口 3030）或 Next.js 默认 3000 冲突。如需修改直接改脚本即可。

> 首次启动会**自动初始化 SQLite 数据库**并写入默认数据（管理员账号、12 条 OSINT 方法、5 个 Prompt 模板、14 个外部工具），无需手动建表。

### 4. 配置模型 API（必须）

前台分析需要先在后台配置一个启用的多模态模型 API：

1. 访问 [http://localhost:3230/admin/login](http://localhost:3230/admin/login)，用 `admin` / `admin123` 登录。
2. 进入 **API 配置 → 新增配置**，填写：
   - 提供商：智谱 GLM / OpenAI / 通义 / Claude / Gemini / 自定义
   - Base URL（选提供商后会自动填）
   - API Key
   - 模型名称（如 `glm-4v`、`gpt-4o`、`qwen-vl-max`）
   - 勾选「启用」+「设为默认」
3. 保存后可点「测试」验证连通性。

### 5. 开始分析

访问 [http://localhost:3230/analyze](http://localhost:3230/analyze)，上传图片 → 勾选隐私声明 → 开始分析。

---

## 🧭 页面结构

**前台**

| 路径 | 说明 |
| --- | --- |
| `/` | 首页：品牌 Hero + 能力展示 + 工作流 |
| `/analyze` | 图片上传 + 补充信息 + 隐私声明 + 仪式感分析进度 |
| `/result/[id]` | 侦探报告结果页（候选 / 线索 / 推理 / 验证工具） |
| `/history` | 历史分析记录卡片墙 |
| `/privacy` | 隐私与安全说明 |

**后台**（需登录）

| 路径 | 说明 |
| --- | --- |
| `/admin/login` | 管理员登录 |
| `/admin` | 仪表盘：统计 + 14 天趋势 + 快速入口 |
| `/admin/apis` | 多模型 API 配置（加密 Key、默认模型、连通性测试） |
| `/admin/skills` | 方法库管理（上传 HTML/MD 自动解析 + 手动编辑 + 启停 + 优先级） |
| `/admin/prompts` | Prompt 模板编辑（系统 / 图片分析 / 输出格式 / 安全 / JSON 模板） |
| `/admin/tools` | 外部工具与数据源维护 |
| `/admin/logs` | 分析日志（模型、Token、耗时、错误、完整 JSON） |
| `/admin/settings` | 原图保留策略 |

---

## 🧠 模型分析逻辑

调用多模态模型时，系统会：

1. 把**启用 + 按优先级排序**的方法库压成方法论上下文；
2. 拼接系统提示词 + 安全约束 + 输出格式约定；
3. 把**图片分析提示词 + EXIF（若允许）+ 用户补充信息**作为用户消息；
4. 要求模型严格输出固定 JSON 结构（见下）；
5. 后端解析、容错、入库，前端再渲染为可视化侦探报告。

**模型输出 JSON 契约**：

```json
{
  "summary": "一句话总结判断结果",
  "top_location": { "country": "", "city": "", "region": "", "coordinates": "", "confidence": 0 },
  "candidates": [{ "location": "", "confidence": 0, "supporting_evidence": [], "weakness": [] }],
  "clues": { "text": [], "architecture": [], "infrastructure": [], "natural_geography": [], "light_shadow": [], "exif": [], "other": [] },
  "reasoning_steps": [],
  "verification_suggestions": [],
  "safety_note": ""
}
```

---

## 📦 技术栈

- **Next.js 15** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS v4**（白橙设计系统）
- **better-sqlite3**（开发期数据库，零配置）
- **sharp**（图片缩略图 / 压缩）
- **exifr**（EXIF 元数据解析）
- **jose**（JWT 管理员会话）
- Node `crypto`（AES-256-GCM 加密 API Key）
- **lucide-react**（图标）

---

## 🔐 安全与隐私

- ✅ API Key 在入库前用 **AES-256-GCM** 加密，前端仅展示掩码。
- ✅ 管理员会话用 **JWT + httpOnly Cookie**，7 天有效。
- ✅ 中间件用 Edge Runtime **仅校验 JWT**，不接触数据库。
- ✅ 对居住地 / 学校 / 医院等私人场所，系统提示词强制要求**降级精度**（只输出城市 / 大区域）。
- ✅ 原图可配置自动删除或完全不保存（仅留缩略图）。
- ✅ 上传前**必须勾选**隐私与使用声明。
- ⚠️ 结果为 AI 推理，**不保证准确**，结果页会强调人工复核。

---

## 📁 项目结构

```
orangetrace/
├── src/
│   ├── app/
│   │   ├── api/                    # API Routes
│   │   │   ├── analyze/            # 上传 + 调用 LLM + 入库
│   │   │   ├── result/[id]/        # 单条结果
│   │   │   ├── history/            # 列表
│   │   │   ├── tools/              # 公开工具推荐
│   │   │   └── admin/              # apis / skills / prompts / tools / logs / settings / stats / auth
│   │   ├── admin/                  # 后台页面 (含 AdminShell 侧边栏)
│   │   ├── analyze/ result/[id]/ history/ privacy/   # 前台页面
│   │   ├── layout.tsx page.tsx globals.css
│   ├── components/
│   │   ├── ui/                     # Button / Card / Input / Badge / Dialog / ...
│   │   ├── layout/                 # Navbar / Footer
│   │   └── widgets/                # Logo / MapBackdrop / AnalyzeProgress / ResultReport
│   ├── lib/
│   │   ├── db/                     # SQLite schema + seed + 默认 prompts
│   │   ├── llm.ts                  # OpenAI 兼容 LLM 客户端 + 结果解析
│   │   ├── prompt-builder.ts       # 组装系统 / 用户 prompt
│   │   ├── skill-parser.ts         # HTML/MD → 结构化方法
│   │   ├── exif.ts crypto.ts auth.ts ...
│   └── middleware.ts               # /admin/* 鉴权 (Edge)
├── data/                           # SQLite 文件 (运行时生成)
├── uploads/ public/uploads/        # 上传图片 (运行时生成)
├── .env.local                      # 本地环境变量
└── package.json
```

---

## 🛠 常见操作

**切换默认模型**：后台 `API 配置` → 选定配置 → 「设为默认」。

**上传方法论文档**：后台 `方法库 / SKILL` → 「上传方法文件」→ 选 HTML / Markdown / TXT，系统会按标题自动拆成多条结构化方法（含关键线索、推荐工具、注意事项、自动归类）。

**调整 Prompt**：后台 `Prompt 模板` → 选择要编辑的模板 → 修改 → 保存。可「恢复默认」。

**清理原图**：后台 `站点设置` → 关闭「保存原图」，或缩短自动删除时长。

---

## 🎨 样式异常排查（出现「裸 HTML / 灰色按钮」时）

本项目样式系统（Tailwind v4 + 白橙设计令牌）一直是正常的。如果页面突然变成浏览器默认样式，
**99% 是浏览器缓存与 `.next` 产物版本错位**导致，不是代码问题。按顺序排查：

1. **强制刷新浏览器**（最常见、通常第一步就解决）：
   - Mac：`Cmd + Shift + R`
   - Win/Linux：`Ctrl + Shift + R` 或 `Ctrl + F5`
   - 或 DevTools(F12) → 右键刷新按钮 →「清空缓存并硬性重新加载」
2. 重启 dev 服务器（`npm run dev` 已配置为每次启动前清理 `.next`，避免构建产物错位）：
   ```bash
   pkill -f "next dev -p 3230"; npm run dev
   ```
3. 若仍异常，确认 `src/app/layout.tsx` 顶部有 `import "./globals.css";`，
   且 `postcss.config.mjs` 使用 `@tailwindcss/postcss`（无需 `tailwind.config.js`）。

---

## 🧪 生产部署

```bash
npm run build
npm start
```

建议：把 SQLite 换成 PostgreSQL、把 `uploads/` 换成对象存储、把 `AUTH_SECRET` 和 `ENCRYPTION_KEY` 换成长随机串。

---

## ⚠️ 免责声明

橙迹 OrangeTrace 仅供**研究、学习与合法用途**。请只上传你有权分析的图片；
**不鼓励、不协助**用于人肉搜索、骚扰、跟踪或侵犯他人隐私。结果为 AI 推理，可能出错，
务必人工复核后再做判断。使用者需遵守所在地区法律法规。
