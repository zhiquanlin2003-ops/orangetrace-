import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { safeJsonParse, shortId } from "@/lib/utils";
import { readInitialResult } from "@/lib/pipeline/stage-initial";
import { deriveCandidates } from "@/lib/pipeline/stage-initial";
import { buildPlan } from "@/lib/pipeline/stage-plan";
import { stageVerify } from "@/lib/pipeline/stage-verify";
import { stageSecond } from "@/lib/pipeline/stage-second";
import { clearToolResultsForAnalysis, loadCandidates, persistCandidates } from "@/lib/pipeline/persist";
import { reloadImageForRerun } from "@/lib/pipeline/orchestrator";
import type { AnalyzeOptions, AnalysisResult } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

interface VerifyBody {
  onlyTool?: string;
  candidateId?: string;
  /** true = 仅重新执行工具, 不再让模型二次评估 (默认 false, 会跑 stage-second) */
  skipSecondEval?: boolean;
}

/**
 * 重新执行工具验证。
 *  - 不重新跑初步推理 (复用 initial_result_json)
 *  - 冷却 30s (基于 analyses.last_verify_at)
 *  - 失败容忍: 工具层异常不抛出, 调用方拿到 status=success/tool_status 数组
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as VerifyBody;

  const row = getDb().prepare("SELECT id, status, options, last_verify_at FROM analyses WHERE id = ?").get(id) as
    | { id: string; status: string; options: string; last_verify_at: string | null }
    | undefined;
  if (!row) {
    return NextResponse.json({ error: "分析记录不存在" }, { status: 404 });
  }
  if (row.status === "running" || row.status === "verifying") {
    return NextResponse.json({ error: "分析或验证进行中, 请稍后再试" }, { status: 409 });
  }
  if (row.status !== "success" && row.status !== "failed") {
    return NextResponse.json({ error: "分析尚未完成" }, { status: 400 });
  }

  // 冷却 30s
  if (row.last_verify_at) {
    const t = new Date(row.last_verify_at + "Z").getTime();
    if (Number.isFinite(t) && Date.now() - t < 30_000) {
      return NextResponse.json(
        { error: "重新验证冷却中 (30 秒一次), 请稍后再试" },
        { status: 429 },
      );
    }
  }

  // 落一条 verification 进行中状态 (用 stage 字段表示)
  getDb().prepare("UPDATE analyses SET stage = 'tools', status = 'verifying', updated_at = datetime('now') WHERE id = ?").run(id);

  // 后台异步执行, 立即返回「正在验证」
  void (async () => {
    try {
      const init = readInitialResult(id);
      let initialResult: AnalysisResult | null = init.result;
      if (!initialResult) {
        // 兜底: 拿最后 success 的 result_json
        const cur = getDb().prepare("SELECT result_json FROM analyses WHERE id = ?").get(id) as any;
        initialResult = safeJsonParse<AnalysisResult | null>(cur?.result_json, null);
        if (!initialResult) throw new Error("缺少初步分析结果");
      }
      // 复原 candidates — 总是用更优的 deriveCandidates 重新派生 (会按"省/市/区/县"补全字段)
      // 并保留与旧记录相同的 id (依据 name 匹配), 保证 candidateId 引用关系延续
      const opts = safeJsonParse<AnalyzeOptions>(row.options, {});
      const fresh = deriveCandidates(initialResult, opts.known_region);
      const oldRows = loadCandidates(id);
      const oldIdByName = new Map(oldRows.map((c) => [c.name, c.id]));
      let candidates =
        fresh.length > 0
          ? fresh.map((c) => ({ ...c, id: oldIdByName.get(c.name) ?? c.id }))
          : oldRows;
      if (fresh.length > 0) {
        persistCandidates(id, candidates);
      }
      // 清掉旧 tool_executions (避免 db 累积双份)
      clearToolResultsForAnalysis(id);

      const fullPlan = buildPlan(candidates, initialResult, {
        capturedAt: opts.captured_at,
        knownRegion: opts.known_region,
        additionalContext: opts.additional_context,
      });
      const plan = body.onlyTool
        ? fullPlan.filter((p) =>
            p.tool === body.onlyTool &&
            (!body.candidateId || p.input.candidateId === body.candidateId || p.input.candidateId === "_global_"),
          )
        : fullPlan;

      const toolResults = await stageVerify(id, plan);

      const secondArgs = { id, options: opts, exif: null, modelImageUrl: (await reloadImageForRerun(id)) ?? "", privPath: "", saveOriginal: false };
      const finalResult = await stageSecond(secondArgs as any, initialResult, toolResults, candidates);
      const fin = Math.round(finalResult.cross_verification?.final_confidence ?? finalResult.top_location.confidence ?? 0);
      getDb().prepare(
        `UPDATE analyses
         SET status = 'success', result_json = ?, confidence = ?,
             last_verify_at = datetime('now'), stage = 'report',
             error = NULL, updated_at = datetime('now')
         WHERE id = ?`,
      ).run(JSON.stringify(finalResult), fin, id);
    } catch (err) {
      getDb().prepare(
        `UPDATE analyses SET status = 'success', stage = 'report', updated_at = datetime('now') WHERE id = ?`,
      ).run(id);
    }
  })();

  return NextResponse.json({ id, status: "verifying", message: "已开始重新验证, 请刷新结果页查看最新证据。" });
}
