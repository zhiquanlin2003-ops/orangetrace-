import type {
  AnalysisResult,
  CrossVerificationSummary,
  ToolResultSummary,
  CandidateLocation,
} from "@/lib/types";
import type { ExifSummary } from "@/lib/exif";

/** 流水线运行入参 */
export interface PipelineArgs {
  id: string;
  options: {
    captured_at?: string;
    allow_exif?: boolean;
    known_region?: string;
    detailed_reasoning?: boolean;
    privacy_acknowledged?: boolean;
    additional_context?: string;
  };
  exif: ExifSummary | null;
  modelImageUrl: string;
  /** 已落盘的原图绝对路径 (供 stage-second / 重新读图用) */
  privPath: string;
  saveOriginal: boolean;
}

/** 流水线产生的最终对象 (落主表 result_json) */
export interface PipelineOutput {
  result: AnalysisResult;
  initialConfidence: number;
  finalConfidence: number;
}

/** 工具调用计划中一项 */
export interface ToolPlanItem {
  tool: string;
  candidateId: string;
  input: import("@/lib/tools/types").ToolInput;
}

/** stage-second 阶段把 ToolResult 压成给模型看的小摘要 */
export interface ToolDigest {
  tool: string;
  label: string;
  status: string;
  summary: string;
  evidence_for: string[];
  evidence_against: string[];
}

export type { AnalysisResult, CrossVerificationSummary, ToolResultSummary, CandidateLocation };
