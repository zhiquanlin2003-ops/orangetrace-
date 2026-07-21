import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { getDb } from "@/lib/db";
import { getDefaultApiConfig, callLlm } from "@/lib/llm";
import { buildSkillContext } from "@/lib/prompt-builder";
import { getPrompt } from "@/lib/data";
import { safeJsonParse, nanoid } from "@/lib/utils";
import { loadPersistedToolResults } from "@/lib/pipeline/persist";
import type { AnalysisResult } from "@/lib/types";
import type { ToolResultSummary } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

interface DiscussBody {
  message?: string;
  /** 前端历史 (role/content), 用于让模型延续上下文 */
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

/**
 * 针对某次分析结果继续对话。
 * 把 [当前结果 JSON + 候选 + 线索 + 推理步骤 + 交叉验证结果 + 用户消息 + 历史] 一起发给模型,
 * 让它围绕已有结论回答 / 重评候选 / 纠错。
 *
 * 每条 user/assistant 会同步写入 analysis_conversations 持久化用于审计 + 恢复。
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as DiscussBody;
  const userMsg = (body.message ?? "").trim();
  if (!userMsg) {
    return NextResponse.json({ error: "消息不能为空" }, { status: 400 });
  }

  const db = getDb();
  const row = db.prepare("SELECT * FROM analyses WHERE id = ?").get(id) as any;
  if (!row) {
    return NextResponse.json({ error: "分析记录不存在" }, { status: 404 });
  }
  if (row.status !== "success") {
    return NextResponse.json({ error: "分析尚未完成，无法讨论" }, { status: 400 });
  }
  const result = safeJsonParse<AnalysisResult | null>(row.result_json, null);
  if (!result) {
    return NextResponse.json({ error: "分析结果缺失" }, { status: 400 });
  }

  // 拉取交叉验证结果作为对话上下文 (若存在)
  const persistedTools: ToolResultSummary[] = loadPersistedToolResults(id).map((r) => {
    let evidenceFor: string[] = [];
    let evidenceAgainst: string[] = [];
    try {
      const p = JSON.parse(r.evidence_json);
      const evs: any[] = Array.isArray(p?.evidence) ? p.evidence : [];
      evidenceFor = evs.filter((e) => e.type === "support").map((e) => e.title).slice(0, 5);
      evidenceAgainst = evs.filter((e) => e.type === "oppose").map((e) => e.title).slice(0, 5);
    } catch {}
    return {
      tool: r.tool_name,
      label: r.tool_name,
      status: (r.status === "success" || r.status === "failed" || r.status === "skipped" ? r.status : "failed") as ToolResultSummary["status"],
      summary: r.summary,
      evidence_for: evidenceFor,
      evidence_against: evidenceAgainst,
      source: r.tool_name,
      executed_at: r.created_at,
      mock: r.mock === 1,
    };
  });

  // 持久化 user 消息
  appendConversation(id, "user", userMsg);

  const config = getDefaultApiConfig();
  if (!config) {
    return NextResponse.json(
      { error: "尚未配置启用的多模态模型 API" },
      { status: 503 },
    );
  }

  // 读取图片 (压缩为 dataURL 给模型, 让它能继续「看着图」讨论)
  let imageUrl: string | undefined;
  try {
    const rel = row.thumb_path || row.image_path;
    if (rel) {
      const base = rel.startsWith("/uploads/")
        ? path.join(process.cwd(), "public", rel)
        : path.join(process.cwd(), rel.replace(/^\//, ""));
      const buf = await readFile(base);
      imageUrl = `data:image/jpeg;base64,${buf.toString("base64")}`;
    }
  } catch {
    /* 图片缺失也能继续文本讨论 */
  }

  const safety = getPrompt("safety")?.content ?? "";
  const systemPrompt = [
    "你是橙迹 OrangeTrace 的图片地理定位助手。用户已经看到一份地理定位分析报告，正在针对它继续追问、纠错或补充。",
    "",
    "【任务】围绕下方的「已有分析结果」与图片继续讨论：",
    "- 若用户指出某地点不对 / 更像某地，请结合已有线索重新评估候选，并说明哪些线索支持或反对。",
    "- 若用户补充新线索（如路牌文字、季节、声音等），请据此修正或加强某候选。",
    "- 允许给出新的候选，或调整置信度；但要说明理由。",
    "- 如果信息不足以下结论，请诚实说明，不要编造。",
    "- 用简洁中文自然语言回答，不要输出 JSON，不要重复整份报告。",
    "- 不要把未实际执行过的工具描述成已验证; 如果用户问及某工具, 先看『交叉验证结果』上下文, 没有就说『暂未执行, 可点击重新验证』。",
    "",
    `已有分析结果 (JSON):\n${JSON.stringify(result, null, 2)}`,
    "",
    persistedTools.length
      ? `【交叉验证结果 (已执行工具的真实摘要)】\n${persistedTools.map((t) => `[${t.status}] ${t.tool}: ${t.summary}${t.evidence_for.length ? " | 支持: " + t.evidence_for.join(", ") : ""}${t.evidence_against.length ? " | 反对: " + t.evidence_against.join(", ") : ""}`).join("\n")}`
      : "【交叉验证结果】(暂未执行任何工具验证)",
    "",
    "【可用方法库参考】",
    buildSkillContext(8),
    "",
    "【安全约束】",
    safety,
  ].join("\n");

  // 拼接历史 (最多近 8 轮, 控制体积)
  const history = (body.history ?? []).slice(-8);
  const messages = history.map((h) => ({
    role: h.role === "user" ? ("user" as const) : ("assistant" as const),
    content: h.content,
  }));
  messages.push({ role: "user", content: userMsg });

  try {
    const llm = await callMultiTurn(config, systemPrompt, messages, imageUrl);
    appendConversation(id, "assistant", llm.content.trim());
    return NextResponse.json({ reply: llm.content.trim() });
  } catch (err) {
    const msg = (err as Error)?.message || "未知错误";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

/** GET /api/discuss/[id]/history —— 服务端对话回填 (可选; 默认前端 localStorage 优先) */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const rows = getDb()
    .prepare("SELECT role, content, created_at FROM analysis_conversations WHERE analysis_id = ? ORDER BY created_at")
    .all(id) as Array<{ role: string; content: string; created_at: string }>;
  return NextResponse.json({
    items: rows.map((r) => ({ role: r.role, content: r.content, created_at: r.created_at })),
  });
}

function appendConversation(analysisId: string, role: string, content: string) {
  try {
    getDb()
      .prepare(
        "INSERT INTO analysis_conversations (id, analysis_id, role, content) VALUES (?, ?, ?, ?)",
      )
      .run(nanoid(), analysisId, role, content.slice(0, 8000));
  } catch {
    // 持久化失败不影响回复
  }
}

/**
 * 多轮对话版调用 (区别于单轮分析的 callLlm)。
 * 内部仍走 OpenAI 兼容 chat/completions。
 */
async function callMultiTurn(
  config: ReturnType<typeof getDefaultApiConfig> & {},
  systemPrompt: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  imageUrl?: string,
): Promise<{ content: string }> {
  if (!config) throw new Error("无可用模型配置");
  const apiKey = (() => {
    const { decrypt } = require("@/lib/crypto");
    return decrypt(config.api_key_enc);
  })();
  const baseUrl = (config.base_url || "https://api.openai.com/v1").replace(/\/+$/, "");
  const url = `${baseUrl}/chat/completions`;

  const finalMessages: any[] = [
    { role: "system", content: systemPrompt },
    ...messages.slice(0, -1),
  ];
  const lastUser = messages[messages.length - 1];
  const lastContent: any[] = [{ type: "text", text: lastUser.content }];
  if (imageUrl) lastContent.push({ type: "image_url", image_url: { url: imageUrl } });
  finalMessages.push({ role: "user", content: lastContent });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), (config.timeout ?? 120) * 1000);

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: finalMessages,
        temperature: config.temperature ?? 0.3,
        max_tokens: config.max_tokens ?? 2048,
        max_completion_tokens: config.max_tokens ?? 2048,
        stream: false,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) {
      const t = await resp.text().catch(() => "");
      throw new Error(`模型 API 返回 ${resp.status}: ${t.slice(0, 300)}`);
    }
    const data = await resp.json();
    const content: string =
      data?.choices?.[0]?.message?.content ??
      data?.choices?.[0]?.message?.reasoning_content ??
      "";
    return { content: typeof content === "string" ? content : JSON.stringify(content) };
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}
