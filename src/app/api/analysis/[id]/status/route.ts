import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { safeJsonParse } from "@/lib/utils";
import { ALL_TOOLS } from "@/lib/tools/registry";

export const runtime = "nodejs";

const STAGE_ORDER: Array<"preprocess" | "initial" | "candidate" | "tools" | "cross" | "report"> =
  ["preprocess", "initial", "candidate", "tools", "cross", "report"];

/**
 * GET /api/analysis/[id]/status
 * 用于分析中页轮询: 返回 status / stage / progress% / tool_status[]
 *
 * 不返回 Key/URL/敏感字段。
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const row = getDb().prepare("SELECT id, status, stage FROM analyses WHERE id = ?").get(id) as
    | { id: string; status: string; stage: string | null }
    | undefined;
  if (!row) {
    return NextResponse.json({ error: "记录不存在" }, { status: 404 });
  }

  const stage = (row.stage as any) ?? "preprocess";
  const stageIdx = STAGE_ORDER.indexOf(stage);
  // 进度: (stageIdx + 0.5) / 6 * 100, 让分析中页有连续推进感
  const progress = Math.max(5, Math.round(((stageIdx + 0.5) / STAGE_ORDER.length) * 100));
  if (row.status === "success") {
    return NextResponse.json({
      id,
      status: row.status,
      stage: "report",
      progress: 100,
      tool_status: [],
    });
  }
  if (row.status === "failed") {
    return NextResponse.json({
      id,
      status: row.status,
      stage,
      progress: progress,
      tool_status: [],
    });
  }

  // 拉所有 tool_executions 状态 (脱敏)
  const toolRows = getDb()
    .prepare("SELECT tool_name, status, candidate_id, mock FROM tool_executions WHERE analysis_id = ?")
    .all(id) as Array<{ tool_name: string; status: string; candidate_id: string | null; mock: number }>;
  const done = new Set(toolRows.map((t) => t.tool_name));

  // 拼接: 所有 enabled 工具, 已执行的标 done, 正在 tools 阶段且未执行的标 pending, 否则 waiting
  const tool_status = ALL_TOOLS.map((t) => {
    const row = toolRows.find((r) => r.tool_name === t.name);
    if (row) {
      return {
        tool: t.name,
        label: t.label,
        status: row.status,
        enabled: true,
      };
    }
    // 未执行: 在 tools 阶段标 "pending", 否则 "waiting"
    return {
      tool: t.name,
      label: t.label,
      status: stage === "tools" ? "pending" : "waiting",
      enabled: t.isEnabled(),
    };
  }).filter((t) => t.enabled || done.has(t.tool));

  return NextResponse.json({
    id,
    status: row.status,
    stage,
    progress,
    tool_status,
  });
}
