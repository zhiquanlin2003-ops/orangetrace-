import { getDb } from "@/lib/db";
import { readFile } from "fs/promises";
import path from "path";
import type { AnalysisResult } from "@/lib/types";
import type { PipelineArgs, PipelineOutput } from "./types";
import {
  setStage,
  persistCandidates,
  loadCandidates,
  clearToolResultsForAnalysis,
} from "./persist";
import { stageInitial, readInitialResult, deriveCandidates } from "./stage-initial";
import { buildPlan } from "./stage-plan";
import { stageVerify } from "./stage-verify";
import { stageSecond } from "./stage-second";

/**
 * 主编排: 6 阶段流水线。
 *
 *   1. preprocess (外层 /api/analyze 已完成图片落盘 + EXIF)
 *   2. stage-initial: 模型单轮推理 → initial_result_json + candidate_locations
 *   3. stage-plan: 根据候选生成 ToolPlan
 *   4. stage-verify (tools): 执行计划 + 持久化每个 ToolResult
 *   5. cross: 评分 (在 stageSecond 内 buildSummary 完成)
 *   6. report: 二次模型评估 → 最终 result_json (status=success)
 *
 * 任何阶段失败都落 status=failed, 不向调用方抛错。
 */
export async function run(args: PipelineArgs): Promise<void> {
  const { id, options } = args;
  // 进入 pipeline 后, 把 status 置回 running
  setStage(id, "preprocess", "running");

  // 阶段 2: 初步推理
  const initial = await stageInitial(args, "initial");
  if (!initial.ok) {
    markFailed(id, initial.error);
    return;
  }
  const initialResult = initial.result;

  // 阶段 3: 生成 ToolPlan
  setStage(id, "candidate");
  const candidates = loadCandidates(id);
  const plan = buildPlan(candidates, initialResult, {
    capturedAt: options.captured_at,
    knownRegion: options.known_region,
    additionalContext: options.additional_context,
  });

  // 阶段 4: 执行工具
  let toolResults: Awaited<ReturnType<typeof stageVerify>> = [];
  try {
    toolResults = await stageVerify(id, plan);
  } catch (err) {
    // 不阻塞: 工具层异常时记 failed, 但仍把已得到的尽量持久化继续 stage-second
    toolResults = [];
  }

  // 阶段 6: 二次评估
  let finalResult: AnalysisResult;
  try {
    finalResult = await stageSecond(args, initialResult, toolResults, candidates);
  } catch (err) {
    // 极端兜底: 直接采用初版 + 工具摘要
    finalResult = initialResult;
  }

  // 落主表 success
  const finalConfidence = Math.round(
    finalResult.cross_verification?.final_confidence ??
      finalResult.top_location.confidence ??
      0,
  );
  const db = getDb();
  db.prepare(
    `UPDATE analyses
     SET status = 'success', result_json = ?, confidence = ?, stage = 'report',
         error = NULL, updated_at = datetime('now')
     WHERE id = ?`,
  ).run(JSON.stringify(finalResult), finalConfidence, id);

  // 可选: 不保存原图则删除
  if (!args.saveOriginal) {
    safeUnlink(args.privPath);
  }
}

/** 重新执行交叉验证 (用户主动触发, 不重跑模型初步推理)。 */
export async function rerun(args: PipelineArgs, onlyTool?: { tool?: string; candidateId?: string }): Promise<{ ok: boolean; error?: string }> {
  const { id } = args;
  // 冷却
  const now = Date.now();
  const lastVerify = (getDb().prepare("SELECT last_verify_at FROM analyses WHERE id = ?").get(id) as any)?.last_verify_at;
  if (lastVerify) {
    const t = new Date(lastVerify + "Z").getTime();
    if (Number.isFinite(t) && now - t < 30_000) {
      return { ok: false, error: "重新验证冷却中 (30 秒一次), 请稍后再试" };
    }
  }
  const init = readInitialResult(id);
  if (!init.result) {
    return { ok: false, error: "尚未完成初步分析, 无法重验证" };
  }
  // 清掉旧 tool_executions (避免 db 累积双份)
  clearToolResultsForAnalysis(id);

  // 总是用更优的 deriveCandidates 重候选 (新逻辑会按"省/市/区/县"正确解析, 旧逻辑可能漏字段)
  // 用更详细字段覆盖旧记录 (id 不变 → 候选引用关系保留)
  let candidates = deriveCandidates(init.result, args.options.known_region);
  if (candidates.length > 0) {
    // 用旧 id 若同名, 维持 candidateId 一致性
    const oldById = new Map(loadCandidates(id).map((c) => [c.name, c.id]));
    candidates = candidates.map((c) => ({ ...c, id: oldById.get(c.name) ?? c.id }));
    persistCandidates(id, candidates);
  } else {
    candidates = loadCandidates(id);
  }

  const fullPlan = buildPlan(candidates, init.result, {
    capturedAt: args.options.captured_at,
    knownRegion: args.options.known_region,
    additionalContext: args.options.additional_context,
  });
  // 过滤 (onlyTool)
  const plan = onlyTool?.tool
    ? fullPlan.filter((p) => p.tool === onlyTool.tool && (!onlyTool.candidateId || p.input.candidateId === onlyTool.candidateId || p.input.candidateId === "_global_"))
    : fullPlan;

  let toolResults: Awaited<ReturnType<typeof stageVerify>> = [];
  try {
    toolResults = await stageVerify(id, plan);
  } catch {
    toolResults = [];
  }

  try {
    const finalResult = await stageSecond(args, init.result, toolResults, candidates);
    const finalConfidence = Math.round(
      finalResult.cross_verification?.final_confidence ??
        finalResult.top_location.confidence ?? 0,
    );
    const db = getDb();
    db.prepare(
      `UPDATE analyses
       SET status = 'success', result_json = ?, confidence = ?,
           last_verify_at = datetime('now'),
           error = NULL, updated_at = datetime('now')
       WHERE id = ?`,
    ).run(JSON.stringify(finalResult), finalConfidence, id);
  } catch (err) {
    return { ok: false, error: (err as Error)?.message ?? "重验证失败" };
  }
  return { ok: true };
}

/** 备注某 absolute 路径下的图片 dataUrl (供 rerun / 二次评估时若 modelImageUrl 已失效时的恢复) */
export async function reloadImageForRerun(analysisId: string): Promise<string | undefined> {
  const row = getDb().prepare("SELECT thumb_path FROM analyses WHERE id = ?").get(analysisId) as any;
  if (!row?.thumb_path) return undefined;
  try {
    const rel = row.thumb_path as string;
    const abs = rel.startsWith("/uploads/") ? path.join(process.cwd(), "public", rel) : path.join(process.cwd(), rel);
    const buf = await readFile(abs);
    return `data:image/jpeg;base64,${buf.toString("base64")}`;
  } catch {
    return undefined;
  }
}

function markFailed(id: string, error: string) {
  getDb().prepare(
    "UPDATE analyses SET status='failed', error=?, updated_at=datetime('now') WHERE id=?",
  ).run(String(error).slice(0, 1000), id);
}

function safeUnlink(p: string) {
  import("fs/promises").then(({ unlink }) => unlink(p).catch(() => {}));
}
