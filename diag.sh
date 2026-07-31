#!/bin/bash
# OrangeTrace 诊断脚本 — 在 VPS 上跑这个, 输出贴给我
sudo docker exec orangetrace node -e "
const db = require('better-sqlite3')('/data/orangetrace.db');
const rows = db.prepare('SELECT id, status, model_name, substr(result_json, 1, 200) as rj_head FROM analyses ORDER BY created_at DESC LIMIT 5').all();
console.log(JSON.stringify(rows, null, 2));

const tools = db.prepare('SELECT count(*) as c FROM tool_executions').get();
console.log('tool_executions count:', tools.c);

const cands = db.prepare('SELECT count(*) as c FROM candidate_locations').get();
console.log('candidate_locations count:', cands.c);

// 看最新分析的 result_json 有没有 cross_verification
const latest = db.prepare('SELECT result_json FROM analyses WHERE status=\"success\" ORDER BY created_at DESC LIMIT 1').get();
if (latest && latest.result_json) {
  const r = JSON.parse(latest.result_json);
  console.log('latest has cross_verification:', !!r.cross_verification);
  console.log('latest has tool_results:', Array.isArray(r.tool_results) ? r.tool_results.length : 'no');
  console.log('latest has candidate_locations:', Array.isArray(r.candidate_locations) ? r.candidate_locations.length : 'no');
} else {
  console.log('latest result_json is null or missing');
}
"
