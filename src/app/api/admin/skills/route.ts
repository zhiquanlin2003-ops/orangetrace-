import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { adminGuard } from "@/lib/api-guard";
import { docToSkills, parseHtmlDoc, parseMarkdownDoc } from "@/lib/skill-parser";
import type { Skill } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  const g = await adminGuard();
  if (!g.ok) return g.response;
  const items = getDb()
    .prepare("SELECT * FROM skills ORDER BY priority DESC, id ASC")
    .all() as Skill[];
  return NextResponse.json({ items });
}

interface SaveBody {
  id?: number;
  name: string;
  description?: string;
  scenario?: string;
  key_clues?: string;
  recommended_tools?: string;
  caveats?: string;
  category?: string;
  priority?: number;
  enabled?: boolean;
  version?: string;
}

export async function POST(req: NextRequest) {
  const g = await adminGuard();
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => null)) as SaveBody | null;
  if (!b || !b.name) {
    return NextResponse.json({ error: "缺少 name" }, { status: 400 });
  }
  const db = getDb();
  if (b.id) {
    db.prepare(
      `UPDATE skills SET name=?, description=?, scenario=?, key_clues=?,
        recommended_tools=?, caveats=?, category=?, priority=?, enabled=?, version=?,
        updated_at=datetime('now') WHERE id=?`,
    ).run(
      b.name, b.description ?? "", b.scenario ?? "", b.key_clues ?? "",
      b.recommended_tools ?? "", b.caveats ?? "", b.category ?? "通用",
      b.priority ?? 50, b.enabled === false ? 0 : 1, b.version ?? "v1", b.id,
    );
    return NextResponse.json({ ok: true, id: b.id });
  }
  const r = db.prepare(
    `INSERT INTO skills (name, description, scenario, key_clues, recommended_tools,
       caveats, category, priority, enabled, version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    b.name, b.description ?? "", b.scenario ?? "", b.key_clues ?? "",
    b.recommended_tools ?? "", b.caveats ?? "", b.category ?? "通用",
    b.priority ?? 50, b.enabled === false ? 0 : 1, b.version ?? "v1",
  );
  return NextResponse.json({ ok: true, id: r.lastInsertRowid });
}

export async function DELETE(req: NextRequest) {
  const g = await adminGuard();
  if (!g.ok) return g.response;
  const { id } = (await req.json().catch(() => ({}))) as { id?: number };
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  getDb().prepare("DELETE FROM skills WHERE id = ?").run(id);
  return NextResponse.json({ ok: true });
}

/**
 * 上传 HTML / Markdown / TXT, 自动解析为多个 skill 条目并入库。
 * 用 multipart/form-data, 字段名 file。
 */
export async function PUT(req: NextRequest) {
  const g = await adminGuard();
  if (!g.ok) return g.response;
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "需要 multipart/form-data" }, { status: 400 });
  const file = form.get("file");
  const defaultCategory = (form.get("category") as string) || "自定义";
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "未找到 file 字段" }, { status: 400 });
  }
  const text = await file.text();
  const sourceName = file.name;
  const lower = sourceName.toLowerCase();
  let doc;
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) {
    doc = parseMarkdownDoc(text);
  } else {
    doc = parseHtmlDoc(text);
  }
  const parsed = docToSkills(doc, sourceName, defaultCategory);
  const db = getDb();
  const ins = db.prepare(
    `INSERT INTO skills (name, description, scenario, key_clues, recommended_tools,
       caveats, category, priority, enabled, version, source, raw_content)
     VALUES (@name, @description, @scenario, @key_clues, @recommended_tools,
       @caveats, @category, @priority, @enabled, 'v1', @source, @raw_content)`,
  );
  const ids: number[] = [];
  const tx = db.transaction((items: typeof parsed) => {
    for (const it of items) {
      const r = ins.run({
        name: it.name, description: it.description, scenario: it.scenario,
        key_clues: it.key_clues, recommended_tools: it.recommended_tools,
        caveats: it.caveats, category: it.category, priority: it.priority,
        enabled: it.enabled ?? 1, source: it.source, raw_content: it.raw_content ?? "",
      });
      ids.push(Number(r.lastInsertRowid));
    }
  });
  tx(parsed);
  return NextResponse.json({ ok: true, created: parsed.length, ids, title: doc.title });
}
