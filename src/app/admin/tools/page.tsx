"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Switch } from "@/components/ui/Progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/Dialog";
import {
  Wrench,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  ExternalLink,
  KeyRound,
  FlaskConical,
  CheckCircle2,
  XCircle,
  RefreshCw,
} from "lucide-react";

interface Tool {
  id: number;
  name: string;
  description: string;
  url: string;
  category: string;
  applies_to: string;
  enabled: number;
}

export default function ToolsPage() {
  return (
    <Tabs defaultValue="recommended" className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-zinc-900">
            <Wrench className="h-5 w-5 text-orange-500" /> 工具与数据源
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            维护结果页推荐工具，以及验证工具的运行时配置（密钥 / 超时 / 调用上限 / 连接测试）。
          </p>
        </div>
      </div>

      <TabsList>
        <TabsTrigger value="recommended">推荐工具</TabsTrigger>
        <TabsTrigger value="verify">验证工具配置</TabsTrigger>
      </TabsList>

      <TabsContent value="recommended">
        <RecommendedToolsTab />
      </TabsContent>
      <TabsContent value="verify">
        <VerifyToolsTab />
      </TabsContent>
    </Tabs>
  );
}

/* ============ 标签 1: 推荐工具 (逻辑来自原 ToolsPage, 行为零侵入) ============ */

function RecommendedToolsTab() {
  const [items, setItems] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Tool | null>(null);

  const load = () => {
    setLoading(true);
    fetch("/api/admin/tools")
      .then((r) => r.json())
      .then((j) => setItems(j.items ?? []))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const onSave = async (data: any) => {
    await fetch("/api/admin/tools", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setOpen(false);
    setEditing(null);
    load();
  };
  const onDelete = async (id: number) => {
    if (!confirm("确认删除该工具？")) return;
    await fetch("/api/admin/tools", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="h-4 w-4" /> 新增工具
        </Button>
      </div>
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 p-12 text-zinc-400">
              <Loader2 className="h-5 w-5 animate-spin" /> 加载中…
            </div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {items.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium text-zinc-900">{t.name}</span>
                      <Badge tone="orange">{t.category}</Badge>
                      {t.enabled === 1 ? <Badge tone="green">启用</Badge> : <Badge tone="zinc">停用</Badge>}
                    </div>
                    <p className="mt-1 truncate text-sm text-zinc-500">{t.description}</p>
                    <a href={t.url} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-xs text-orange-600 hover:underline">
                      <ExternalLink className="h-3 w-3" /> {t.url}
                    </a>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(t); setOpen(true); }}>
                      <Pencil className="h-3.5 w-3.5" /> 编辑
                    </Button>
                    <Button size="sm" variant="ghost" className="text-red-500 hover:bg-red-50" onClick={() => onDelete(t.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ToolDialog open={open} editing={editing} onClose={() => setOpen(false)} onSave={onSave} />
    </div>
  );
}

function ToolDialog({
  open, editing, onClose, onSave,
}: {
  open: boolean; editing: Tool | null; onClose: () => void; onSave: (d: any) => void;
}) {
  const [f, setF] = useState<any>({});
  useEffect(() => {
    setF(
      editing
        ? { ...editing }
        : { name: "", description: "", url: "", category: "地图", applies_to: "", enabled: true },
    );
  }, [editing, open]);

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogHeader title={editing ? "编辑工具" : "新增工具"} />
      <DialogContent>
        <div className="space-y-4">
          <div>
            <Label>名称</Label>
            <Input value={f.name ?? ""} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </div>
          <div>
            <Label>链接</Label>
            <Input value={f.url ?? ""} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://..." />
          </div>
          <div>
            <Label>说明</Label>
            <Input value={f.description ?? ""} onChange={(e) => setF({ ...f, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>分类</Label>
              <Input value={f.category ?? ""} onChange={(e) => setF({ ...f, category: e.target.value })} />
            </div>
            <div>
              <Label>适用方法</Label>
              <Input value={f.applies_to ?? ""} onChange={(e) => setF({ ...f, applies_to: e.target.value })} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input type="checkbox" checked={f.enabled ?? true} onChange={(e) => setF({ ...f, enabled: e.target.checked })} className="h-4 w-4 rounded text-orange-500" />
            启用（在结果页推荐此工具）
          </label>
        </div>
      </DialogContent>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>取消</Button>
        <Button onClick={() => onSave(f)} disabled={!f.name || !f.url}>保存</Button>
      </DialogFooter>
    </Dialog>
  );
}

/* ============ 标签 2: 验证工具配置 (第 7 轮新增) ============ */

interface VerifyToolDoc {
  k: string;
  label: string;
  tool_type: string;
  enabled: boolean;
  cfg: Record<string, any>;
  has_key: boolean;
  masked_key: string;
  last_test_at: string | null;
  last_test_status: string | null;
  sort_order: number;
}

const KEY_FIELD_BY_TOOL: Record<string, { field: string; label: string }> = {
  amap_web: { field: "key_enc", label: "高德 Web 服务 Key" },
  amap_js: { field: "js_key", label: "高德 JS API Key (NEXT_PUBLIC_AMAP_JS_KEY)" },
  google_maps: { field: "key_enc", label: "Google Maps API Key" },
  baidu_map: { field: "key_enc", label: "百度地图 AK" },
  mapillary: { field: "key_enc", label: "Mapillary Access Token" },
};

function VerifyToolsTab() {
  const [items, setItems] = useState<VerifyToolDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<VerifyToolDoc | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testMsg, setTestMsg] = useState<Record<string, string>>({});

  const load = () => {
    setLoading(true);
    fetch("/api/admin/tools?section=verify")
      .then((r) => r.json())
      .then((j) => setItems(j.items ?? []))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const onTest = async (k: string) => {
    setTesting(k);
    setTestMsg((m) => ({ ...m, [k]: "" }));
    try {
      const r = await fetch(`/api/admin/tools?action=test&tool=${k}`, { method: "POST" });
      const j = await r.json().catch(() => null);
      setTestMsg((m) => ({
        ...m,
        [k]: j?.ok ? `✓ ${j.message}` : `× ${j?.message || j?.error || "测试失败"}`,
      }));
      load();
    } finally {
      setTesting(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 text-xs text-zinc-500">
          <div className="flex items-center gap-2 text-zinc-700">
            <KeyRound className="h-4 w-4 text-orange-500" />
            <span className="font-medium">使用与安全须知</span>
          </div>
          <ul className="mt-1.5 list-disc space-y-1 pl-5">
            <li>服务器端的 Key（高德 Web 服务、Overpass 等）只通过本页面写入数据库并加密存储，永不返回浏览器或日志。</li>
            <li>结果页地图只使用 <code className="rounded bg-zinc-100 px-1">NEXT_PUBLIC_AMAP_JS_KEY</code>，未配置时显示占位卡。</li>
            <li>未填 Key 的工具会被自动跳过 (不影响整体分析)。</li>
            <li>建议先点「测试连接」确认无误后再启用。</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 p-12 text-zinc-400">
              <Loader2 className="h-5 w-5 animate-spin" /> 加载中…
            </div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {items.map((t) => (
                <div key={t.k} className="grid grid-cols-1 gap-3 p-4 lg:grid-cols-[1.5fr_1fr_auto] lg:items-center">
                  {/* 列 1: 名称/类型/说明 */}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium text-zinc-900">{t.label}</span>
                      <Badge tone={t.tool_type === "map" ? "blue" : "orange"}>{t.tool_type === "map" ? "地图视觉化" : "验证器"}</Badge>
                      {t.enabled ? <Badge tone="green">启用</Badge> : <Badge tone="zinc">停用</Badge>}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{t.cfg?.description ?? ""}</p>
                  </div>
                  {/* 列 2: Key 状态 + 调用参数 + 测试结果 */}
                  <div className="space-y-1 text-xs text-zinc-500">
                    {KEY_FIELD_BY_TOOL[t.k] ? (
                      <div className="flex items-center gap-1.5">
                        <KeyRound className="h-3 w-3 text-zinc-400" />
                        <span>{KEY_FIELD_BY_TOOL[t.k].label}:</span>
                        {t.has_key ? (
                          <Badge tone="green"><CheckCircle2 className="h-3 w-3" /> {t.masked_key}</Badge>
                        ) : (
                          <Badge tone="zinc"><XCircle className="h-3 w-3" /> 未配置</Badge>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className="text-zinc-400">无需 Key (本地计算)</span>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                      {t.cfg?.timeout_ms != null && <span>超时: <b className="text-zinc-600">{(t.cfg.timeout_ms / 1000).toFixed(0)}s</b></span>}
                      {t.cfg?.max_calls_per_analysis != null && <span>每分析: <b className="text-zinc-600">{t.cfg.max_calls_per_analysis}</b></span>}
                      {t.cfg?.max_calls_per_candidate != null && <span>每候选: <b className="text-zinc-600">{t.cfg.max_calls_per_candidate}</b></span>}
                      {t.cfg?.default_radius_m != null && <span>默认半径: <b className="text-zinc-600">{t.cfg.default_radius_m}m</b></span>}
                      {t.cfg?.max_radius_m != null && <span>上限半径: <b className="text-zinc-600">{t.cfg.max_radius_m}m</b></span>}
                    </div>
                    {t.last_test_at && (
                      <div className="text-[11px]">
                        最近测试 {new Date(t.last_test_at.replace(" ", "T") + "Z").toLocaleString()}:
                        {" "}
                        <span className={t.last_test_status === "ok" ? "text-green-600" : "text-red-500"}>
                          {t.last_test_status === "ok" ? "通过" : "失败"}
                        </span>
                      </div>
                    )}
                    {testMsg[t.k] && (
                      <div className={`text-[11px] ${testMsg[t.k].startsWith("✓") ? "text-green-600" : "text-red-500"}`}>
                        {testMsg[t.k]}
                      </div>
                    )}
                  </div>
                  {/* 列 3: 操作 */}
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button size="sm" variant="ghost" onClick={() => onTest(t.k)} disabled={testing === t.k}>
                      {testing === t.k ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FlaskConical className="h-3.5 w-3.5" />} 测试
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(t)}>
                      <Pencil className="h-3.5 w-3.5" /> 编辑
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <VerifyToolDialog
        open={editing !== null}
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); load(); }}
      />
    </div>
  );
}

function VerifyToolDialog({
  open,
  editing,
  onClose,
  onSaved,
}: {
  open: boolean;
  editing: VerifyToolDoc | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [enabled, setEnabled] = useState(true);
  const [keyVal, setKeyVal] = useState("");
  const [timeoutMs, setTimeoutMs] = useState<number | "">("");
  const [maxPerAnalysis, setMaxPerAnalysis] = useState<number | "">("");
  const [maxPerCandidate, setMaxPerCandidate] = useState<number | "">("");
  const [defaultRadius, setDefaultRadius] = useState<number | "">("");
  const [maxRadius, setMaxRadius] = useState<number | "">("");
  const [endpoint, setEndpoint] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) return;
    setEnabled(editing.enabled);
    setKeyVal("");
    setTimeoutMs(editing.cfg?.timeout_ms ?? "");
    setMaxPerAnalysis(editing.cfg?.max_calls_per_analysis ?? "");
    setMaxPerCandidate(editing.cfg?.max_calls_per_candidate ?? "");
    setDefaultRadius(editing.cfg?.default_radius_m ?? "");
    setMaxRadius(editing.cfg?.max_radius_m ?? "");
    setEndpoint(editing.cfg?.endpoint ?? "");
  }, [editing, open]);

  const keyField = editing ? KEY_FIELD_BY_TOOL[editing.k] : undefined;

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    const cfg_patch: Record<string, any> = {};
    if (timeoutMs !== "" && timeoutMs !== editing.cfg?.timeout_ms) cfg_patch.timeout_ms = Number(timeoutMs);
    if (maxPerAnalysis !== "" && maxPerAnalysis !== editing.cfg?.max_calls_per_analysis) cfg_patch.max_calls_per_analysis = Number(maxPerAnalysis);
    if (maxPerCandidate !== "" && maxPerCandidate !== editing.cfg?.max_calls_per_candidate) cfg_patch.max_calls_per_candidate = Number(maxPerCandidate);
    if (defaultRadius !== "" && defaultRadius !== editing.cfg?.default_radius_m) cfg_patch.default_radius_m = Number(defaultRadius);
    if (maxRadius !== "" && maxRadius !== editing.cfg?.max_radius_m) cfg_patch.max_radius_m = Number(maxRadius);
    if (endpoint && endpoint !== editing.cfg?.endpoint) cfg_patch.endpoint = endpoint;

    const body: any = { k: editing.k, enabled, cfg_patch };
    if (keyField && keyVal.trim()) body.key_fields = { [keyField.field]: keyVal.trim() };
    try {
      const r = await fetch("/api/admin/tools?section=verify", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.ok) onSaved();
      else {
        const j = await r.json().catch(() => null);
        alert(j?.error || "保存失败");
      }
    } finally {
      setSaving(false);
    }
  };

  const clearKey = async () => {
    if (!editing || !keyField) return;
    if (!confirm(`确认清空 ${editing.label} 的 Key？`)) return;
    setSaving(true);
    try {
      await fetch("/api/admin/tools?section=verify", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ k: editing.k, clear_key_fields: [keyField.field] }),
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogHeader title={editing ? `编辑 ${editing.label}` : ""} />
      <DialogContent>
        {editing && (
          <div className="space-y-4">
            <label className="flex items-center justify-between gap-2 text-sm text-zinc-700">
              <span>启用此工具</span>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </label>

            {keyField && (
              <div>
                <Label>{keyField.label}<span className="ml-1 text-xs text-zinc-400">({editing.has_key ? `已配置 ${editing.masked_key}, 留空则不修改` : "尚未配置"})</span></Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="password"
                    value={keyVal}
                    onChange={(e) => setKeyVal(e.target.value)}
                    placeholder={editing.has_key ? editing.masked_key : "在此粘贴 Key..."}
                  />
                  {editing.has_key && (
                    <Button size="sm" variant="ghost" className="shrink-0 text-red-500 hover:bg-red-50" onClick={clearKey} disabled={saving}>
                      <Trash2 className="h-3.5 w-3.5" /> 清空
                    </Button>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>超时 (毫秒)</Label>
                <Input type="number" value={timeoutMs} onChange={(e) => setTimeoutMs(e.target.value === "" ? "" : Number(e.target.value))} placeholder="8000" />
              </div>
              <div>
                <Label>每次分析最大调用次数</Label>
                <Input type="number" value={maxPerAnalysis} onChange={(e) => setMaxPerAnalysis(e.target.value === "" ? "" : Number(e.target.value))} placeholder="6" />
              </div>
              <div>
                <Label>每个候选最大调用次数</Label>
                <Input type="number" value={maxPerCandidate} onChange={(e) => setMaxPerCandidate(e.target.value === "" ? "" : Number(e.target.value))} placeholder="3" />
              </div>
              <div>
                <Label>默认搜索半径 (米)</Label>
                <Input type="number" value={defaultRadius} onChange={(e) => setDefaultRadius(e.target.value === "" ? "" : Number(e.target.value))} placeholder="1000" />
              </div>
              <div>
                <Label>最大搜索半径 (米)</Label>
                <Input type="number" value={maxRadius} onChange={(e) => setMaxRadius(e.target.value === "" ? "" : Number(e.target.value))} placeholder="5000" />
              </div>
              {editing.k === "overpass" && (
                <div className="col-span-2">
                  <Label>Overpass API Endpoint</Label>
                  <Input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://overpass-api.de/api/interpreter" />
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>取消</Button>
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} 保存
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
