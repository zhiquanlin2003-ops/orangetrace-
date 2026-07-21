import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { adminGuard } from "@/lib/api-guard";
import type { ExternalTool } from "@/lib/types";
import {
  getAllToolConfigs,
  updateToolConfig,
  setTestResult,
} from "@/lib/tools/store";
import { testToolByName } from "@/lib/tools/registry";

export const runtime = "nodejs";

/**
 * GET /api/admin/tools -> external_tools 列表
 * GET /api/admin/tools?section=verify -> 验证工具运营配置列表 (第 7 轮新增)
 */
export async function GET(req: NextRequest) {
  const g = await adminGuard();
  if (!g.ok) return g.response;
  const section = req.nextUrl.searchParams.get("section");
  if (section === "verify") {
    const items = getAllToolConfigs();
    return NextResponse.json({ items });
  }
  const items = getDb()
    .prepare("SELECT * FROM external_tools ORDER BY id")
    .all() as ExternalTool[];
  return NextResponse.json({ items });
}

interface SaveBody {
  id?: number;
  name: string;
  description?: string;
  url?: string;
  category?: string;
  applies_to?: string;
  enabled?: boolean;
  icon?: string;
}

/**
 * POST  /api/admin/tools           -> external_tools 新增/更新
 * POST  /api/admin/tools?action=test&tool=<name> -> 验证工具连通性测试
 * PUT   /api/admin/tools?section=verify  -> 更新验证工具配置 (Key 永不返回)
 */
export async function POST(req: NextRequest) {
  const g = await adminGuard();
  if (!g.ok) return g.response;
  const section = req.nextUrl.searchParams.get("section");
  const action = req.nextUrl.searchParams.get("action");

  if (action === "test") {
    // 测试连通性 (按 verification tool name)
    const tool = req.nextUrl.searchParams.get("tool");
    if (!tool) return NextResponse.json({ error: "缺少 tool 参数" }, { status: 400 });
    const result = await testToolByName(tool);
    setTestResult(tool, result.ok ? "ok" : "fail");
    return NextResponse.json({ ok: result.ok, message: result.message });
  }

  if (section === "verify") {
    return NextResponse.json({ error: "请使用 PUT 方法更新验证工具配置" }, { status: 405 });
  }

  // 原行为: 外部工具(推荐链接) 增改
  const b = (await req.json().catch(() => null)) as SaveBody | null;
  if (!b || !b.name) {
    return NextResponse.json({ error: "缺少 name" }, { status: 400 });
  }
  const db = getDb();
  if (b.id) {
    db.prepare(
      `UPDATE external_tools SET name=?, description=?, url=?, category=?,
        applies_to=?, enabled=?, icon=? WHERE id=?`,
    ).run(
      b.name, b.description ?? "", b.url ?? "", b.category ?? "通用",
      b.applies_to ?? "", b.enabled === false ? 0 : 1, b.icon ?? null, b.id,
    );
    return NextResponse.json({ ok: true, id: b.id });
  }
  const r = db.prepare(
    `INSERT INTO external_tools (name, description, url, category, applies_to, enabled, icon)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    b.name, b.description ?? "", b.url ?? "", b.category ?? "通用",
    b.applies_to ?? "", b.enabled === false ? 0 : 1, b.icon ?? null,
  );
  return NextResponse.json({ ok: true, id: r.lastInsertRowid });
}

/** PUT /api/admin/tools?section=verify -> 更新验证工具配置 */
export async function PUT(req: NextRequest) {
  const g = await adminGuard();
  if (!g.ok) return g.response;
  const section = req.nextUrl.searchParams.get("section");
  if (section !== "verify") {
    return NextResponse.json({ error: "目前 PUT 仅支持 ?section=verify" }, { status: 400 });
  }
  const b = (await req.json().catch(() => null)) as {
    k: string;
    enabled?: boolean;
    label?: string;
    sort_order?: number;
    /** 非敏感字段 (timeout / radius / endpoint / max_calls_* / description ...) */
    cfg_patch?: Record<string, any>;
    /** 敏感字段明文写入 (会被加密) */
    key_fields?: Record<string, string>;
    /** 要清空的敏感字段名 */
    clear_key_fields?: string[];
  } | null;
  if (!b || !b.k) {
    return NextResponse.json({ error: "缺少 k" }, { status: 400 });
  }
  const ok = updateToolConfig(b.k, {
    enabled: b.enabled,
    label: b.label,
    sort_order: b.sort_order,
    cfg_patch: b.cfg_patch,
    set_key_fields: b.key_fields,
    clear_key_fields: b.clear_key_fields,
  });
  if (!ok) return NextResponse.json({ error: "未找到该工具" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const g = await adminGuard();
  if (!g.ok) return g.response;
  const { id } = (await req.json().catch(() => ({}))) as { id?: number };
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  getDb().prepare("DELETE FROM external_tools WHERE id = ?").run(id);
  return NextResponse.json({ ok: true });
}
