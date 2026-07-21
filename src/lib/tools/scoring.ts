import type { ToolResult, VerificationEvidence } from "@/lib/tools/types";
import type { CrossVerificationSummary } from "@/lib/types";

/**
 * 透明证据评分 (规范第五节)。
 * 不让模型随意判分, 而是把每条 evidence 按 source/type 给固定权重, 计算总增减。
 */

/** 各来源的基础权重 (0-100 内部刻度, 最终归一)。 */
const WEIGHT_BY_SOURCE: Record<string, number> = {
  "图片 EXIF 元数据": 30, // GPS 精确匹配 → 最高 (内部值会被 evidence.confidence 调整)
  "高德地图 POI 搜索": 12,
  "高德地图 周边搜索": 9,
  "高德地图 地理编码": 7,
  "高德地图 逆地理编码": 6,
  "OpenStreetMap / Overpass": 8,
  "SunCalc (本地算法)": 5,
};

interface ScoreOutput {
  initialConfidence: number;
  /** 工具验证累计增减 */
  toolDelta: number;
  /** 修正后的最终置信度 (封顶 100) */
  finalConfidence: number;
  level: "high" | "medium" | "low";
}

export function score(initial: number, evidence: VerificationEvidence[]): ScoreOutput {
  let delta = 0;
  for (const e of evidence) {
    const baseW = WEIGHT_BY_SOURCE[e.source] ?? 4;
    // 证据强度: confidence 越高权重越大; oppose 减分; neutral 不计
    const intensity = Math.max(0, Math.min(1, (e.confidence ?? 0) / 100));
    const sign = e.type === "oppose" ? -1 : e.type === "support" ? 1 : 0;
    delta += sign * baseW * intensity * 0.5; // 0.5 系数防止单条过度影响
  }
  // 软上限: 多组正向证据不会无限加分
  delta = Math.max(-30, Math.min(25, delta));

  const finalConfidence = Math.max(0, Math.min(100, Math.round(initial + delta)));
  let level: "high" | "medium" | "low" = "low";
  if (finalConfidence >= 70) level = "high";
  else if (finalConfidence >= 40) level = "medium";

  return {
    initialConfidence: Math.round(initial),
    toolDelta: Math.round(delta),
    finalConfidence,
    level,
  };
}

/** 由 ToolResult 列表计算 CrossVerificationSummary。 */
export function buildSummary(
  initial: number,
  results: ToolResult[],
): CrossVerificationSummary {
  const prodEvidence: VerificationEvidence[] = [];
  for (const r of results) {
    if (r.mock) continue; // Mock 不计正式评分
    for (const e of r.evidence ?? []) prodEvidence.push(e);
  }
  const sc = score(initial, prodEvidence);
  const real = results.filter((r) => !r.mock);
  return {
    total_tools: real.length,
    success: real.filter((r) => r.status === "success").length,
    failed: real.filter((r) => r.status === "failed").length,
    skipped: real.filter((r) => r.status === "skipped").length,
    initial_confidence: sc.initialConfidence,
    final_confidence: sc.finalConfidence,
    confidence_delta: sc.finalConfidence - sc.initialConfidence,
    level: sc.level,
    executed_any: real.some((r) => r.status !== "skipped"),
  };
}
