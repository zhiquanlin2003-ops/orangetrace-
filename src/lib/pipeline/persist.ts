import { getDb } from "@/lib/db";
import { safeJsonParse } from "@/lib/utils";
import { nanoid } from "@/lib/utils";
import type { AnalysisStage, AnalysisStatus, CandidateLocation } from "@/lib/types";
import type { ToolResult, VerificationEvidence } from "@/lib/tools/types";

/** 把 stage 推进写到 analyses.stage */
export function setStage(id: string, stage: AnalysisStage, status?: AnalysisStatus): void {
  const db = getDb();
  const sets: string[] = ["stage = ?", "updated_at = datetime('now')"];
  const args: any[] = [stage];
  if (status) {
    sets.push("status = ?");
    args.push(status);
  }
  args.push(id);
  db.prepare(`UPDATE analyses SET ${sets.join(", ")} WHERE id = ?`).run(...args);
}

/** 落入 candidate_locations (覆盖式: 先按 analysis_id 删, 再插) */
export function persistCandidates(analysisId: string, candidates: CandidateLocation[]): void {
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM candidate_locations WHERE analysis_id = ?").run(analysisId);
    const ins = db.prepare(
      `INSERT INTO candidate_locations
       (id, analysis_id, rank, country, province, city, district, name,
        latitude, longitude, coordinate_system, initial_confidence, final_confidence, status)
       VALUES (@id, @analysis_id, @rank, @country, @province, @city, @district, @name,
        @latitude, @longitude, @coordinate_system, @initial_confidence, @final_confidence, @status)`,
    );
    for (const c of candidates) {
      ins.run({
        id: c.id,
        analysis_id: analysisId,
        rank: c.rank,
        country: c.country ?? "",
        province: c.province ?? "",
        city: c.city ?? "",
        district: c.district ?? "",
        name: c.name ?? "",
        latitude: c.latitude ?? null,
        longitude: c.longitude ?? null,
        coordinate_system: c.coordinate_system ?? "wgs84",
        initial_confidence: c.initial_confidence ?? 0,
        final_confidence: c.final_confidence ?? 0,
        status: c.status ?? "pending",
      });
    }
  });
  tx();
}

export function loadCandidates(analysisId: string): CandidateLocation[] {
  const rows = getDb()
    .prepare("SELECT * FROM candidate_locations WHERE analysis_id = ? ORDER BY rank, id")
    .all(analysisId) as any[];
  return rows.map((r) => ({
    id: r.id,
    rank: r.rank,
    country: r.country ?? "",
    province: r.province ?? "",
    city: r.city ?? "",
    district: r.district ?? "",
    name: r.name ?? "",
    latitude: r.latitude ?? null,
    longitude: r.longitude ?? null,
    coordinate_system: r.coordinate_system ?? "wgs84",
    initial_confidence: r.initial_confidence ?? 0,
    final_confidence: r.final_confidence ?? 0,
    status: r.status ?? "pending",
  }));
}

export function updateCandidateConfidence(analysisId: string, updates: { id: string; final_confidence: number; status?: string }[]): void {
  if (updates.length === 0) return;
  const db = getDb();
  const stmt = db.prepare(
    "UPDATE candidate_locations SET final_confidence = ?, status = COALESCE(?, status) WHERE analysis_id = ? AND id = ?",
  );
  for (const u of updates) {
    stmt.run(Math.round(u.final_confidence), u.status ?? null, analysisId, u.id);
  }
}

/**
 * 工具层(如 amap_geocode)成功拿到坐标后, 把坐标回填到 candidate_locations。
 * 仅当该候选当前没有 lat/lng 时才覆盖, 避免覆盖模型给出的更精确的坐标。
 */
export function updateCandidateCoords(analysisId: string, candidateId: string, lat: number, lng: number): void {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  const db = getDb();
  db.prepare(
    `UPDATE candidate_locations
     SET latitude = ?, longitude = ?, coordinate_system = 'gcj02', status = 'verified'
     WHERE analysis_id = ? AND id = ?
       AND (latitude IS NULL OR latitude = '' OR latitude = 0)`,
  ).run(lat, lng, analysisId, candidateId);
}

/** 工具执行结果落库 (含证据) */
export function persistToolResult(analysisId: string, candidateId: string | undefined, r: ToolResult): void {
  const db = getDb();
  const id = nanoid();
  const createdAt = new Date().toISOString();
  const dur = Math.round(Number(new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime())) || 0;
  const durMs = Number.isFinite(dur) && dur > 0 ? dur : null;
  // 三层落库: tool_executions + verification_evidence
  const evidenceForDb = (r.evidence ?? []).slice(0, 12);
  const responseSummary = r.summary.slice(0, 2000);
  const evidenceJson = JSON.stringify({
    tool: r.tool,
    label: r.label,
    status: r.status,
    summary: r.summary.slice(0, 600),
    evidence: evidenceForDb,
  });
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO tool_executions
        (id, analysis_id, candidate_id, tool_name, status, request_summary, response_summary,
         evidence_json, error_message, duration_ms, mock, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id, analysisId, candidateId ?? null, r.tool, r.status,
      r.summary.slice(0, 600), responseSummary, evidenceJson,
      r.error ? String(r.error).slice(0, 600) : null, durMs,
      r.mock ? 1 : 0, createdAt,
    );
    const ins2 = db.prepare(
      `INSERT INTO verification_evidence
        (id, analysis_id, candidate_id, tool_execution_id, evidence_type, title, description,
         confidence, source, source_url, lat, lng, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const e of evidenceForDb) {
      ins2.run(
        nanoid(), analysisId, e.candidateId ?? candidateId ?? null, id,
        e.type, String(e.title).slice(0, 300), String(e.description).slice(0, 1000),
        Math.round(e.confidence ?? 0), e.source ?? "", e.sourceUrl ?? null,
        e.coordinates?.latitude ?? null, e.coordinates?.longitude ?? null, createdAt,
      );
    }
  });
  tx();
}

/** 读取某次分析已落库的全部工具结果 (轻量摘要) */
export function loadPersistedToolResults(analysisId: string): Array<{
  tool_name: string;
  status: string;
  summary: string;
  evidence_json: string;
  error_message: string | null;
  duration_ms: number | null;
  candidate_id: string | null;
  created_at: string;
  mock: number;
}> {
  return getDb()
    .prepare(
      "SELECT tool_name, status, response_summary as summary, evidence_json, error_message, duration_ms, candidate_id, created_at, mock FROM tool_executions WHERE analysis_id = ? ORDER BY created_at",
    )
    .all(analysisId) as any[];
}

export function clearToolResultsForAnalysis(analysisId: string): void {
  const db = getDb();
  const tx = db.transaction(() => {
    // 子表 verification_evidence 因 reference 也清
    db.prepare("DELETE FROM verification_evidence WHERE analysis_id = ?").run(analysisId);
    db.prepare("DELETE FROM tool_executions WHERE analysis_id = ?").run(analysisId);
  });
  tx();
}

/** 拿 evidence_for / evidence_against (用于 stage-second / 展示) */
export function loadEvidence(analysisId: string): VerificationEvidence[] {
  const rows = getDb()
    .prepare(
      "SELECT evidence_type, title, description, confidence, source, source_url, lat, lng, candidate_id FROM verification_evidence WHERE analysis_id = ?",
    )
    .all(analysisId) as any[];
  return rows.map((r) => ({
    type: (r.evidence_type || "neutral") as any,
    title: r.title,
    description: r.description,
    confidence: r.confidence ?? 0,
    source: r.source,
    sourceUrl: r.source_url ?? undefined,
    candidateId: r.candidate_id ?? undefined,
    coordinates: r.lat != null && r.lng != null ? { latitude: r.lat, longitude: r.lng } : undefined,
  }));
}

/** 记录音效: 用户主动重验证的时间戳 */
export function markManualVerify(analysisId: string): void {
  getDb().prepare("UPDATE analyses SET last_verify_at = datetime('now') WHERE id = ?").run(analysisId);
}

export function getStage(id: string): { stage: string | null; status: string } {
  const r = getDb().prepare("SELECT stage, status FROM analyses WHERE id = ?").get(id) as any;
  return { stage: r?.stage ?? null, status: r?.status ?? "pending" };
}
