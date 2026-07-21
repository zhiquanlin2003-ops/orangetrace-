import { getDb } from "./db";
import type {
  ApiConfig,
  ExternalTool,
  PromptKey,
  PromptTemplate,
  Skill,
  SiteSettings,
} from "./types";

/* ---------- Prompts ---------- */
export function getAllPrompts(): PromptTemplate[] {
  return getDb()
    .prepare("SELECT * FROM prompt_templates ORDER BY id")
    .all() as PromptTemplate[];
}

export function getPrompt(key: PromptKey): PromptTemplate | null {
  return getDb()
    .prepare("SELECT * FROM prompt_templates WHERE key = ?")
    .get(key) as PromptTemplate | undefined ?? null;
}

export function upsertPrompt(
  key: PromptKey,
  content: string,
): void {
  const existing = getPrompt(key);
  const db = getDb();
  if (existing) {
    db.prepare(
      "UPDATE prompt_templates SET content = ?, updated_at = datetime('now') WHERE key = ?",
    ).run(content, key);
  } else {
    db.prepare(
      "INSERT INTO prompt_templates (key, label, content) VALUES (?, ?, ?)",
    ).run(key, key, content);
  }
}

/* ---------- Skills ---------- */
export function getEnabledSkills(): Skill[] {
  return getDb()
    .prepare(
      "SELECT * FROM skills WHERE enabled = 1 ORDER BY priority DESC, id ASC",
    )
    .all() as Skill[];
}

export function getAllSkills(): Skill[] {
  return getDb()
    .prepare("SELECT * FROM skills ORDER BY priority DESC, id ASC")
    .all() as Skill[];
}

export function getSkill(id: number): Skill | null {
  return (getDb()
    .prepare("SELECT * FROM skills WHERE id = ?")
    .get(id) as Skill | undefined) ?? null;
}

/* ---------- Tools ---------- */
export function getEnabledTools(): ExternalTool[] {
  return getDb()
    .prepare("SELECT * FROM external_tools WHERE enabled = 1 ORDER BY id")
    .all() as ExternalTool[];
}

/* ---------- Settings ---------- */
export function getSettings(): SiteSettings {
  const db = getDb();
  const rows = db.prepare("SELECT k, v FROM settings").all() as {
    k: string;
    v: string;
  }[];
  const map: Record<string, string> = {};
  for (const r of rows) map[r.k] = r.v;
  return {
    save_original_image: Number(map.save_original_image ?? "1"),
    auto_delete_hours: Number(map.auto_delete_hours ?? "24"),
  };
}

export function setSetting(k: string, v: string) {
  getDb()
    .prepare(
      "INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v",
    )
    .run(k, v);
}

/* ---------- Api configs ---------- */
export function getAllApis(): ApiConfig[] {
  return getDb()
    .prepare("SELECT * FROM api_configs ORDER BY id")
    .all() as ApiConfig[];
}
