import { getDb } from "@/lib/db";
import {
  getDefaultApiConfig,
  getApiConfigById,
  callLlm,
  parseAnalysisResult,
} from "@/lib/llm";
import {
  buildSkillContext,
  buildSystemPrompt,
  buildUserPrompt,
} from "@/lib/prompt-builder";
import { getPrompt } from "@/lib/data";
import { safeJsonParse, nanoid } from "@/lib/utils";
import type { AnalysisResult, AnalysisStage, AnalyzeOptions, CandidateLocation } from "@/lib/types";
import type { ExifSummary } from "@/lib/exif";
import { setStage, persistCandidates } from "./persist";
import type { PipelineArgs } from "./types";

/**
 * 阶段 2: 两段式 LLM 推理.
 *
 *   阶段 2a · "观察" (vision 模型, 必须带 `image+text`):
 *     拉所有启用的 API 配置, 找出第一个 model 名里包含 "vision" / "vl" / "v-" / "5v" / "4v" / "glm-.*-turbo$v" 的配置.
 *     作为 vision, 让模型只做"白描式观察"(把图片里能看到的东西全列出, 描述是否清晰可辨)。
 *
 *   阶段 2b · "推理" (text 模型, 不带 image):
 *     找第一个 model 名里 NOT 含 vision/vl/v- 的 API 配置.
 *     把阶段 2a 的观察文本拼到用户 prompt 里, 让它给出候选地点 + confidence + reasoning.
 *
 * 配置约定 (在 /admin/apis 后台配):
 *   vision 模型: 例如 model="glm-5v-turbo" (含 "5v" 字样), 是默认启用即可
 *   推理模型:   例如 model="glm5.2"        (不含 v 字样), 默认启用
 *
 * 任一阶段找不到对应 API 就回退到 getDefaultApiConfig()(单模型一把梭), 保证向后兼容.
 */
export async function stageInitial(
  args: PipelineArgs,
  stage: Exclude<AnalysisStage, "preprocess"> = "initial",
): Promise<{ ok: true; result: AnalysisResult } | { ok: false; error: string }> {
  setStage(args.id, stage, "running");

  const db = getDb();
  const allConfigs = db
    .prepare("SELECT * FROM api_configs WHERE enabled = 1 ORDER BY is_default DESC, id ASC")
    .all() as any[];

  if (allConfigs.length === 0) {
    return { ok: false, error: "尚未在后台配置启用的多模态模型 API, 请前往 /admin/apis 配置" };
  }

  // 找 vision 模型 (model 名含 v 字样: 5v / 4v / vision / vl 等)
  const visionConfig = allConfigs.find((c) => isVisionModel(c.model)) ?? allConfigs[0];
  // 找纯文本推理模型 (model 名不含 v 字样)
  const textConfig = allConfigs.find((c) => !isVisionModel(c.model)) ?? visionConfig;

  try {
    // ───── 阶段 2a: vision 观察 ─────
    const observation = await runVisionObservation(args, visionConfig, args.modelImageUrl);

    // ───── 阶段 2b: 文本推理 ─────
    const systemPrompt = buildSystemPrompt(buildSkillContext());
    const userPrompt = buildUserPrompt({
      exif: args.exif,
      analyzeOptions: args.options as AnalyzeOptions,
    });
    // 把 vision 观察 + 原 user prompt 拼起来给文本模型
    const combinedUserPrompt = `
${userPrompt}

═══ 视觉模型 (vision) 提供的观察 ═══
${observation}
═══ 视觉模型观察结束 ═══

请基于以上视觉观察 + 你自己的推理能力, 输出最终的地理定位分析结果。
`.trim();

    let llm;
    if (textConfig.id === visionConfig.id) {
      // 同一个 API 时退回原行为 (vision+推理一步到位)
      llm = await callLlm(textConfig, {
        systemPrompt,
        userText: combinedUserPrompt,
        imageUrl: args.modelImageUrl,
      });
    } else {
      // 不同 API: 文本模型不带 image, 只看观察 + 推理
      llm = await callLlm(textConfig, {
        systemPrompt,
        userText: combinedUserPrompt,
        // imageUrl 不传, 文本模型专心推理
      });
    }

    const parsed = parseAnalysisResult(llm.content);
    if (parsed.error || !parsed.result) {
      return { ok: false, error: `模型输出解析失败: ${parsed.error}` };
    }
    const result = parsed.result;

    // 把模型候选转换为带 id 的 CandidateLocation
    const candidates = deriveCandidates(result, args.options.known_region);

    // 落库: 用 vision 模型名 + vision 用 token (主表语义上记 "用了哪个模型")
    const initialConfidence = Math.round(result.top_location.confidence ?? 0);
    db.prepare(
      `UPDATE analyses
       SET initial_result_json = ?, initial_confidence = ?,
           model_name = ?, api_id = ?, prompt_tokens = ?, completion_tokens = ?, total_tokens = ?,
           updated_at = datetime('now')
       WHERE id = ?`,
    ).run(
      JSON.stringify(result),
      initialConfidence,
      `${visionConfig.model} → ${textConfig.model}`, // 显示用了哪两个模型
      textConfig.id,
      llm.usage.prompt_tokens,
      llm.usage.completion_tokens,
      llm.usage.total_tokens,
      args.id,
    );
    persistCandidates(args.id, candidates);
    setStage(args.id, "candidate");

    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: (err as Error)?.message ?? "初始推理失败" };
  }
}

// ─────────── 辅助函数 ───────────

function isVisionModel(model: string | undefined | null): boolean {
  if (!model) return false;
  const m = String(model).toLowerCase();
  // 含这些字样的视为 vision 模型
  return /vision|vl|5v|4v|glm.*v|qwen-vl|gpt-4o|claude.*vision|gemini/.test(m);
}

/**
 * 调用 vision 模型做"纯观察", 让它把图里所有可见线索白描式列出.
 * 不要求结构化 JSON, 只输出文字段落 (后续拼给文本模型).
 */
async function runVisionObservation(
  args: PipelineArgs,
  config: any,
  imageUrl: string,
): Promise<string> {
  const visionSystem = `
你是一名视觉观察专家。任务是: 仔细观察这张图片, 把所有可看到的、对地理定位有潜在帮助的视觉线索**白描式**列出。注意:
- 只描述你真实能看到的画面内容, 不要猜测。
- 包括但不限于: 文字(招牌/路牌/告示/牌照/广告)、建筑风格(屋顶/材质/年代)、自然环境(植被/地形/水文)、天空与光影(朝向/天气/时段)、人物衣着特征、基础设施(电线杆/路灯/护栏)、交通工具、特殊标志物(地标/雕像/路牌)。
- 每条线索尽量简短具体, 例如"前景看到中文招牌'福源茶业'""远景山顶平坦(可能为崮地貌)""画面右下角有红色双线电气化铁路"。
- 不要给地点结论, 让后续推理模型决定。

请输出 6-12 条观察, 用 markdown 无序列表 (- ...).
`.trim();

  const visionUser = `请按规则观察这张图片.

可选上下文(可能为空):
- 拍摄时间: ${args.exif?.dateTimeOriginal ?? "未知"}
- 用户已知线索: ${args.options.known_region || args.options.additional_context || "无"}
`;

  try {
    const llm = await callLlm(config, {
      systemPrompt: visionSystem,
      userText: visionUser,
      imageUrl,
    });
    return llm.content || "(vision 模型未返回观察)";
  } catch (err) {
    return `(vision 观察失败: ${(err as Error)?.message ?? "未知"}, 跳到文本推理直接做)`;
  }
}

// 以下 deriveCandidates / candidates 解析逻辑保持不变
/** 把 AnalysisResult.candidates 映射成 CandidateLocation[], 附初始置信度。 */
export function deriveCandidates(
  initial: AnalysisResult,
  knownRegion?: string,
): CandidateLocation[] {
  const out: CandidateLocation[] = [];
  const src: Array<Partial<CandidateLocation>> = (initial as any).candidate_locations ?? [];
  if (src.length > 0) {
    src.forEach((c, i) => {
      out.push({
        id: c.id ?? nanoid(8),
        rank: c.rank ?? i + 1,
        country: c.country ?? "",
        province: c.province ?? "",
        city: c.city ?? "",
        district: c.district ?? "",
        name: c.name ?? "",
        latitude: typeof c.latitude === "number" ? c.latitude : null,
        longitude: typeof c.longitude === "number" ? c.longitude : null,
        coordinate_system: (c.coordinate_system as "wgs84" | "gcj02") ?? "wgs84",
        initial_confidence: Math.round(c.initial_confidence ?? 0) || initial.candidates[i]?.confidence || 0,
        final_confidence: Math.round(c.initial_confidence ?? 0) || initial.candidates[i]?.confidence || 0,
        status: "pending",
      });
    });
    return out;
  }
  const tl = initial.top_location ? {
    lat: parseLat(initial.top_location.coordinates),
    lng: parseLng(initial.top_location.coordinates),
  } : { lat: null as number | null, lng: null as number | null };
  const tlHasCoords = Number.isFinite(tl.lat) && Number.isFinite(tl.lng);
  initial.candidates.forEach((c, i) => {
    const locParts = String(c.location || "").split(/[·,，\s]+/).filter(Boolean);
    const probableCountry = locParts[0] || (knownRegion || "");
    const isFirstWithTop = i === 0 && tlHasCoords;
    const isTopMatch = initial.top_location && String(c.location || "").includes(initial.top_location.region || "@@@");
    out.push({
      id: nanoid(8),
      rank: i + 1,
      country: probableCountry || "",
      province: "",
      city: locParts[1] || locParts[0] || "",
      district: "",
      name: c.location || "",
      latitude: (isFirstWithTop || isTopMatch) && tlHasCoords ? tl.lat : null,
      longitude: (isFirstWithTop || isTopMatch) && tlHasCoords ? tl.lng : null,
      coordinate_system: "wgs84",
      initial_confidence: Math.round(c.confidence || 0),
      final_confidence: Math.round(c.confidence || 0),
      status: "pending",
    });
  });
  if (out.length === 0 && initial.top_location) {
    const tl = initial.top_location;
    out.push({
      id: nanoid(8),
      rank: 1,
      country: tl.country || "",
      province: "",
      city: tl.city || "",
      district: "",
      name: [tl.country, tl.city, tl.region].filter(Boolean).join(" ") || tl.region || "",
      latitude: parseLat(tl.coordinates),
      longitude: parseLng(tl.coordinates),
      coordinate_system: tl.country.includes("中") || tl.country === "China" ? "gcj02" : "wgs84",
      initial_confidence: Math.round(tl.confidence || 0),
      final_confidence: Math.round(tl.confidence || 0),
      status: "pending",
    });
  }
  return out.slice(0, 5);
}

function parseLat(s?: string): number | null {
  if (!s) return null;
  const m = s.split(/[,，\s]+/);
  return m[0] ? Number(m[0]) : null;
}
function parseLng(s?: string): number | null {
  if (!s) return null;
  const m = s.split(/[,，\s]+/);
  return m[1] ? Number(m[1]) : null;
}

/** 当前分析已落库的初版结果 (供 stage-second 复用) */
export function readInitialResult(id: string): { result: AnalysisResult | null; initialConfidence: number } {
  const row = getDb().prepare("SELECT initial_result_json, initial_confidence FROM analyses WHERE id = ?").get(id) as any;
  if (!row) return { result: null, initialConfidence: 0 };
  return {
    result: safeJsonParse<AnalysisResult | null>(row.initial_result_json, null),
    initialConfidence: Number(row.initial_confidence ?? 0),
  };
}
