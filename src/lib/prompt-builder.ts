import { getPrompt, getEnabledSkills } from "./data";
import type { PromptKey } from "./types";
import type { ExifSummary } from "./exif";
import { formatExifForPrompt } from "./exif";
import type { AnalyzeOptions } from "./types";

/** 把启用的 SKILL 方法库压成一段方法论上下文。 */
export function buildSkillContext(maxSkills = 18): string {
  const skills = getEnabledSkills().slice(0, maxSkills);
  if (skills.length === 0) {
    return "（暂无维护中的方法库, 使用通用地理定位方法论。）";
  }
  const lines = skills.map((s, i) => {
    const parts = [`[${i + 1}] ${s.name} (优先级 ${s.priority})`];
    if (s.description) parts.push(`  说明: ${s.description}`);
    if (s.scenario) parts.push(`  适用场景: ${s.scenario}`);
    if (s.key_clues)
      parts.push(`  关键线索: ${s.key_clues.replace(/\n+/g, " / ")}`);
    if (s.recommended_tools)
      parts.push(`  推荐工具: ${s.recommended_tools.replace(/\n+/g, " / ")}`);
    if (s.caveats) parts.push(`  注意: ${s.caveats.replace(/\n+/g, " / ")}`);
    return parts.join("\n");
  });
  return [
    "可用方法库 (按优先级排序, 请按需应用其中合适的方法):",
    lines.join("\n\n"),
  ].join("\n\n");
}

/** 组装最终的 system prompt。 */
export function buildSystemPrompt(extraContext: string): string {
  const sys = getPrompt("system")?.content ?? "";
  const safety = getPrompt("safety")?.content ?? "";
  const outputFormat = getPrompt("output_format")?.content ?? "";
  return [sys, "", "【方法库上下文】", extraContext, "", "【安全约束】", safety, "", "【输出格式】", outputFormat].join("\n");
}

/** 组装 user 文本: 图片分析提示词 + EXIF + 用户补充信息。 */
export function buildUserPrompt(opts: {
  exif: ExifSummary | null;
  analyzeOptions: AnalyzeOptions;
}): string {
  const base = getPrompt("image_analysis")?.content ?? "";
  const sections: string[] = [base, ""];

  if (opts.analyzeOptions.privacy_acknowledged) {
    sections.push("用户声明: 用户确认拥有该图片分析权限, 且不会用于人肉搜索/骚扰/侵犯隐私。");
  }
  if (opts.analyzeOptions.captured_at) {
    sections.push(`用户提供的拍摄时间: ${opts.analyzeOptions.captured_at}`);
  }
  if (opts.analyzeOptions.known_region) {
    sections.push(`用户已知大致区域: ${opts.analyzeOptions.known_region}`);
  }
  if (opts.analyzeOptions.allow_exif !== false) {
    sections.push("EXIF 元数据 (若模型可信可直接采用):", formatExifForPrompt(opts.exif));
  } else {
    sections.push("用户未允许读取 EXIF, 请仅基于图像内容推理。");
  }
  if (opts.analyzeOptions.detailed_reasoning) {
    sections.push("用户希望看到详细推理过程, 请把 reasoning_steps 写充分。");
  }
  if (opts.analyzeOptions.additional_context && opts.analyzeOptions.additional_context.trim()) {
    sections.push(
      "用户额外补充的线索 / 说明 (请重点参考并结合推理):\n" +
        opts.analyzeOptions.additional_context.trim(),
    );
  }

  return sections.join("\n");
}

export function getPromptByKey(key: PromptKey): string {
  return getPrompt(key)?.content ?? "";
}
