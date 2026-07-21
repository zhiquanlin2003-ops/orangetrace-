"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import {
  Loader2,
  Map as MapIcon,
  KeyRound,
  Save,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Globe2,
  Server,
  ShieldCheck,
} from "lucide-react";

/**
 * 后台仪表盘: 高德地图一键配置卡片。
 * 三个 Key 在同一个小表单内编辑, 配完即生效, 不必跳到 /admin/tools → 标签 → 编辑。
 *
 * 复用第 7 轮的接口:
 *   GET  /api/admin/tools?section=verify  -> 拉当前配置(已脱敏,只回 has_key/masked_key)
 *   PUT  /api/admin/tools?section=verify  -> 保存 (key_fields 加密入库)
 */

interface VerifyDoc {
  k: string;
  label: string;
  enabled: boolean;
  cfg: Record<string, any>;
  has_key: boolean;
  masked_key: string;
  /** 每个敏感字段是否已配置 (新增, 仅返回 true/false, 无明文) */
  key_flags: Record<string, boolean>;
  last_test_at: string | null;
  last_test_status: string | null;
}

const KEY_LABEL = {
  amap_web: "高德 Web 服务 Key",
  amap_js_key: "高德 JS API Key",
  amap_js_security: "JS API 安全密钥",
};

export function AmapConfigCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // 当前 DB 中的脱敏状态
  const [webKey, setWebKey] = useState<VerifyDoc | null>(null);
  const [jsCfg, setJsCfg] = useState<VerifyDoc | null>(null);

  // 输入框 (留空表示不修改; 已有的会显示占位)
  const [webKeyInput, setWebKeyInput] = useState("");
  const [jsKeyInput, setJsKeyInput] = useState("");
  const [jsSecurityInput, setJsSecurityInput] = useState("");

  const [webEnabled, setWebEnabled] = useState(true);
  const [jsEnabled, setJsEnabled] = useState(true);

  const [testMsg, setTestMsg] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetch("/api/admin/tools?section=verify", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        const items: VerifyDoc[] = j.items ?? [];
        setWebKey(items.find((i) => i.k === "amap_web") ?? null);
        setJsCfg(items.find((i) => i.k === "amap_js") ?? null);
        const web = items.find((i) => i.k === "amap_web");
        const js = items.find((i) => i.k === "amap_js");
        setWebEnabled(web?.enabled ?? true);
        setJsEnabled(js?.enabled ?? true);
      })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      // 1. Web 服务 key (amap_web.key_enc)
      if (webKeyInput.trim()) {
        const r = await fetch("/api/admin/tools?section=verify", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            k: "amap_web",
            enabled: webEnabled,
            key_fields: { key_enc: webKeyInput.trim() },
          }),
        });
        if (!r.ok) {
          const j = await r.json().catch(() => null);
          throw new Error(j?.error || "Web Key 保存失败");
        }
      } else if (webKey && webKey.enabled !== webEnabled) {
        // 启用状态变化也保存
        await fetch("/api/admin/tools?section=verify", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ k: "amap_web", enabled: webEnabled }),
        });
      }

      // 2. JS Key + 安全密钥 (amap_js: js_key + security_js_code)
      const jsKeyFields: Record<string, string> = {};
      if (jsKeyInput.trim()) jsKeyFields.js_key = jsKeyInput.trim();
      if (jsSecurityInput.trim()) jsKeyFields.security_js_code = jsSecurityInput.trim();
      if (Object.keys(jsKeyFields).length > 0 || (jsCfg && jsCfg.enabled !== jsEnabled)) {
        const r = await fetch("/api/admin/tools?section=verify", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            k: "amap_js",
            enabled: jsEnabled,
            ...(Object.keys(jsKeyFields).length > 0 ? { key_fields: jsKeyFields } : {}),
          }),
        });
        if (!r.ok) {
          const j = await r.json().catch(() => null);
          throw new Error(j?.error || "JS Key 保存失败");
        }
      }

      setWebKeyInput("");
      setJsKeyInput("");
      setJsSecurityInput("");
      setSaved(true);
      setTestMsg(null);
      load();
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError((err as Error)?.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const testWeb = async () => {
    setTesting(true);
    setTestMsg(null);
    try {
      const r = await fetch("/api/admin/tools?action=test&tool=amap_poi_search", { method: "POST" });
      const j = await r.json().catch(() => null);
      if (j?.ok) {
        setTestMsg(`✓ ${j.message}`);
      } else {
        setTestMsg(`× ${j?.message || j?.error || "测试失败"}`);
      }
      // 刷新 last_test_at
      load();
    } finally {
      setTesting(false);
    }
  };

  const clearKey = async (secret: "web" | "js_key" | "js_security") => {
    const label: Record<typeof secret, string> = {
      web: "高德 Web 服务 Key",
      js_key: "高德 JS API Key",
      js_security: "JS 安全密钥",
    };
    if (!confirm(`确认清空 ${label[secret]}?`)) return;
    if (secret === "web") {
      await fetch("/api/admin/tools?section=verify", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ k: "amap_web", clear_key_fields: ["key_enc"] }),
      });
    } else {
      const field = secret === "js_key" ? "js_key" : "security_js_code";
      await fetch("/api/admin/tools?section=verify", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ k: "amap_js", clear_key_fields: [field] }),
      });
    }
    load();
  };

  return (
    <Card className="border-orange-200">
      <CardContent className="space-y-4 p-5">
        {/* 标题 */}
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-800">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
              <MapIcon className="h-3.5 w-3.5" />
            </span>
            高德地图 API 配置
          </h2>
          <Link href="/admin/tools">
            <Button variant="ghost" size="sm">
              全部工具 <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>

        {/* 状态摘要 */}
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> 加载当前配置…
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 text-xs">
            <StatusPill
              icon={Server}
              label="Web Key"
              ok={!!webKey?.key_flags?.key_enc}
              hint={webKey?.masked_key && webKey.key_flags?.key_enc ? webKey.masked_key : "未配置"}
              enabled={!!webKey?.enabled}
            />
            <StatusPill
              icon={Globe2}
              label="JS Key"
              ok={!!jsCfg?.key_flags?.js_key}
              hint={jsCfg?.key_flags?.js_key ? "已配置" : "未配置"}
              enabled={!!jsEnabled}
            />
            <StatusPill
              icon={KeyRound}
              label="安全密钥"
              ok={!!jsCfg?.key_flags?.security_js_code}
              hint={jsCfg?.key_flags?.security_js_code ? "已配置" : "未配置"}
              enabled={!!jsEnabled}
            />
          </div>
        )}

        {/* 三个输入 + 启用开关 */}
        <div className="space-y-3 rounded-xl border border-zinc-100 bg-zinc-50/40 p-3.5">
          <Field
            label={KEY_LABEL.amap_web}
            type="password"
            placeholder={webKey?.key_flags?.key_enc ? webKey.masked_key : "例如 1a2b3c4d5e6f7g8h9i0j..."}
            value={webKeyInput}
            onChange={setWebKeyInput}
            hasValue={!!webKey?.key_flags?.key_enc}
            masked={webKey?.masked_key && webKey.key_flags?.key_enc ? webKey.masked_key : undefined}
            hint="服务器调用 POI / 地理编码 / 周边搜索用。已加密存储, 永不返回浏览器。"
            onClear={() => clearKey("web")}
            enabled={webEnabled}
            onToggle={setWebEnabled}
            toggleLabel="启用验证"
          />

          <Field
            label={KEY_LABEL.amap_js_key}
            type="password"
            placeholder="例如 fb923c... (会在前端 public, 仅用于结果页地图)"
            value={jsKeyInput}
            onChange={setJsKeyInput}
            hasValue={!!jsCfg?.key_flags?.js_key}
            masked={jsCfg?.key_flags?.js_key ? "••••" : ""}
            hint="结果页渲染候选地点地图使用。该字段以 NEXT_PUBLIC_ 开头, 会经 Webpack 注入前端。"
            enabled={jsEnabled}
            onToggle={setJsEnabled}
            toggleLabel="启用地图"
          />

          <Field
            label={KEY_LABEL.amap_js_security}
            type="password"
            placeholder="例如 9f8e7d6c... (可选, 2.0 版 JS API 需要)"
            value={jsSecurityInput}
            onChange={setJsSecurityInput}
            hasValue={!!jsCfg?.key_flags?.security_js_code}
            masked={jsCfg?.key_flags?.security_js_code ? "••••" : ""}
            hint="仅配合 JS API Key 使用, 没有可以留空。"
          />
        </div>

        {/* 反馈区 */}
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50/70 px-3 py-2 text-xs text-red-700">
            <XCircle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}
        {saved && (
          <div className="flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50/70 px-3 py-2 text-xs text-orange-800">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-orange-600" /> 已保存。下次分析将自动使用新配置。
          </div>
        )}
        {testMsg && (
          <div
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
              testMsg.startsWith("✓")
                ? "border-green-200 bg-green-50/70 text-green-700"
                : "border-red-200 bg-red-50/70 text-red-700"
            }`}
          >
            {testMsg}
          </div>
        )}

        {/* 操作行 */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button size="sm" variant="outline" onClick={testWeb} disabled={testing || !webKey?.key_flags?.key_enc}>
            {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
            {testing ? "测试中…" : "测试 Web Key"}
          </Button>
          <Button size="sm" onClick={save} disabled={saving || (!webKeyInput && !jsKeyInput && !jsSecurityInput)}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            保存配置
          </Button>
        </div>

        {webKey?.last_test_at && (
          <p className="text-[11px] text-zinc-400">
            最近一次测试 {new Date(webKey.last_test_at.replace(" ", "T") + "Z").toLocaleString()}:
            {" "}
            <span className={webKey.last_test_status === "ok" ? "text-green-600" : "text-red-500"}>
              {webKey.last_test_status === "ok" ? "通过" : "失败"}
            </span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/* ============ 子组件 ============ */

function StatusPill({
  icon: Icon,
  label,
  ok,
  hint,
  enabled,
}: {
  icon: any;
  label: string;
  ok: boolean;
  hint?: string;
  enabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-zinc-100">
      <span className="flex items-center gap-1.5 text-zinc-600">
        <Icon className="h-3.5 w-3.5 text-zinc-400" />
        <span className="truncate">{label}</span>
      </span>
      {ok ? (
        <Badge tone={enabled ? "green" : "zinc"}>
          <CheckCircle2 className="h-3 w-3" /> {enabled ? "已启用" : "未启用"}
        </Badge>
      ) : (
        <Badge tone="zinc">
          <XCircle className="h-3 w-3" /> {hint || "未配置"}
        </Badge>
      )}
    </div>
  );
}

function Field({
  label,
  type,
  placeholder,
  value,
  onChange,
  hasValue,
  masked,
  hint,
  onClear,
  enabled,
  onToggle,
  toggleLabel,
}: {
  label: string;
  type?: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  hasValue: boolean;
  masked?: string;
  hint?: string;
  onClear?: () => void;
  enabled?: boolean;
  onToggle?: (v: boolean) => void;
  toggleLabel?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <Label className="mb-1">
          {label}
          {hasValue && (
            <span className="ml-1 text-[11px] font-normal text-zinc-400">
              (已配置 {masked || "••••"}, 留空表示不修改)
            </span>
          )}
        </Label>
        {onClear && hasValue && (
          <button
            type="button"
            onClick={onClear}
            className="mb-1 text-[11px] text-red-500 hover:underline"
          >
            清空
          </button>
        )}
      </div>
      <Input
        type={type ?? "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? masked}
        autoComplete="off"
      />
      {hint && <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">{hint}</p>}
      {onToggle && (
        <label className="mt-1.5 flex items-center gap-1.5 text-[11px] text-zinc-600">
          <input
            type="checkbox"
            checked={!!enabled}
            onChange={(e) => onToggle(e.target.checked)}
            className="h-3.5 w-3.5 rounded text-orange-500"
          />
          {toggleLabel}
        </label>
      )}
    </div>
  );
}
