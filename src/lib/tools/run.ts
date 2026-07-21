import type { ToolInput, ToolResult, VerificationTool } from "@/lib/tools/types";
import { getTool } from "@/lib/tools/registry";
import { decodeConfig } from "@/lib/tools/store";
import { safeJsonParse } from "@/lib/utils";

/* 调用计数 / 缓存 / 重试。所有工具失败都返回 ToolResult.status="failed", 不抛错。 */

interface ToolRunConfig {
  /** 单分析总调用上限 (默认 15, 见规范第十五节) */
  maxTotalCalls?: number;
  /** 单候选总调用上限 (默认 5) */
  maxCallsPerCandidate?: number;
  /** 重试次数 (默认 1) */
  retries?: number;
}

interface PlanItem {
  tool: string;
  input: ToolInput;
}

export interface RunResult {
  results: ToolResult[];
  /** 实际发生调用的次数 (skipped 不计) */
  attempted: number;
  /** 被限流跳过的次数 */
  throttled: number;
}

/**
 * 内存级 POI/Overpass 缓存 (24h); SunCalc 长期缓存 (Map 不过期, 进程级)。
 * key 由 cacheKey 算出, 不含敏感数据。
 */
const SHORT_CACHE = new Map<string, { at: number; result: ToolResult }>();
const LONG_CACHE = new Map<string, ToolResult>();
const SHORT_TTL_MS = 24 * 60 * 60 * 1000;

function cacheKey(tool: string, input: ToolInput): string {
  try {
    const f = {
      tool,
      q: input.query,
      region: input.region,
      lat: input.coordinates?.latitude,
      lng: input.coordinates?.longitude,
      radius: input.radius,
      features: input.featureTypes?.slice().sort(),
      when: input.capturedAt,
    };
    return JSON.stringify(f);
  } catch {
    return `${tool}:${Math.random()}`;
  }
}

/**
 * 并行执行规划里的工具调用。返回所有 ToolResult。
 * 单工具失败 / 超时只产生 status=failed, 不传播。
 */
export async function runPlan(plan: PlanItem[], cfg: ToolRunConfig = {}): Promise<RunResult> {
  const maxTotal = cfg.maxTotalCalls ?? 15;
  const maxPerCandidate = cfg.maxCallsPerCandidate ?? 5;
  const retries = cfg.retries ?? 1;

  const perCandidate = new Map<string, number>();
  let attempted = 0;
  let throttled = 0;
  const picks: Array<{ item: PlanItem; tool: VerificationTool }> = [];

  for (const item of plan) {
    if (attempted >= maxTotal) { throttled++; continue; }
    const cid = item.input.candidateId ?? "__global__";
    if ((perCandidate.get(cid) ?? 0) >= maxPerCandidate) { throttled++; continue; }
    const tool = getTool(item.tool);
    if (!tool) { throttled++; continue; }
    picks.push({ item, tool });
    perCandidate.set(cid, (perCandidate.get(cid) ?? 0) + 1);
  }

  const settled = await Promise.allSettled(
    picks.map(({ item, tool }) => runOne(tool, item.input, retries)),
  );

  const results: ToolResult[] = [];
  for (let i = 0; i < settled.length; i++) {
    const s = settled[i];
    const t = picks[i].tool;
    if (s.status === "fulfilled") {
      results.push(s.value);
      if (s.value.status !== "skipped") attempted++;
    } else {
      attempted++;
      results.push({
        tool: t.name, label: t.label, status: "failed",
        summary: `工具执行未捕获异常`,
        evidence: [],
        error: (s.reason as Error)?.message ?? String(s.reason),
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
      });
    }
  }
  return { results, attempted, throttled };
}

async function runOne(tool: VerificationTool, input: ToolInput, retries: number): Promise<ToolResult> {
  // 配置过载: timeout 来自 verification_tool_configs
  const overloadTimeout = timeoutFor(tool.name);
  const key = cacheKey(tool.name, input);
  const isCacheLong = tool.name === "suncalc";
  const cached = isCacheLong
    ? (LONG_CACHE.get(key) as ToolResult | undefined)
    : (SHORT_CACHE.get(key) as { at: number; result: ToolResult } | undefined);
  if (cached) {
    if (isCacheLong) return cached as ToolResult;
    const c = cached as { at: number; result: ToolResult };
    if (Date.now() - c.at < SHORT_TTL_MS) return c.result;
  }

  if (!tool.isEnabled()) {
    return skipWrap(tool, `工具未启用`);
  }

  let last: ToolResult | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    last = await withTimeout(tool.execute(input), overloadTimeout, tool);
    if (last.status === "success") break;
    if (last.status === "skipped") break; // skipped 不重试
    // 失败 → 重试 retries 次
  }
  if (last!.status === "success") {
    if (isCacheLong) {
      LONG_CACHE.set(key, last!);
    } else {
      SHORT_CACHE.set(key, { at: Date.now(), result: last! });
    }
  }
  return last!;
}

function skipWrap(t: VerificationTool, reason: string): ToolResult {
  return {
    tool: t.name, label: t.label, status: "skipped",
    summary: reason, evidence: [],
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
  };
}

function timeoutFor(toolName: string): number {
  if (toolName.startsWith("amap_")) {
    const cfg = decodeConfig("amap_web");
    return Number(cfg?.timeout_ms ?? 8000);
  }
  if (toolName.startsWith("overpass")) {
    const cfg = decodeConfig("overpass");
    return Number(cfg?.timeout_ms ?? 15000);
  }
  return 8000;
}

async function withTimeout(p: Promise<ToolResult>, ms: number, t: VerificationTool): Promise<ToolResult> {
  const startedAt = new Date().toISOString();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      p,
      new Promise<ToolResult>((resolve) => {
        timer = setTimeout(() => {
          resolve({
            tool: t.name, label: t.label, status: "failed",
            summary: `工具执行超时 (${ms}ms)`,
            evidence: [], error: "timeout",
            startedAt, finishedAt: new Date().toISOString(),
          });
        }, ms + 250); // 容忍底层 fetch 自带超时
      }),
    ]);
    return result;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** 持久化时把 ToolResult.evidence 与 rawData 做尺寸约束 (避免 DB 膨胀)。 */
export function sanitizeToolResultForStorage(r: ToolResult): {
  request_summary: string;
  response_summary: string;
  evidence_json: string;
  mock: 0 | 1;
  error_message: string | null;
} {
  return {
    request_summary: r.summary.slice(0, 600),
    response_summary: r.summary.slice(0, 2000),
    evidence_json: JSON.stringify({
      tool: r.tool,
      label: r.label,
      status: r.status,
      summary: r.summary.slice(0, 500),
      evidence: (r.evidence ?? []).slice(0, 12).map((e) => ({
        type: e.type, title: String(e.title).slice(0, 200),
        description: String(e.description).slice(0, 400),
        confidence: e.confidence, source: e.source,
        sourceUrl: e.sourceUrl, lat: e.coordinates?.latitude, lng: e.coordinates?.longitude,
        candidateId: e.candidateId,
      })),
    }),
    mock: r.mock ? 1 : 0,
    error_message: r.error ? String(r.error).slice(0, 600) : null,
  };
}

/** util: 解析 config_json 内的某个 number 字段 */
export function readToolNumber(k: string, field: string, fallback: number): number {
  const cfg = decodeConfig(k);
  return Number((cfg as any)?.[field] ?? fallback);
}

/** util: 安全解析任何 json (再包装) */
export const safeParse = safeJsonParse;
