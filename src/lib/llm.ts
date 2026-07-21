import { decrypt } from "./crypto";
import { getDb } from "./db";
import { extractJsonFromText, safeJsonParse } from "./utils";
import type { AnalysisResult, ApiConfig } from "./types";

/**
 * 获取默认启用的 API 配置 (is_default=1 且 enabled=1).
 * 若没有默认, 回退到第一个启用的。
 */
export function getDefaultApiConfig(): ApiConfig | null {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT * FROM api_configs WHERE is_default = 1 AND enabled = 1 LIMIT 1",
    )
    .get() as ApiConfig | undefined;
  if (row) return row ?? null;
  const fallback = db
    .prepare("SELECT * FROM api_configs WHERE enabled = 1 ORDER BY id LIMIT 1")
    .get() as ApiConfig | undefined;
  return fallback ?? null;
}

export function getApiConfigById(id: number): ApiConfig | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM api_configs WHERE id = ?")
    .get(id) as ApiConfig | undefined;
  return row ?? null;
}

export interface LlmCallResult {
  content: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * 调用 OpenAI 兼容的 chat/completions 接口 (大多数厂商都兼容)。
 * 若 provider 为 gemini/claude 等非原生兼容, 这里会尝试用其 OpenAI 兼容端点。
 */
export async function callLlm(
  config: ApiConfig,
  opts: {
    systemPrompt: string;
    userText: string;
    imageUrl?: string; // dataURL (base64) 或 https url
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
  },
): Promise<LlmCallResult> {
  const apiKey = decrypt(config.api_key_enc);
  const temperature = opts.temperature ?? config.temperature ?? 0.2;
  const maxTokens = opts.maxTokens ?? config.max_tokens ?? 4096;
  const timeoutMs = opts.timeoutMs ?? (config.timeout ?? 120) * 1000;

  const baseUrl = (config.base_url || "https://api.openai.com/v1").replace(/\/+$/, "");
  const url = `${baseUrl}/chat/completions`;

  // 构造多模态消息
  const userContent: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  > = [{ type: "text", text: opts.userText }];
  if (opts.imageUrl) {
    userContent.push({ type: "image_url", image_url: { url: opts.imageUrl } });
  }

  const body = {
    model: config.model,
    messages: [
      { role: "system", content: opts.systemPrompt },
      { role: "user", content: userContent },
    ],
    temperature,
    max_tokens: maxTokens,
    // OpenAI 新字段, 部分服务仍只认 max_tokens, 故两者都带
    max_completion_tokens: maxTokens,
    stream: false,
  };

  // 速率限制/超时容忍重试: 429 / 5xx / AbortError 时指数退避
  // - 客户的 GLM 账号经常会因为短时间内多次重新验证触发 1302
  // - 重试 3 次, 每次等待 2^n * 1000ms (max 16s), 不超过 modelTimeoutMs 总耗时
  const startedAt = Date.now();
  const MAX_RETRIES = 3;
  let lastErr: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const remainingBudget = timeoutMs - (Date.now() - startedAt);
    if (remainingBudget < 5000) {
      break; // 不够再发一次请求了
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remainingBudget);

    let resp: Response;
    try {
      resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      const isAbort = (err as Error)?.name === "AbortError";
      // 超时/网络异常也重试
      if (attempt < MAX_RETRIES && (isAbort || isNetworkErr(err as Error))) {
        await sleep(Math.pow(2, attempt + 1) * 1000);
        lastErr = new Error(isAbort ? "请求超时, 正在重试..." : `网络异常: ${(err as Error).message}`);
        continue;
      }
      if (isAbort) throw new Error(`请求超时 (${timeoutMs}ms, 已重试 ${attempt} 次)`);
      throw new Error(`模型请求失败: ${(err as Error).message}`);
    }
    clearTimeout(timer);

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      // 429 (限流) / 5xx (服务端) → 重试, 指数退避
      if ((resp.status === 429 || resp.status >= 500) && attempt < MAX_RETRIES) {
        // 读 Retry-After 头 (如果有), 否则 2^n 秒
        const retryAfter = Number(resp.headers.get("retry-after"));
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : Math.pow(2, attempt + 1) * 1000;
        console.warn(`[callLlm] ${resp.status} 限流/服务异常, 第 ${attempt + 1} 次重试 (等待 ${waitMs}ms)`);
        await sleep(waitMs);
        lastErr = new Error(`模型 API 返回 ${resp.status}: ${text.slice(0, 200)}`);
        continue;
      }
      // 友好错误: 把 1302 限流转换成可读中文提示
      const friendly = friendlyApiError(resp.status, text);
      throw new Error(friendly || `模型 API 返回 ${resp.status}: ${text.slice(0, 500) || resp.statusText}`);
    }

    const data = await resp.json();
    const content: string =
      data?.choices?.[0]?.message?.content ??
      data?.choices?.[0]?.message?.reasoning_content ??
      "";

    const usage = {
      prompt_tokens: Number(data?.usage?.prompt_tokens ?? 0),
      completion_tokens: Number(data?.usage?.completion_tokens ?? 0),
      total_tokens: Number(data?.usage?.total_tokens ?? 0),
    };

    return {
      content: typeof content === "string" ? content : JSON.stringify(content),
      usage,
    };
  }

  // 重试耗尽, 抛最后一次错误 (含友好信息)
  throw lastErr ?? new Error("模型 API 重试耗尽");
}

function isNetworkErr(err: Error): boolean {
  const m = (err?.message ?? "").toLowerCase();
  return /econnreset|enotfound|etimedout|fetch failed|network|socket hang up/.test(m);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 把常见模型 API 错误转换成对用户友好的中文文案。 */
function friendlyApiError(status: number, text: string): string | null {
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }
  const code = String(body?.error?.code ?? body?.errCode ?? "");
  const msg = String(body?.error?.message ?? body?.message ?? "");

  // GLM / 通义 等: 1302 速率限制
  if (status === 429 || code === "1302" || /速率限制|rate.?limit/i.test(msg)) {
    return "模型账号已触发速率限制, 请: 1) 等待 1-2 分钟再试; 2) 控制每次重新验证 / 测试连接的频率; 3) 检查后台模型 API 是否已超额度。";
  }
  // 通义: InvalidApiKey
  if (/invalid.?api.?key|apikey.*not.*valid/i.test(msg) || code === "InvalidApiKey") {
    return "模型 API Key 无效或已过期, 请到「后台 → API 配置」检查并重新填写。";
  }
  // 配额耗尽
  if (/insufficient.*balance|out of quota|额度|余额不足/i.test(msg)) {
    return "模型额度已耗尽, 请到模型服务商后台充值后再分析。";
  }
  return null;
}

/** 把模型原始文本输出尝试解析为 AnalysisResult。 */
export function parseAnalysisResult(raw: string): {
  result?: AnalysisResult;
  error?: string;
} {
  if (!raw || !raw.trim()) {
    return { error: "模型未返回任何内容" };
  }
  const jsonStr = extractJsonFromText(raw);
  if (!jsonStr) {
    // 抓不到 JSON 块 — 看是不是被截断的 partial
    return {
      error: `模型未返回可识别的 JSON (前 200 字符: ${raw.slice(0, 200).replace(/\s+/g, " ")})`,
    };
  }
  const parsed = safeJsonParse<any>(jsonStr, null);
  if (!parsed || typeof parsed !== "object") {
    // 兜底: 在原文里 grep 出 top_location 块 (即使外层 JSON 不闭合)
    const fallback = minimalFallback(raw, jsonStr);
    if (fallback) {
      console.warn("[parseAnalysisResult] JSON 解析失败, 使用最小 fallback:", {
        rawHead: raw.slice(0, 300),
      });
      return { result: fallback };
    }
    return {
      error: `JSON 解析失败 (前 200 字符: ${jsonStr.slice(0, 200).replace(/\s+/g, " ")})`,
    };
  }
  // 基础字段补全, 保证前端不崩
  const result: AnalysisResult = {
    summary: parsed.summary ?? "",
    top_location: {
      country: parsed.top_location?.country ?? "",
      city: parsed.top_location?.city ?? "",
      region: parsed.top_location?.region ?? "",
      coordinates: parsed.top_location?.coordinates ?? "",
      confidence: Number(parsed.top_location?.confidence ?? 0) || 0,
    },
    candidates: Array.isArray(parsed.candidates)
      ? parsed.candidates.map((c: any) => ({
          location: c?.location ?? "",
          confidence: Number(c?.confidence ?? 0) || 0,
          supporting_evidence: Array.isArray(c?.supporting_evidence)
            ? c.supporting_evidence
            : [],
          weakness: Array.isArray(c?.weakness) ? c.weakness : [],
        }))
      : [],
    clues: {
      text: arr(parsed.clues?.text),
      architecture: arr(parsed.clues?.architecture),
      infrastructure: arr(parsed.clues?.infrastructure),
      natural_geography: arr(parsed.clues?.natural_geography),
      light_shadow: arr(parsed.clues?.light_shadow),
      exif: arr(parsed.clues?.exif),
      other: arr(parsed.clues?.other),
    },
    reasoning_steps: arr(parsed.reasoning_steps),
    verification_suggestions: arr(parsed.verification_suggestions),
    safety_note: parsed.safety_note ?? "",
  };
  return { result };
}

/**
 * 当全量 JSON 解析彻底失败时, 尝试从原文里抽出最小可用 top_location 块,
 * 让分析能继续走 stage-verify 流水线 (避免一次模型故障让整个分析白做)。
 */
function minimalFallback(raw: string, jsonStr: string): AnalysisResult | null {
  // 抓第一个 {"top_location": { ... }} 块 (用大括号配平扫描)
  const findBlock = (key: string): any | null => {
    const lookFor = `"${key}"`;
    let idx = raw.indexOf(lookFor);
    if (idx === -1) idx = jsonStr.indexOf(lookFor);
    if (idx === -1) return null;
    // 找到这个 key 后紧接的 { 开始位置
    let i = raw.indexOf("{", idx);
    if (i === -1) return null;
    let depth = 0;
    let inStr = false;
    let start = i;
    for (; i < raw.length; i++) {
      const c = raw[i];
      if (c === '"' && raw[i - 1] !== "\\") inStr = !inStr;
      if (inStr) continue;
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) {
          const block = raw.slice(start, i + 1);
          const obj = safeJsonParse<any>(block, null);
          return obj;
        }
      }
    }
    return null;
  };
  const tl = findBlock("top_location");
  const summaryMatch = raw.match(/"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (!tl && !summaryMatch) return null;
  return {
    summary: summaryMatch ? JSON.parse('"' + summaryMatch[1] + '"') : "(模型输出解析降级, 以下为部分提取的结果)",
    top_location: {
      country: tl?.country ?? "",
      city: tl?.city ?? "",
      region: tl?.region ?? "",
      coordinates: tl?.coordinates ?? "",
      confidence: Number(tl?.confidence ?? 0) || 0,
    },
    candidates: [],
    clues: {
      text: [], architecture: [], infrastructure: [],
      natural_geography: [], light_shadow: [], exif: [], other: [],
    },
    reasoning_steps: ["(模型输出 JSON 不完整, 仅提取了 top_location 与 summary)"],
    verification_suggestions: [],
    safety_note: "",
  };
}

function arr(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x));
  if (typeof v === "string" && v.trim()) return [v];
  return [];
}
