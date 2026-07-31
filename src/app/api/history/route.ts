import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { safeJsonParse } from "@/lib/utils";
import { requireAdmin } from "@/lib/auth";
import type { AnalysisResult } from "@/lib/types";

export const runtime = "nodejs";

/**
 * GET /api/history - 最近分析列表 (只返回列表所需字段)
 * ⚠ 仅管理员可见: 历史记录可能含用户上传的图片指纹/位置信息, 不应公开
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
    // 为了显示判断地点, 单独再读 result_json
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
