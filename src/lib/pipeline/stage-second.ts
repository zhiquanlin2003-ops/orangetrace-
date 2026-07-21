import { getDb } from "@/lib/db";
import { getDefaultApiConfig, callLlm } from "@/lib/llm";
import { buildSkillContext } from "@/lib/prompt-builder";
import { getPrompt } from "@/lib/data";
import type { AnalysisResult, AnalyzeOptions, CandidateLocation } from "@/lib/types";
import type { ToolResult } from "@/lib/tools/types";
import { buildSummary } from "@/lib/tools/scoring";
import { setStage, updateCandidateConfidence, loadPersistedToolResults } from "./persist";
import { buildToolDigest } from "./stage-verify";
import type { PipelineArgs, ToolDigest } from "./types";

/**
 * 阶段 6: 用 [原图 + 候选 + 工具摘要 + 证据] 二次喂模型, 让它综合作出最终侦探报告。
 * 关键约束 (规范第四、六节):
 *  - 允许结论为「无法判断 / 仅判断到国家 / 仅判断到省城」
 *  - 不允许编造街道 / 地址 / 经纬度
 *  - 把可信度从 [模型初始 + 工具验证增减] 显式合并
 */
export async function stageSecond(
  args: PipelineArgs,
  initial: AnalysisResult,
  toolResults: ToolResult[],
  candidates: CandidateLocation[],
): Promise<AnalysisResult> {
  setStage(args.id, "report");

  const config = getDefaultApiConfig();
  if (!config) {
    // 没模型配置也应允许: 直接落初版结果
    return applyToolSummary(initial, toolResults, candidates, args, null);
  }

  // 计算 confidence 摘要 (透明评分)
  const initialConfidence = Math.round(initial.top_location.confidence ?? 0);
  const summary = buildSummary(initialConfidence, toolResults);

  // 给模型的 system
  const safety = getPrompt("safety")?.content ?? "";
  const systemPrompt = [
    "你是橙迹 OrangeTrace 的图片地理定位侦探。前一轮你已经给了一份初步分析。本轮你将拿到「初步结果 + 候选地点 + 一组地图与 OSINT 工具的自动验证结果」, 请据此输出最终侦探报告。",
    "",
    "【最终输出要求】",
    "1. 严格遵守 JSON 结构 (与首轮一致, 但 candidates 现在应是为每条候选重新评估后的版本, evidence 来自工具与原图线索)。",
    "2. 允许结论为: 无法可靠判断 / 只能判断到国家 / 只能到省份或城市 / 多个近似候选 / 视觉与地图证据冲突。诚实标注。",
    "3. 禁止为了让结果完整而编造街道名、地址、经纬度。coordinates 字段仅当工具真实找到坐标时才填。",
    "4. 不要把未执行/失败的工具有意描述成已验证; 工具若 status=skipped/failed, 说明该维度暂无外部验证。",
    "5. 请用 top_location.confidence 反映「初步置信度 + 工具验证增减」的最终值 (我会在下方给你直接的区间供参考, 但允许你按证据再小幅调整).",
    "6. 把 reasoning_steps 改写为最终推理链: 先观察 → 提取线索 → 候选 → 工具验证 → 综合。",
    "",
    safety,
  ].join("\n");

  const toolDigest = buildToolDigest(toolResults, candidates);
  const userPrompt = formatSecondUserPrompt(args, initial, candidates, toolDigest, summary);

  try {
    const llm = await callLlm(config, {
      systemPrompt,
      userText: userPrompt,
      imageUrl: args.modelImageUrl,
      temperature: 0.2,
      maxTokens: config.max_tokens,
    });

    // 解析复用 parseAnalysisResult
    const { parseAnalysisResult } = await import("@/lib/llm");
    const parsed = parseAnalysisResult(llm.content);
    if (parsed.result) {
      // 写最终模型字段
      const db = getDb();
      const finalConfidence = Math.round(parsed.result.top_location.confidence ?? summary.final_confidence);
      db.prepare(
        `UPDATE analyses
         SET prompt_tokens = COALESCE(prompt_tokens, 0) + ?,
             completion_tokens = COALESCE(completion_tokens, 0) + ?,
             total_tokens = COALESCE(total_tokens, 0) + ?
         WHERE id = ?`,
      ).run(llm.usage.prompt_tokens, llm.usage.completion_tokens, llm.usage.total_tokens, args.id);

      return applyToolSummary(parsed.result, toolResults, candidates, args, {
        initialConfidence,
        finalConfidence,
      });
    }
    // 解析失败: 仍返回带工具摘要的初版
    return applyToolSummary(initial, toolResults, candidates, args, null);
  } catch (err) {
    // 二次评估失败 → 退回初版 + 工具摘要 (不阻塞交付)
    return applyToolSummary(initial, toolResults, candidates, args, null);
  }
}

/** 把 cross_verification / tool_results / candidate_locations 等附加字段贴到 result 上, 并更新候选表置信度。 */
function applyToolSummary(
  base: AnalysisResult,
  toolResults: ToolResult[],
  candidates: CandidateLocation[],
  args: PipelineArgs,
  scored: { initialConfidence: number; finalConfidence: number } | null,
): AnalysisResult {
  const summary = buildSummary(scored ? scored.initialConfidence : Math.round(base.top_location.confidence ?? 0), toolResults);

  // candidate final_confidence (按支持证据强度做加权近似)
  const cidBoost = new Map<string, number>();
  for (const r of toolResults) {
    for (const e of r.evidence ?? []) {
      if (!e.candidateId) continue;
      const intensity = (e.confidence ?? 0) / 100;
      const sign = e.type === "oppose" ? -1 : e.type === "support" ? 1 : 0;
      cidBoost.set(e.candidateId, (cidBoost.get(e.candidateId) ?? 0) + sign * intensity * 5);
    }
  }
  const updates = candidates.map((c) => {
    const boost = cidBoost.get(c.id) ?? 0;
    const fin = Math.max(0, Math.min(100, Math.round((c.initial_confidence ?? 0) + boost)));
    return { id: c.id, final_confidence: fin, status: "verified" as const };
  });
  try {
    updateCandidateConfidence(args.id, updates);
  } catch {
    // ignore
  }

  // 落地: 整理展示用的 ToolResultSummary
  // 预备 candidateId → 可读标签 的查询表, 让 tool_results 的 label 区分各候选的工具调用
  const cidToLabel = new Map((candidates || []).map((c) => [c.id, shortCandidateLabel(c)] as const));
  const tool_results = loadPersistedToolResults(args.id).map((r) => {
    const ev = (() => {
      try {
        const p = JSON.parse(r.evidence_json);
        const evs: any[] = Array.isArray(p?.evidence) ? p.evidence : [];
        return {
          for: evs.filter((e) => e.type === "support").map((e) => e.title).slice(0, 5) as string[],
          against: evs.filter((e) => e.type === "oppose").map((e) => e.title).slice(0, 5) as string[],
        };
      } catch {
        return { for: [] as string[], against: [] as string[] };
      }
    })();
    const ctx = r.candidate_id && r.candidate_id !== "_global_" ? cidToLabel.get(r.candidate_id) : "";
    return {
      tool: r.tool_name,
      label: ctx ? `${r.tool_name} · ${ctx}` : r.tool_name,
      status: (r.status === "success" || r.status === "failed" || r.status === "skipped" ? r.status : "failed") as any,
      summary: r.summary,
      evidence_for: ev.for,
      evidence_against: ev.against,
      source: r.tool_name,
      executed_at: r.created_at,
      duration_ms: r.duration_ms,
      mock: r.mock === 1,
    };
  });

  return {
    ...base,
    top_location: {
      ...base.top_location,
      confidence: scored ? scored.finalConfidence : summary.final_confidence,
    },
    candidate_locations: candidates.map((c) => {
      const upd = updates.find((u) => u.id === c.id);
      return { ...c, final_confidence: upd?.final_confidence ?? c.final_confidence, status: upd?.status ?? c.status };
    }),
    cross_verification: summary,
    tool_results,
    safety_note: base.safety_note || "该结果是 AI 与公开数据工具的概率性判断, 不代表确定事实。请通过地图/街景复核。",
  };
}

function formatSecondUserPrompt(
  args: PipelineArgs,
  initial: AnalysisResult,
  candidates: CandidateLocation[],
  toolDigest: ToolDigest[],
  summary: ReturnType<typeof buildSummary>,
): string {
  const sections: string[] = [];
  sections.push("请基于以下信息, 给出最终地理定位侦探报告。");
  sections.push("");
  sections.push("【初步分析结果 (你上一轮的输出, JSON)】");
  sections.push("```json");
  sections.push(JSON.stringify(initial, null, 2));
  sections.push("```");
  sections.push("");
  sections.push("【候选地点 (后端结构化, 含初始置信度)】");
  sections.push(candidates.length
    ? candidates.map((c) => `- 候选 ${c.rank} (${c.id}): ${[c.country, c.province, c.city, c.district, c.name].filter(Boolean).join("/") || "?"} 坐标=${c.latitude != null && c.longitude != null ? `${c.latitude.toFixed(4)},${c.longitude.toFixed(4)} (${c.coordinate_system})` : "未知"} initial_confidence=${c.initial_confidence}`).join("\n")
    : "(无候选)");
  sections.push("");
  if (toolDigest.length) {
    sections.push("【工具自动验证结果】");
    for (const d of toolDigest) {
      sections.push(`- [${d.status.toUpperCase()}] ${d.label}: ${d.summary}`);
      if (d.evidence_for.length) sections.push(`    支持证据: ${d.evidence_for.slice(0, 5).join(" | ")}`);
      if (d.evidence_against.length) sections.push(`    反对/不确定: ${d.evidence_against.slice(0, 5).join(" | ")}`);
    }
  } else {
    sections.push("【工具自动验证结果】(本轮无外部工具可执行或全部被跳过, 请基于初步分析与原图线索产出报告, 并在 safety_note 中说明尚未完成外部工具验证)");
  }
  sections.push("");
  sections.push("【透明评分 (供参考, 允许按证据再小幅调整)】");
  sections.push(`- 初始置信度: ${summary.initial_confidence}`);
  sections.push(`- 工具验证增减: ${summary.confidence_delta >= 0 ? "+" : ""}${summary.confidence_delta}`);
  sections.push(`- 推荐最终值: ${summary.final_confidence} (等级 ${summary.level})`);
  sections.push("- 若你认为模型应更保守, 可以再调低; 但不要超过透明评分 +15。");
  if (args.options.additional_context) {
    sections.push("");
    sections.push("【用户额外补充线索】");
    sections.push(args.options.additional_context);
  }
  sections.push("");
  sections.push("请输出 JSON (与首轮结构一致), 不要任何前后缀说明, 不要 ```json 包裹。");
  return sections.join("\n");
}


/** 候选短标签 (用于工具卡片标题区分不同候选)。例: "山东省枣庄市山亭区 (京沪高铁沿线)" → "山东·枣庄·山亭" */
function shortCandidateLabel(c: CandidateLocation): string {
  const prov = (c.province || "").replace(/省|市|自治区|特别行政区|壮族|回族|维吾尔/g, "");
  const city = (c.city || "").replace(/市$/, "");
  const distr = (c.district || "").replace(/区|县$/, "");
  const out = [prov, city, distr].filter(Boolean).filter((s) => s.trim());
  return out.length ? out.slice(0, 3).join("·") : c.name || "未知";
}
