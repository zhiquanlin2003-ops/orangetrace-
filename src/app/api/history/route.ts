import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { safeJsonParse } from "@/lib/utils";
import { requireAdmin } from "@/lib/auth";
import type { AnalysisResult } from "@/lib/types";

export const runtime = "nodejs";

/**
 * GET /api/history - 最近分析列表 (仅管理员)
 */
export async function GET(_req: NextRequest) {
  const r = await requireAdmin();
  if (!r.ok) {
    return NextResponse.json({ error: "需要管理员登录后查看历史" }, { status: 401 });
  }
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT id, created_at, status, filename, thumb_path, model_name, confidence, error FROM analyses ORDER BY created_at DESC LIMIT 100",
    )
    .all() as any[];

  const items = rows.map((r) => {
    let placeLabel = "";
    const full = db
      .prepare("SELECT result_json FROM analyses WHERE id = ?")
      .get(r.id) as { result_json: string | null } | undefined;
    const result = safeJsonParse<AnalysisResult | null>(full?.result_json ?? null, null);
    if (result?.top_location) {
      const t = result.top_location;
      placeLabel = [t.country, t.city, t.region].filter((x) => x && x.trim() && x !== "不确定").join(" · ") || "未确定";
    }
    return {
      id: r.id,
      created_at: r.created_at,
      status: r.status,
      filename: r.filename,
      thumb_path: r.thumb_path,
      model_name: r.model_name,
      confidence: r.confidence,
      place: placeLabel,
      error: r.error,
    };
  });

  return NextResponse.json({ items });
}

/**
 * DELETE /api/history?id=xxx - 删除一条分析 (仅管理员)
 */
export async function DELETE(req: NextRequest) {
  const r = await requireAdmin();
  if (!r.ok) {
    return NextResponse.json({ error: "需要管理员登录" }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "缺少 id 参数" }, { status: 400 });
  }

  const db = getDb();

  // 获取缩略图路径, 删文件
  const row = db.prepare("SELECT thumb_path, image_path FROM analyses WHERE id = ?").get(id) as any;

  const tx = db.transaction(() => {
    db.prepare("DELETE FROM candidate_locations WHERE analysis_id = ?").run(id);
    db.prepare("DELETE FROM tool_executions WHERE analysis_id = ?").run(id);
    db.prepare("DELETE FROM verification_evidence WHERE analysis_id = ?").run(id);
    db.prepare("DELETE FROM analysis_conversations WHERE analysis_id = ?").run(id);
    db.prepare("DELETE FROM analyses WHERE id = ?").run(id);
  });
  tx();

  // 删缩略图文件 (best-effort)
  if (row?.thumb_path) {
    try {
      const fs = require("fs");
      const path = require("path");
      const thumbAbs = path.join(process.cwd(), "public", row.thumb_path);
      if (fs.existsSync(thumbAbs)) fs.unlinkSync(thumbAbs);
    } catch {}
  }

  return NextResponse.json({ ok: true });
}
