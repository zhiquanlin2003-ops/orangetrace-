import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { adminGuard } from "@/lib/api-guard";

export const runtime = "nodejs";

/** 后台首页仪表盘统计。 */
export async function GET() {
  const g = await adminGuard();
  if (!g.ok) return g.response;
  const db = getDb();
  const total = (db.prepare("SELECT COUNT(*) as c FROM analyses").get() as { c: number }).c;
  const success = (db.prepare("SELECT COUNT(*) as c FROM analyses WHERE status='success'").get() as { c: number }).c;
  const failed = (db.prepare("SELECT COUNT(*) as c FROM analyses WHERE status='failed'").get() as { c: number }).c;
  const running = (db.prepare("SELECT COUNT(*) as c FROM analyses WHERE status IN ('running','pending')").get() as { c: number }).c;
  const avgConf = (
    db.prepare("SELECT AVG(confidence) as a FROM analyses WHERE status='success'").get() as { a: number | null }
  ).a;
  const totalTokens = (db.prepare("SELECT COALESCE(SUM(total_tokens),0) as s FROM analyses").get() as { s: number }).s;
  const skills = (db.prepare("SELECT COUNT(*) as c FROM skills").get() as { c: number }).c;
  const enabledSkills = (db.prepare("SELECT COUNT(*) as c FROM skills WHERE enabled=1").get() as { c: number }).c;
  const apis = (db.prepare("SELECT COUNT(*) as c FROM api_configs").get() as { c: number }).c;
  const enabledApis = (db.prepare("SELECT COUNT(*) as c FROM api_configs WHERE enabled=1").get() as { c: number }).c;

  // 最近 14 天趋势
  const trend = db.prepare(
    `SELECT date(created_at) as d, COUNT(*) as c FROM analyses
     WHERE created_at >= datetime('now','-14 days')
     GROUP BY date(created_at) ORDER BY d`,
  ).all() as { d: string; c: number }[];

  return NextResponse.json({
    total, success, failed, running,
    avgConfidence: avgConf ? Math.round(avgConf) : null,
    totalTokens, skills, enabledSkills, apis, enabledApis, trend,
  });
}
