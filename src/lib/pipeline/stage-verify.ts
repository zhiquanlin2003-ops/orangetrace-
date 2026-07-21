import type { ToolResult } from "@/lib/tools/types";
import type { CandidateLocation } from "@/lib/types";
import { runPlan } from "@/lib/tools/run";
import { persistToolResult, setStage, updateCandidateCoords } from "./persist";
import type { ToolDigest, ToolPlanItem } from "./types";

/** 阶段 4: 执行工具计划, 把每个 ToolResult 落库。返回 ToolResult[] 给上层做评分 / 摘要。 */
export async function stageVerify(
  analysisId: string,
  plan: ToolPlanItem[],
): Promise<ToolResult[]> {
  setStage(analysisId, "tools", "verifying");
  const run = await runPlan(
    plan.map((p) => ({ tool: p.tool, input: p.input })),
    { maxTotalCalls: 15, maxCallsPerCandidate: 5, retries: 1 },
  );

  // 反向回填: 工具拿到的坐标 → 写回 candidate_locations (仅在候选 lat 为空时)。
  // 优先级: geocode > reverse_geocode > nearby > poi (POI 通常返回查询到的地方, 不一定是候选本身).
  // 用一个 Map 按 candidateId 选最权威的坐标, 避免被先到的低优先级工具覆盖。
  const BACKFILL_PRIORITY: Record<string, number> = {
    amap_geocode: 1,
    amap_reverse_geocode: 2,
    amap_nearby_search: 3,
    overpass_nearby: 4,
    amap_poi_search: 5, // 最低 (POI 返回查询到的地方, 可能与候选本身不符)
  };
  const bestByCid = new Map<string, { lat: number; lng: number; prio: number }>();
  for (const r of run.results) {
    if (r.status !== "success" || !r.evidence) continue;
    const prio = BACKFILL_PRIORITY[r.tool] ?? 99;
    if (prio >= 99) continue;
    for (const ev of r.evidence) {
      const cid = ev.candidateId;
      const lat = ev.coordinates?.latitude;
      const lng = ev.coordinates?.longitude;
      if (!cid || lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const cur = bestByCid.get(cid);
      if (!cur || prio < cur.prio) {
        bestByCid.set(cid, { lat, lng, prio });
      }
    }
  }
  for (const [cid, c] of bestByCid) {
    updateCandidateCoords(analysisId, cid, c.lat, c.lng);
  }

  // 把 plan items 按 tool name 分组, 用 round-robin 配对结果 → 候选 id。
  // 这是 "同 tool 多候选" 场景下最鲁棒的配对方式: JointEvidence.candidateId 才是权威来源,
  // 但工具异常返回时 evidence 可能没有 candidateId, 此时回退到 plan 顺序匹配。
  const planByTool = new Map<string, ToolPlanItem[]>();
  for (const p of plan) {
    const list = planByTool.get(p.tool) ?? [];
    list.push(p);
    planByTool.set(p.tool, list);
  }
  const cursorByTool = new Map<string, number>();

  for (const r of run.results) {
    // 优先: evidence 上的 candidateId (工具内部自己声明的)
    let candidateId: string | undefined;
    const evCid = r.evidence?.find((e) => e.candidateId && e.candidateId !== "_global_")?.candidateId;
    if (evCid) {
      candidateId = evCid;
    } else {
      // 兜底: 按 plan 同 tool 的顺序取 (一个 plan item 对应一个 result)
      const list = planByTool.get(r.tool) ?? [];
      const idx = cursorByTool.get(r.tool) ?? 0;
      const item = list[idx];
      cursorByTool.set(r.tool, idx + 1);
      candidateId = item?.input.candidateId;
    }
    persistToolResult(analysisId, candidateId && candidateId !== "_global_" ? candidateId : undefined, r);
  }
  setStage(analysisId, "cross");
  return run.results;
}

/** 阶段 5 摘要: 把 ToolResult 压成模型可读 (ToolDigest) */
export function buildToolDigest(results: ToolResult[], candidates: CandidateLocation[]): ToolDigest[] {
  const candidateName = (c: CandidateLocation) => [c.city || c.province || c.country, c.name].filter(Boolean).join(" ");
  // 候选查找表 (供结果中 candidateId 解析)
  const cidToName = new Map((candidates || []).map((c) => [c.id, candidateName(c)]));
  return results.map<ToolDigest>((r) => {
    const evFor = r.evidence
      .filter((e) => e.type === "support")
      .map((e) => `${e.title}${e.description ? " — " + String(e.description).slice(0, 120) : ""}`);
    const evAgainst = r.evidence
      .filter((e) => e.type === "oppose")
      .map((e) => e.title);
    const cid = r.evidence?.[0]?.candidateId;
    const ctx = cid ? cidToName.get(cid) : "";
    return {
      tool: r.tool,
      label: r.label + (ctx ? ` (${ctx})` : ""),
      status: r.status,
      summary: r.summary,
      evidence_for: evFor,
      evidence_against: evAgainst,
    };
  });
}
