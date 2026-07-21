import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { adminGuard } from "@/lib/api-guard";
import { getSettings } from "@/lib/data";

export const runtime = "nodejs";

export async function GET() {
  const g = await adminGuard();
  if (!g.ok) return g.response;
  return NextResponse.json(getSettings());
}

export async function POST(req: NextRequest) {
  const g = await adminGuard();
  if (!g.ok) return g.response;
  const body = (await req.json().catch(() => ({}))) as {
    save_original_image?: boolean;
    auto_delete_hours?: number;
  };
  const db = getDb();
  if (body.save_original_image != null) {
    db.prepare(
      "INSERT INTO settings (k, v) VALUES ('save_original_image', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v",
    ).run(body.save_original_image ? "1" : "0");
  }
  if (body.auto_delete_hours != null) {
    const h = Math.max(0, Math.min(720, Number(body.auto_delete_hours) || 0));
    db.prepare(
      "INSERT INTO settings (k, v) VALUES ('auto_delete_hours', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v",
    ).run(String(h));
  }
  return NextResponse.json({ ok: true, ...getSettings() });
}
