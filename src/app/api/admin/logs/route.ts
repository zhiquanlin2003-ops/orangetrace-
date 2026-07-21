import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { adminGuard } from "@/lib/api-guard";
import { safeJsonParse } from "@/lib/utils";
import type { AnalysisResult, AnalyzeOptions } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const g = await adminGuard();
  if (!g.ok) return g.response;
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "100"), 500);
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? "0"));
  const status = url.searchParams.get("status");

  const where = status ? "WHERE status = ?" : "";
  const params = status ? [status] : [];
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM analyses ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as any[];

  const items = rows.map((r) => ({
    id: r.id,
    created_at: r.created_at,
    updated_at: r.updated_at,
    status: r.status,
    filename: r.filename,
    image_path: r.image_path,
    thumb_path: r.thumb_path,
    options: safeJsonParse<AnalyzeOptions>(r.options, {}),
    exif_summary: safeJsonParse<any>(r.exif_summary, null),
    model_name: r.model_name,
    api_id: r.api_id,
    prompt_tokens: r.prompt_tokens,
    completion_tokens: r.completion_tokens,
    total_tokens: r.total_tokens,
    duration_ms: r.duration_ms,
    confidence: r.confidence,
    error: r.error,
    result: safeJsonParse<AnalysisResult | null>(r.result_json, null),
  }));

  const total = (
    db.prepare(`SELECT COUNT(*) as c FROM analyses ${where}`).get(...params) as {
      c: number;
    }
  ).c;

  return NextResponse.json({ items, total });
}
