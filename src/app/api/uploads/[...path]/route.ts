import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

export const runtime = "nodejs";

/**
 * GET /api/uploads/[...path]
 * 动态 serve /app/public/uploads/ 下的图片文件.
 *
 * Next.js production 模式下, public/ 目录只在 build 时静态拷贝,
 * 运行时写入的文件 (如分析缩略图 /uploads/xxx.jpg) 不被 Next 自动 serve.
 * 这个 route 显式读文件并返回, 保证任何情况 (docker / 本地 prod) 都能拿到图片.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params;
  const filename = segments[segments.length - 1];

  // 安全校验: 只允许 jpg/jpeg/png/webp/gif
  if (!/\.(jpg|jpeg|png|webp|gif)$/i.test(filename)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const filePath = path.join(process.cwd(), "public", "uploads", filename);
  try {
    const buf = await readFile(filePath);
    const ext = path.extname(filename).toLowerCase();
    const contentType =
      ext === ".png" ? "image/png" :
      ext === ".webp" ? "image/webp" :
      ext === ".gif" ? "image/gif" :
      "image/jpeg";
    return new NextResponse(buf, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
