import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { encrypt, maskKey, decrypt } from "@/lib/crypto";
import { adminGuard } from "@/lib/api-guard";
import type { ApiConfig } from "@/lib/types";

export const runtime = "nodejs";

/** 列出所有 API 配置 (key 脱敏)。 */
export async function GET() {
  const g = await adminGuard();
  if (!g.ok) return g.response;
  const rows = getDb()
    .prepare("SELECT * FROM api_configs ORDER BY id")
    .all() as ApiConfig[];
  const safe = rows.map((r) => ({
    ...r,
    api_key_masked: maskKey(r.api_key_enc),
    has_key: Boolean(decrypt(r.api_key_enc)),
    api_key_enc: undefined,
  }));
  return NextResponse.json({ items: safe });
}

interface UpsertBody {
  id?: number;
  name: string;
  provider?: string;
  base_url?: string;
  api_key?: string; // 明文; 空串表示不修改
  model?: string;
  enabled?: boolean;
  is_default?: boolean;
  max_tokens?: number;
  temperature?: number;
  timeout?: number;
}

export async function POST(req: NextRequest) {
  const g = await adminGuard();
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => null)) as UpsertBody | null;
  if (!b || !b.name) {
    return NextResponse.json({ error: "缺少必要字段 name" }, { status: 400 });
  }
  const db = getDb();
  const apiKeyEnc = b.api_key ? encrypt(b.api_key) : "";

  if (b.is_default) {
    db.prepare("UPDATE api_configs SET is_default = 0").run();
  }

  if (b.id) {
    const existing = db
      .prepare("SELECT api_key_enc FROM api_configs WHERE id = ?")
      .get(b.id) as { api_key_enc: string } | undefined;
    const finalKey = apiKeyEnc || existing?.api_key_enc || "";
    db.prepare(
      `UPDATE api_configs SET name=?, provider=?, base_url=?, api_key_enc=?,
        model=?, enabled=?, is_default=?, max_tokens=?, temperature=?, timeout=?,
        updated_at=datetime('now') WHERE id=?`,
    ).run(
      b.name,
      b.provider ?? "custom",
      b.base_url ?? "",
      finalKey,
      b.model ?? "",
      b.enabled === false ? 0 : 1,
      b.is_default ? 1 : 0,
      b.max_tokens ?? 4096,
      b.temperature ?? 0.2,
      b.timeout ?? 120,
      b.id,
    );
    return NextResponse.json({ ok: true, id: b.id });
  }

  const result = db
    .prepare(
      `INSERT INTO api_configs
        (name, provider, base_url, api_key_enc, model, enabled, is_default, max_tokens, temperature, timeout)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      b.name,
      b.provider ?? "custom",
      b.base_url ?? "",
      apiKeyEnc,
      b.model ?? "",
      b.enabled === false ? 0 : 1,
      b.is_default ? 1 : 0,
      b.max_tokens ?? 4096,
      b.temperature ?? 0.2,
      b.timeout ?? 120,
    );
  return NextResponse.json({ ok: true, id: result.lastInsertRowid });
}

export async function DELETE(req: NextRequest) {
  const g = await adminGuard();
  if (!g.ok) return g.response;
  const { id } = (await req.json().catch(() => ({}))) as { id?: number };
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  getDb().prepare("DELETE FROM api_configs WHERE id = ?").run(id);
  return NextResponse.json({ ok: true });
}

/** 测试某个 API 配置是否能连通 (简单返回模型列表)。 */
export async function PATCH(req: NextRequest) {
  const g = await adminGuard();
  if (!g.ok) return g.response;
  const { id } = (await req.json().catch(() => ({}))) as { id?: number };
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  const row = getDb()
    .prepare("SELECT * FROM api_configs WHERE id = ?")
    .get(id) as ApiConfig | undefined;
  if (!row) return NextResponse.json({ error: "配置不存在" }, { status: 404 });
  const key = decrypt(row.api_key_enc);
  if (!key) return NextResponse.json({ error: "该配置未设置 API Key" }, { status: 400 });
  try {
    const url = (row.base_url || "https://api.openai.com/v1").replace(/\/+$/, "") + "/models";
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout((row.timeout ?? 30) * 1000),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      return NextResponse.json(
        { ok: false, error: `HTTP ${r.status}: ${t.slice(0, 200)}` },
        { status: 200 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 200 });
  }
}
