/* ===== OrangeTrace 核心数据类型 ===== */

/* ---------- 模型分析结构化结果 (LLM 输出契约) ---------- */
export interface AnalysisResult {
  summary: string;
  top_location: {
    country: string;
    city: string;
    region: string;
    coordinates: string;
    confidence: number;
  };
  candidates: Array<{
    location: string;
    confidence: number;
    supporting_evidence: string[];
    weakness: string[];
  }>;
  clues: {
    text: string[];
    architecture: string[];
    infrastructure: string[];
    natural_geography: string[];
    light_shadow: string[];
    exif: string[];
    other: string[];
  };
  reasoning_steps: string[];
  verification_suggestions: string[];
  safety_note: string;

  /* ---- 第 7 轮: 交叉验证任意追加 (全部可选, 兼容历史数据) ---- */
  candidate_locations?: CandidateLocation[];
  cross_verification?: CrossVerificationSummary;
  tool_results?: ToolResultSummary[];
  refinement_notes?: string;
}

/* ---------- 候选地点 (流水线阶段 2 产物) ---------- */
export interface CandidateLocation {
  id: string;
  rank: number;
  country: string;
  province: string;
  city: string;
  district: string;
  name: string;
  latitude?: number | null;
  longitude?: number | null;
  coordinate_system: "wgs84" | "gcj02";
  initial_confidence: number;
  final_confidence: number;
  /** verified / pending / rejected / unverified */
  status: string;
}

/* ---------- 交叉验证汇总 (展示用) ---------- */
export interface CrossVerificationSummary {
  total_tools: number;
  success: number;
  failed: number;
  skipped: number;
  initial_confidence: number;
  final_confidence: number;
  confidence_delta: number;
  level: "high" | "medium" | "low";
  executed_any: boolean; // 是否实际跑过真实工具 (vs 全部跳过/未配置)
}

/* ---------- 工具结果摘要 (上层展示用, 来源: tool_executions) ---------- */
export interface ToolResultSummary {
  tool: string;
  label: string;
  status: "success" | "failed" | "skipped";
  summary: string;
  evidence_for: string[];
  evidence_against: string[];
  source: string;
  source_url?: string;
  executed_at: string;
  duration_ms?: number | null;
  mock?: boolean;
}

/* ---------- 上传补充信息 ---------- */
export interface AnalyzeOptions {
  captured_at?: string; // 图片大概拍摄时间
  allow_exif?: boolean; // 是否允许读取 EXIF
  known_region?: string; // 已知大致国家/城市
  detailed_reasoning?: boolean; // 是否输出详细推理过程
  privacy_acknowledged?: boolean; // 隐私声明已勾选
  additional_context?: string; // 用户左侧对话框提交的补充线索
  /** "standard" = 仅用 vision 模型一步到位; "expert" = vision 观察 → 文本模型推理 */
  analysis_mode?: "standard" | "expert";
}

/* ---------- 分析记录 ---------- */
export type AnalysisStatus =
  | "pending"
  | "running"
  | "verifying"
  | "success"
  | "failed";

/** 流水线阶段 (用于分析中页推进), 数值越大越接近完成。 */
export type AnalysisStage =
  | "preprocess" // 1. 读取图片与元数据
  | "initial" // 2. 视觉识别 / 提取线索
  | "candidate" // 3. 生成候选地点
  | "tools" // 4. 调用地图/OSINT 工具
  | "cross" // 5. 交叉验证支持/反对证据
  | "report"; // 6. 生成最终侦探报告

export interface AnalysisRecord {
  id: string;
  created_at: string;
  updated_at: string;
  status: AnalysisStatus;
  stage?: AnalysisStage | null;
  filename: string;
  image_path: string; // 相对 /uploads 路径
  thumb_path?: string | null;
  options: AnalyzeOptions;
  exif_summary?: string | null; // EXIF 摘要 (JSON 字符串)
  model_name?: string | null;
  api_id?: number | null;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  total_tokens?: number | null;
  duration_ms?: number | null;
  error?: string | null;
  result_json?: string | null; // AnalysisResult 的最终 JSON
  initial_result_json?: string | null; // 阶段 2 的初版 JSON (用于「先有候选再有最终」)
  initial_confidence?: number | null;
  confidence?: number | null;
  last_verify_at?: string | null;
}

/* ---------- API 配置 ---------- */
export interface ApiConfig {
  id: number;
  name: string;
  provider: string; // openai / gemini / claude / qwen / glm / custom
  base_url: string;
  api_key_enc: string; // 加密后的 key
  model: string;
  enabled: number; // 0/1
  is_default: number; // 0/1
  max_tokens: number;
  temperature: number;
  timeout: number;
  created_at: string;
  updated_at: string;
}

/* ---------- 方法库 / SKILL ---------- */
export interface Skill {
  id: number;
  name: string;
  description: string;
  scenario: string; // 适用场景
  key_clues: string; // 关键线索 (换行分隔)
  recommended_tools: string; // 推荐工具 (换行分隔)
  caveats: string; // 注意事项
  category: string;
  priority: number;
  enabled: number;
  version: string;
  source?: string | null; // 来源文件名
  raw_content?: string | null; // 原始 HTML/MD
  created_at: string;
  updated_at: string;
}

/* ---------- Prompt 模板 ---------- */
export type PromptKey =
  | "system"
  | "image_analysis"
  | "output_format"
  | "safety"
  | "json_template";

export interface PromptTemplate {
  id: number;
  key: PromptKey;
  label: string;
  content: string;
  updated_at: string;
}

/* ---------- 外部工具 ---------- */
export interface ExternalTool {
  id: number;
  name: string;
  description: string;
  url: string;
  category: string;
  applies_to: string; // 适用方法
  enabled: number;
  icon?: string | null;
}

/* ---------- 站点设置 ---------- */
export interface SiteSettings {
  save_original_image: number;
  auto_delete_hours: number;
}

/* ---------- 验证工具运营配置 (第 7 轮) ---------- */
export interface VerificationToolConfig {
  k: string; // 唯一标识, 如 'amap_web'
  label: string;
  tool_type: string; // verifier | map
  enabled: number; // 0 / 1
  config_json: string; // JSON 字符串, key 字段为加密后 (enc:v1:...)
  last_test_at?: string | null;
  last_test_status?: string | null; // 'ok' | 'fail' | 'skipped'
  sort_order: number;
  updated_at: string;
}

