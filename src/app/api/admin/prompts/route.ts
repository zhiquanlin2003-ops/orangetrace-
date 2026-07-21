import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { adminGuard } from "@/lib/api-guard";
import { getAllPrompts } from "@/lib/data";
import type { PromptKey } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  const g = await adminGuard();
  if (!g.ok) return g.response;
  return NextResponse.json({ items: getAllPrompts() });
}

export async function POST(req: NextRequest) {
  const g = await adminGuard();
  if (!g.ok) return g.response;
  const { key, content } = (await req.json().catch(() => ({}))) as {
    key?: PromptKey;
    content?: string;
  };
  if (!key || content == null) {
    return NextResponse.json({ error: "缺少 key 或 content" }, { status: 400 });
  }
  getDb()
    .prepare(
      `UPDATE prompt_templates SET content = ?, updated_at = datetime('now') WHERE key = ?`,
    )
    .run(content, key);
  return NextResponse.json({ ok: true });
}

/** 恢复某个 prompt 到默认值。 */
export async function PUT(req: NextRequest) {
  const g = await adminGuard();
  if (!g.ok) return g.response;
  const { key } = (await req.json().catch(() => ({}))) as { key?: PromptKey };
  if (!key) return NextResponse.json({ error: "缺少 key" }, { status: 400 });
  const { defaultPrompts } = await import("@/lib/db/defaults");
  const def = defaultPrompts.find((p) => p.key === key);
  if (!def) return NextResponse.json({ error: "未知 key" }, { status: 400 });
  getDb()
    .prepare(
      "UPDATE prompt_templates SET content = ?, updated_at = datetime('now') WHERE key = ?",
    )
    .run(def.content, key);
  return NextResponse.json({ ok: true, content: def.content });
}
