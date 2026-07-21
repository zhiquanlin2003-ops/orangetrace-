import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { dirname, resolve } from "path";
import { seedDatabase } from "./seed";

let _db: Database.Database | null = null;

function resolveDbPath(): string {
  const env = process.env.DATABASE_URL || "file:./data/orangetrace.db";
  const stripped = env.replace(/^file:/, "");
  return resolve(process.cwd(), stripped);
}

/** 返回单例 db 连接 (Node 运行时). */
export function getDb(): Database.Database {
  if (_db) return _db;
  const path = resolveDbPath();
  mkdirSync(dirname(path), { recursive: true });

  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  initSchema(db);
  seedDatabase(db);

  _db = db;
  return db;
}

/** 仅给测试用: 显式重建连接 */
export function _resetDb() {
  _db = null;
}

const SCHEMA = /* sql */ `
CREATE TABLE IF NOT EXISTS api_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'custom',
  base_url TEXT NOT NULL DEFAULT '',
  api_key_enc TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  is_default INTEGER NOT NULL DEFAULT 0,
  max_tokens INTEGER NOT NULL DEFAULT 4096,
  temperature REAL NOT NULL DEFAULT 0.2,
  timeout INTEGER NOT NULL DEFAULT 120,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  scenario TEXT NOT NULL DEFAULT '',
  key_clues TEXT NOT NULL DEFAULT '',
  recommended_tools TEXT NOT NULL DEFAULT '',
  caveats TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '通用',
  priority INTEGER NOT NULL DEFAULT 50,
  enabled INTEGER NOT NULL DEFAULT 1,
  version TEXT NOT NULL DEFAULT 'v1',
  source TEXT,
  raw_content TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS prompt_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  content TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS external_tools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '通用',
  applies_to TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  icon TEXT
);

CREATE TABLE IF NOT EXISTS analyses (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'pending',
  filename TEXT NOT NULL DEFAULT '',
  image_path TEXT NOT NULL DEFAULT '',
  thumb_path TEXT,
  options TEXT NOT NULL DEFAULT '{}',
  exif_summary TEXT,
  model_name TEXT,
  api_id INTEGER,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  duration_ms INTEGER,
  error TEXT,
  result_json TEXT,
  confidence INTEGER
);

CREATE INDEX IF NOT EXISTS idx_analyses_created ON analyses(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analyses_status ON analyses(status);

CREATE TABLE IF NOT EXISTS settings (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- 第 7 轮迭代：交叉验证流水线相关表（全部 IF NOT EXISTS, 安全追加）
-- ============================================================

-- 候选地点 (一次分析可有多条)
CREATE TABLE IF NOT EXISTS candidate_locations (
  id TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL,
  rank INTEGER NOT NULL DEFAULT 0,
  country TEXT NOT NULL DEFAULT '',
  province TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  district TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  latitude REAL,
  longitude REAL,
  coordinate_system TEXT NOT NULL DEFAULT 'wgs84',
  initial_confidence INTEGER NOT NULL DEFAULT 0,
  final_confidence INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (analysis_id) REFERENCES analyses(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_candidate_locations_aid ON candidate_locations(analysis_id);

-- 单次工具执行 (一次分析可有多条, 即可跨候选)
CREATE TABLE IF NOT EXISTS tool_executions (
  id TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL,
  candidate_id TEXT,
  tool_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  request_summary TEXT NOT NULL DEFAULT '',
  response_summary TEXT NOT NULL DEFAULT '',
  evidence_json TEXT,
  error_message TEXT,
  duration_ms INTEGER,
  mock INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (analysis_id) REFERENCES analyses(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_tool_exec_aid ON tool_executions(analysis_id);

-- 验证证据 (一次工具执行可产出多条)
CREATE TABLE IF NOT EXISTS verification_evidence (
  id TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL,
  candidate_id TEXT,
  tool_execution_id TEXT,
  evidence_type TEXT NOT NULL DEFAULT 'neutral',
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  confidence INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT '',
  source_url TEXT,
  lat REAL,
  lng REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (analysis_id) REFERENCES analyses(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_verif_ev_aid ON verification_evidence(analysis_id);

-- 结果对话持久化 (前端 localStorage 为主, 这里同步用于审计/恢复)
CREATE TABLE IF NOT EXISTS analysis_conversations (
  id TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (analysis_id) REFERENCES analyses(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_conv_aid ON analysis_conversations(analysis_id);

-- 验证工具的运营级配置 (与 external_tools 完全分开)。
-- config_json 内存放各工具的字段, 包含加密后的 key (enc:v1:...)。
CREATE TABLE IF NOT EXISTS verification_tool_configs (
  k TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  tool_type TEXT NOT NULL DEFAULT 'verifier',
  enabled INTEGER NOT NULL DEFAULT 1,
  config_json TEXT NOT NULL DEFAULT '{}',
  last_test_at TEXT,
  last_test_status TEXT,
  sort_order INTEGER NOT NULL DEFAULT 100,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

/**
 * analyses 表: 向后兼容地补加 2 列。
 * IF NOT EXISTS 对已存在表无效, 必须显式 ALTER 并用 PRAGMA 守卫。
 */
function migrateAnalysesColumns(db: Database.Database) {
  const cols = db.prepare("PRAGMA table_info(analyses)").all() as { name: string }[];
  const names = new Set(cols.map((c) => c.name));
  if (!names.has("initial_result_json")) {
    db.exec("ALTER TABLE analyses ADD COLUMN initial_result_json TEXT");
  }
  if (!names.has("initial_confidence")) {
    db.exec("ALTER TABLE analyses ADD COLUMN initial_confidence INTEGER");
  }
  if (!names.has("stage")) {
    db.exec("ALTER TABLE analyses ADD COLUMN stage TEXT NOT NULL DEFAULT 'pending'");
  }
  // 上次用户主动重新验证时间戳 (用于冷却)
  if (!names.has("last_verify_at")) {
    db.exec("ALTER TABLE analyses ADD COLUMN last_verify_at TEXT");
  }
}

function initSchema(db: Database.Database) {
  db.exec(SCHEMA);
  migrateAnalysesColumns(db);
}
