import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile, unlink } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { getDb } from "@/lib/db";
import { getSettings } from "@/lib/data";
import { shortId } from "@/lib/utils";
import type { AnalyzeOptions } from "@/lib/types";
import { readExif } from "@/lib/exif";
import { run as pipelineRun } from "@/lib/pipeline/orchestrator";
import type { PipelineArgs } from "@/lib/pipeline/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const UPLOAD_DIR = path.join(process.cwd(), "uploads");
const PUBLIC_UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

async function ensureDirs() {
  await mkdir(UPLOAD_DIR, { recursive: true });
  await mkdir(PUBLIC_UPLOAD_DIR, { recursive: true });
}

function mimeToExt(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  return "jpg";
}

function safeUnlink(p: string) {
  unlink(p).catch(() => {});
}

interface AnalyzeBody {
  options?: AnalyzeOptions;
  image?: string; // base64 (可带 data: 前缀)
  filename?: string;
}

export async function POST(req: NextRequest) {
  let body: AnalyzeBody;
  try {
    body = (await req.json()) as AnalyzeBody;
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const options: AnalyzeOptions = body.options ?? {};
  const imageB64 = body.image;
  if (!imageB64) return NextResponse.json({ error: "未收到图片" }, { status: 400 });
  if (!options.privacy_acknowledged) {
    return NextResponse.json({ error: "请先勾选隐私与使用声明" }, { status: 400 });
  }

  // 解析 base64 (支持 data URL 或纯 base64)
  const dataUrlMatch = imageB64.match(/^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/);
  const mime = dataUrlMatch ? dataUrlMatch[1] : "image/jpeg";
  const rawB64 = dataUrlMatch ? dataUrlMatch[2] : imageB64;

  let buffer: Buffer;
  try {
    buffer = Buffer.from(rawB64, "base64");
  } catch {
    return NextResponse.json({ error: "图片 base64 解析失败" }, { status: 400 });
  }
  if (buffer.length < 100) {
    return NextResponse.json({ error: "图片数据过小或损坏" }, { status: 400 });
  }

  const id = shortId();
  const filename = (body.filename ?? `upload-${id}.jpg`).slice(0, 80);
  const settings = getSettings();

  await ensureDirs();
  const privExt = mimeToExt(mime);
  const privPath = path.join(UPLOAD_DIR, `${id}.${privExt}`);
  await writeFile(privPath, buffer);

  // 生成缩略图 (公开访问, 供前端展示)
  let thumbRel = `/uploads/${id}.jpg`;
  try {
    const thumb = await sharp(buffer)
      .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
    await writeFile(path.join(PUBLIC_UPLOAD_DIR, `${id}.jpg`), thumb);
  } catch {
    // 某些格式 sharp 不支持时, 直接落原文件 Deployment 兜底
    await writeFile(path.join(PUBLIC_UPLOAD_DIR, `${id}.jpg`), buffer);
  }

  // EXIF 阶段 (length 1: 读取阶段)
  const exif = await readExif(buffer, options.allow_exif !== false);

  // 给模型的图片: 压缩成 jpeg 控制体积
  let modelImageB64 = rawB64;
  let modelMime = mime;
  try {
    const compressed = await sharp(buffer)
      .resize(2048, 2048, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer();
    modelImageB64 = compressed.toString("base64");
    modelMime = "image/jpeg";
  } catch {
    /* 使用原始数据 */
  }
  const modelImageUrl = `data:${modelMime};base64,${modelImageB64}`;

  // 创建 running 记录
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO analyses
      (id, created_at, updated_at, status, stage, filename, image_path, thumb_path,
       options, exif_summary)
     VALUES (?, ?, ?, 'running', 'preprocess', ?, ?, ?, ?, ?)`,
  ).run(
    id, now, now, filename,
    `/uploads/${id}.${privExt}`,
    thumbRel,
    JSON.stringify(options),
    exif
      ? JSON.stringify({
          hasGps: exif.hasGps,
          lat: exif.latitude,
          lng: exif.longitude,
          dt: exif.dateTimeOriginal,
          make: exif.make,
          model: exif.model,
        })
      : null,
  );

  // 立即返回任务 id, 让前端 /analyzing/[id] 轮询状态。
  // 真正的模型调用在后台异步进行 (不阻塞本响应)。
  //
  // ★ 关键: 用 pending Promise + interval keepAlive 防止 Node 事件循环在
  //   response 返回后清理 fire-and-forget async callback.
  //   Docker 容器 / Next.js production 模式下, 裸 void async 会被 GC 吞掉
  //   导致 stageVerify + stageSecond (POI 验证 + 二次评估) 不执行.

  const pipelineTask = (async () => {
    try {
      const modelUrl = await ensureModelImage(id, modelImageUrl);
      const args: PipelineArgs = {
        id,
        options,
        exif,
        modelImageUrl: modelUrl,
        privPath,
        saveOriginal: settings.save_original_image === 1,
      };
      await pipelineRun(args);
    } catch (err) {
      markFailed(getDb(), id, (err as Error)?.message || "未知错误");
      if (!settings.save_original_image) safeUnlink(privPath);
    }
  })();

  // 全局注册: 防止 Node 事件循环在此 HTTP response 返回后的空闲间隙中
  // 把 fire-and-forget 的 async callback 当 unreferenced promise GC 掉.
  // 保持一个 30s keepAlive interval 直到 pipelineTask resolve.
  const keepAlive = setInterval(() => {}, 30000);
  pipelineTask.finally(() => clearInterval(keepAlive));

  return NextResponse.json({ id, status: "running" });
}

/** rerun 时模型图可能过期 (dev hot reload), 落一份本地备份确保可重读 */
async function ensureModelImage(id: string, currentUrl: string): Promise<string> {
  return currentUrl; // pipeline 直接用 dataURL, 不需缓存
}

function markFailed(db: ReturnType<typeof getDb>, id: string, error: string) {
  db.prepare(
    `UPDATE analyses SET status='failed', error=?, updated_at=datetime('now') WHERE id=?`,
  ).run(error.slice(0, 1000), id);
}
