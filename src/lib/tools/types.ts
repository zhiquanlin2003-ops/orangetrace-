/* ===== 验证工具层 (Tool Adapter) 的统一接口 =====
 *
 * 按规范第三节: 所有工具实现统一 VerificationTool 接口,
 * 返回统一 ToolResult, 内部生成结构化 VerificationEvidence。
 */

export type ToolStatus = "success" | "failed" | "skipped";
export type EvidenceType = "support" | "oppose" | "neutral";

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface ToolInput {
  /** 候选地点 id (用于把证据归到某条候选) */
  candidateId?: string;
  /** 候选地点显示名 (国家/省/市, 用于日志) */
  candidateLabel?: string;
  /** 候选地点已知坐标 */
  coordinates?: LatLng;
  /** 拍摄时间 (ISO 或字符串), SunCalc 用 */
  capturedAt?: string;
  /** 模型建议的查询关键字 (POI 名等) */
  query?: string;
  /** 模型建议的城市/区域 */
  region?: string;
  /** 模型建议要查询的 OSM 要素类型 */
  featureTypes?: string[];
  /** 半径 (米) */
  radius?: number;
  /** 用户额外补充 */
  userContext?: string;
  /** 已解密 EXIF 摘要 (ExifSummary, 用 any 避免本文件 import 链) */
  exifSummary?: any;
  /** 原始图片 buffer (EXIF 工具用) */
  imageBuffer?: Buffer;
}

export interface VerificationEvidence {
  type: EvidenceType;
  title: string;
  description: string;
  candidateId?: string;
  confidence: number; // 0-100, 表示该证据对结论的支持力度
  source: string;
  sourceUrl?: string;
  coordinates?: LatLng;
}

export interface ToolResult {
  tool: string; // amap_poi_search / overpass / suncalc / exif ...
  label: string;
  status: ToolStatus;
  summary: string;
  rawData?: unknown;
  evidence: VerificationEvidence[];
  error?: string;
  startedAt: string;
  finishedAt: string;
  /** 开发环境 MOCK 产生的结果必须标记, 防止伪装正式结果 */
  mock?: boolean;
}

export interface VerificationTool {
  /** 工具唯一名 (与 tool_executions.tool_name 对齐) */
  name: string;
  label: string;
  /** 是否在该实例上启用 (DB 配置 + 全局 env 开关) */
  isEnabled(): boolean;
  /** 是否具备运行所需的最小凭据/数据 (Key 是否就位) */
  isConfigured(): boolean;
  /** 实际执行。绝不抛错 —— 失败请返回 status=failed 的 ToolResult。 */
  execute(input: ToolInput): Promise<ToolResult>;
  /** 连通性测试, 用于后台"测试连接"按钮 */
  testConnection?(): Promise<{ ok: boolean; message: string }>;
}

/** 快捷构造一个 skipped 结果 */
export function skipped(
  tool: string,
  label: string,
  reason: string,
  startedAt: string,
): ToolResult {
  return {
    tool,
    label,
    status: "skipped",
    summary: reason,
    evidence: [],
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}
