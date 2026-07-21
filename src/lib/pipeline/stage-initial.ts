import { getDb } from "@/lib/db";
import { getDefaultApiConfig, callLlm, parseAnalysisResult } from "@/lib/llm";
import {
  buildSkillContext,
  buildSystemPrompt,
  buildUserPrompt,
} from "@/lib/prompt-builder";
import { getPrompt } from "@/lib/data";
import { safeJsonParse } from "@/lib/utils";
import { nanoid } from "@/lib/utils";
import type { AnalysisResult, AnalysisStage, AnalyzeOptions, CandidateLocation } from "@/lib/types";
import type { ExifSummary } from "@/lib/exif";
import { setStage, persistCandidates } from "./persist";
import type { PipelineArgs } from "./types";

/** 阶段 2: 多模态单轮推理 → 初步候选 + 写 initial_result_json / candidate_locations */
export async function stageInitial(
  args: PipelineArgs,
  stage: Exclude<AnalysisStage, "preprocess"> = "initial",
): Promise<{ ok: true; result: AnalysisResult } | { ok: false; error: string }> {
  setStage(args.id, stage, "running");
  const config = getDefaultApiConfig();
  if (!config) {
    return { ok: false, error: "尚未在后台配置启用的多模态模型 API, 请前往 /admin/apis 配置" };
  }

  try {
    const systemPrompt = buildSystemPrompt(buildSkillContext());
    const userPrompt = buildUserPrompt({
      exif: args.exif,
      analyzeOptions: args.options as AnalyzeOptions,
    });

    const llm = await callLlm(config, {
      systemPrompt,
      userText: userPrompt,
      imageUrl: args.modelImageUrl,
    });
    const parsed = parseAnalysisResult(llm.content);
    if (parsed.error || !parsed.result) {
      return { ok: false, error: `模型输出解析失败: ${parsed.error}` };
    }
    const result = parsed.result;

    // 把模型候选转换为带 id 的 CandidateLocation
    const candidates = deriveCandidates(result, args.options.known_region);

    // 落库
    const db = getDb();
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
      config.model,
      config.id,
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

/** 把 AnalysisResult.candidates 映射成 CandidateLocation[], 附初始置信度。 */
export function deriveCandidates(
  initial: AnalysisResult,
  knownRegion?: string,
): CandidateLocation[] {
  const out: CandidateLocation[] = [];
  // 优先从新增的 candidate_locations 字段拿 (若模型给了), 否则从 candidates 数组推断
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
  // fallback: 用 candidates 数组
  // 优先用 top_location 的坐标填回第 1 候选 (避免坐标信息丢失)
  const tlCoords = initial.top_location ? {
    lat: parseLat(initial.top_location.coordinates),
    lng: parseLng(initial.top_location.coordinates),
  } : { lat: null as number | null, lng: null as number | null };
  const tlHasCoords = Number.isFinite(tlCoords.lat) && Number.isFinite(tlCoords.lng);
  initial.candidates.forEach((c, i) => {
    const parsed = parseChinaLocation(c.location || "");
    const probableCountry = parsed.country || (knownRegion || "");
    // 若有 top_location 且本候选疑似它 (位置字符串相包含或同 rank 1), 借其坐标
    const isFirstWithTop = i === 0 && tlHasCoords;
    const isTopMatch = initial.top_location && String(c.location || "").includes(initial.top_location.region || "@@@");
    out.push({
      id: nanoid(8),
      rank: i + 1,
      country: probableCountry || "",
      province: parsed.province || "",
      city: parsed.city || "",
      district: parsed.district || "",
      name: c.location || "",
      latitude: (isFirstWithTop || isTopMatch) && tlHasCoords ? tlCoords.lat : null,
      longitude: (isFirstWithTop || isTopMatch) && tlHasCoords ? tlCoords.lng : null,
      coordinate_system: "wgs84",
      initial_confidence: Math.round(c.confidence || 0),
      final_confidence: Math.round(c.confidence || 0),
      status: "pending",
    });
  });
  // 用 top_location 再补充一条第 1 候选 (若 candidates 没覆盖到)
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

/**
 * 把模型返回的 location 字符串解析成省/市/区/县
 * 例: "山东省枣庄市山亭区 (京沪高铁沿线)" → { country:"中国", province:"山东省", city:"枣庄市", district:"山亭区" }
 *     "北京市朝阳区" → { country:"中国", province:"北京市", city:"北京市", district:"朝阳区" }
 *     "中国北京市 (传统胡同片区)" → { country:"中国", province:"北京市", city:"北京市", district:"" }
 */
function parseChinaLocation(raw: string): { country: string; province: string; city: string; district: string } {
  const s = String(raw || "")
    .replace(/[（(].*?[)）].*$/, "")
    .replace(/中国|中华人民共和国/g, "")
    .trim();
  const parts: string[] = [];
  // 直接匹配省/市/区/县 后缀 (按长度从长到短)
  const m = s.match(/(.+?[省市自治区])(.+?[市区县])?(.+?[区县])?/);
  if (m) {
    const province = m[1] || "";
    const city = m[2] || "";
    const district = m[3] || "";
    return {
      country: "中国",
      province,
      city,
      district,
    };
  }
  // 兜底: 按行政区级别后缀直接切
  let country = "中国";
  let province = "", city = "", district = "";
  // 北京/上海/天津/重庆 既是省又是市
  const m0 = s.match(/^(北京|上海|天津|重庆市?)/);
  if (m0) {
    province = m0[1].replace(/市$/, "") + "市";
    city = province;
    const rest = s.slice(m0[0].length).trim();
    const m1 = rest.match(/^([^市县区]+[市区县])/);
    if (m1) district = m1[1];
    return { country, province, city, district };
  }
  const tokens = s.split(/[\s,，·]+/).filter(Boolean);
  for (const t of tokens) {
    if (/[省自治区]$/.test(t) && !province) province = t;
    else if (/[市区县]$/.test(t) && !city) city = t;
    else if (/[市区县]$/.test(t) && !district) district = t;
  }
  return { country, province, city, district };
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
