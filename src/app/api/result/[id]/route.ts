import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { safeJsonParse } from "@/lib/utils";
import { ALL_TOOLS } from "@/lib/tools/registry";
import { loadCandidates, loadPersistedToolResults } from "@/lib/pipeline/persist";
import type { AnalysisResult, AnalyzeOptions, CandidateLocation } from "@/lib/types";

export const runtime = "nodejs";

/** GET /api/result/[id] - 取单条分析结果 (脱敏: 不返回 options 内未必要字段) */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM analyses WHERE id = ?")
    .get(id) as any;
  if (!row) {
    return NextResponse.json({ error: "记录不存在" }, { status: 404 });
  }
  const result = safeJsonParse<AnalysisResult | null>(row.result_json, null);

  // 分析中时附带 stage / tool_status / candidates (供分析中页推进 / 工具状态)
  let stage: string | undefined;
  let toolStatus: any[] | undefined;
  let candidates: any[] | undefined;
  const isRunning = row.status === "running" || row.status === "verifying" || row.status === "pending";
  if (isRunning) {
    stage = row.stage ?? "preprocess";
    const toolRows = db
      .prepare("SELECT tool_name, status, candidate_id FROM tool_executions WHERE analysis_id = ?")
      .all(id) as Array<{ tool_name: string; status: string; candidate_id: string | null }>;
    const done = new Set(toolRows.map((t) => t.tool_name));
    toolStatus = ALL_TOOLS.map((t) => {
      const r = toolRows.find((tr) => tr.tool_name === t.name);
      if (r) return { tool: t.name, label: t.label, status: r.status, enabled: true };
      return { tool: t.name, label: t.label, status: stage === "tools" ? "pending" : "waiting", enabled: t.isEnabled() };
    }).filter((t) => t.enabled || done.has(t.tool));
    candidates = loadCandidates(id);
  }

  // 从 candidate_locations 表里把候选详细数据 (含工具回填的坐标 + 省/市/区/县) 注入 result,
  // 让结果页地图 / 候选列表 / CrossVerification 直接消费。两种状态都需要。
  const candidateDetails = loadCandidates(id);
  let enrichedResult = result;
  if (enrichedResult && candidateDetails.length > 0) {
    enrichedResult = {
      ...enrichedResult,
      candidate_locations: candidateDetails.map((c) => ({
        id: c.id,
        rank: c.rank,
        country: c.country,
        province: c.province,
        city: c.city,
        district: c.district,
        name: c.name,
        latitude: c.latitude,
        longitude: c.longitude,
        coordinate_system: c.coordinate_system,
        initial_confidence: c.initial_confidence,
        final_confidence: c.final_confidence,
        status: c.status,
      })),
    } as AnalysisResult;
  }
  if (!isRunning) stage = row.stage ?? "report";

  // 实时重建 tool_results: 不再依赖 result_json 内的快照 (可能是上次 stale 的写法),
  // 直接从 tool_executions 表抽, 用最新逻辑生成 label (含候选 ctx 区分多候选同 tool)。
  // 这确保即使该分析的历史 result_json 已写死, 前台也始终看到最新的工具记录与标签。
  if (enrichedResult) {
    const cidToLabel = new Map(candidateDetails.map((c) => [c.id, shortCandidateLabel(c)] as const));
    const persistedResults = loadPersistedToolResults(id);
    if (persistedResults.length > 0) {
      const freshToolResults = persistedResults.map((r) => {
        let evFor: string[] = [];
        let evAgainst: string[] = [];
        try {
          const p = JSON.parse(r.evidence_json);
          const evs: any[] = Array.isArray(p?.evidence) ? p.evidence : [];
          evFor = evs.filter((e) => e.type === "support").map((e) => String(e.title).slice(0, 200)).slice(0, 5);
          evAgainst = evs.filter((e) => e.type === "oppose").map((e) => String(e.title).slice(0, 200)).slice(0, 5);
        } catch {}
        const ctx = r.candidate_id && r.candidate_id !== "_global_" ? cidToLabel.get(r.candidate_id) : "";
        return {
          tool: r.tool_name,
          label: ctx ? `${r.tool_name} · ${ctx}` : r.tool_name,
          status: (r.status === "success" || r.status === "failed" || r.status === "skipped" ? r.status : "failed") as
            | "success" | "failed" | "skipped",
          summary: r.summary,
          evidence_for: evFor,
          evidence_against: evAgainst,
          source: r.tool_name,
          executed_at: r.created_at,
          duration_ms: r.duration_ms,
          mock: r.mock === 1,
        };
      });
      enrichedResult = { ...enrichedResult, tool_results: freshToolResults } as AnalysisResult;
    }
  }

  return NextResponse.json({
    id: row.id,
    status: row.status,
    stage,
    progress: stageProgress(row.status, stage),
    tool_status: toolStatus,
    candidates,
    created_at: row.created_at,
    updated_at: row.updated_at,
    filename: row.filename,
    thumb_path: row.thumb_path,
    image_path: row.image_path,
    options: safeJsonParse<AnalyzeOptions>(row.options, {}),
    exif_summary: safeJsonParse<any>(row.exif_summary, null),
    model_name: row.model_name,
    prompt_tokens: row.prompt_tokens,
    completion_tokens: row.completion_tokens,
    total_tokens: row.total_tokens,
    duration_ms: row.duration_ms,
    confidence: row.confidence,
    initial_confidence: row.initial_confidence,
    error: row.error,
    result: enrichedResult,
  });
}

function stageProgress(status: string, stage?: string | null): number {
  if (status === "success") return 100;
  const order = ["preprocess", "initial", "candidate", "tools", "cross", "report"];
  const i = order.indexOf(stage ?? "preprocess");
  return Math.max(5, Math.round(((i + 0.5) / order.length) * 100));
}

/** 候选短标签 (同 stage-second.ts)。例: "山东省临沂市蒙阴县 (岱崮地貌区)" → "山东·临沂·蒙阴" */
function shortCandidateLabel(c: CandidateLocation): string {
  const prov = (c.province || "").replace(/省|市|自治区|特别行政区|壮族|回族|维吾尔/g, "");
  const city = (c.city || "").replace(/市$/, "");
  const distr = (c.district || "").replace(/区|县$/, "");
  const out = [prov, city, distr].filter(Boolean).filter((s) => s.trim());
  return out.length ? out.slice(0, 3).join("·") : c.name || "未知";
}
