"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
} from "@/components/ui/Dialog";
import {
  KeyRound,
  Plus,
  Pencil,
  Trash2,
  Star,
  Plug,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";

interface ApiItem {
  id: number;
  name: string;
  provider: string;
  base_url: string;
  api_key_masked: string;
  has_key: boolean;
  model: string;
  enabled: number;
  is_default: number;
  max_tokens: number;
  temperature: number;
  timeout: number;
}

const PROVIDERS = [
  { id: "openai", label: "OpenAI", base: "https://api.openai.com/v1" },
  { id: "glm", label: "智谱 GLM", base: "https://open.bigmodel.cn/api/paas/v4" },
  { id: "qwen", label: "通义千问 (DashScope)", base: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
  { id: "claude", label: "Claude (兼容端点)", base: "https://api.anthropic.com/v1" },
  { id: "gemini", label: "Gemini (OpenAI 兼容)", base: "https://generativelanguage.googleapis.com/v1beta/openai" },
  { id: "custom", label: "自定义 OpenAI 兼容", base: "" },
];

export default function ApisPage() {
  const [items, setItems] = useState<ApiItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ApiItem | null>(null);
  const [testing, setTesting] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<Record<number, { ok: boolean; msg: string } | undefined>>({});

  const load = () => {
    setLoading(true);
    fetch("/api/admin/apis")
      .then((r) => r.json())
      .then((j) => setItems(j.items ?? []))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const onSave = async (data: any) => {
    await fetch("/api/admin/apis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setOpen(false);
    setEditing(null);
    load();
  };

  const onDelete = async (id: number) => {
    if (!confirm("确认删除该 API 配置？")) return;
    await fetch("/api/admin/apis", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  };

  const onSetDefault = async (id: number) => {
    // 把当前设为默认 (后端会清除其它默认)
    const it = items.find((x) => x.id === id);
    if (!it) return;
    await fetch("/api/admin/apis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name: it.name, is_default: true, enabled: true }),
    });
    load();
  };

  const onTest = async (id: number) => {
    setTesting(id);
    setTestResult((p) => ({ ...p, [id]: undefined }));
    try {
      const r = await fetch("/api/admin/apis", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await r.json();
      setTestResult((p) => ({
        ...p,
        [id]: { ok: data.ok, msg: data.ok ? "连接成功" : data.error || "连接失败" },
      }));
    } catch (e) {
      setTestResult((p) => ({ ...p, [id]: { ok: false, msg: (e as Error).message } }));
    }
    setTesting(null);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-zinc-900">
            <KeyRound className="h-5 w-5 text-orange-500" /> API 配置管理
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            支持配置多个多模态大模型 API，前台分析时调用『默认』启用的模型。
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="h-4 w-4" /> 新增配置
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 p-12 text-zinc-400">
              <Loader2 className="h-5 w-5 animate-spin" /> 加载中…
            </div>
          ) : items.length === 0 ? (
            <div className="p-12 text-center">
              <KeyRound className="mx-auto h-10 w-10 text-zinc-300" />
              <p className="mt-3 font-medium text-zinc-700">还没有任何 API 配置</p>
              <p className="text-sm text-zinc-500">添加一个多模态模型 API 即可启用前台分析。</p>
              <Button className="mt-4" onClick={() => { setEditing(null); setOpen(true); }}>
                <Plus className="h-4 w-4" /> 新增配置
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {items.map((it) => {
                const tr = testResult[it.id];
                return (
                  <div key={it.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-zinc-900">{it.name}</span>
                        {it.is_default === 1 && <Badge tone="orange"><Star className="h-3 w-3" /> 默认</Badge>}
                        {it.enabled === 1 ? <Badge tone="green">启用</Badge> : <Badge tone="zinc">停用</Badge>}
                        <Badge tone="zinc">{PROVIDERS.find((p) => p.id === it.provider)?.label ?? it.provider}</Badge>
                      </div>
                      <p className="mt-1 truncate font-mono text-xs text-zinc-500">
                        {it.base_url || "—"} · 模型 {it.model || "—"} · key {it.api_key_masked}
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-400">
                        max_tokens {it.max_tokens} · temp {it.temperature} · timeout {it.timeout}s
                      </p>
                      {tr && (
                        <p className={`mt-1 flex items-center gap-1 text-xs ${tr.ok ? "text-green-600" : "text-red-500"}`}>
                          {tr.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                          {tr.msg}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                      {it.is_default !== 1 && it.enabled === 1 && (
                        <Button size="sm" variant="outline" onClick={() => onSetDefault(it.id)}>
                          <Star className="h-3.5 w-3.5" /> 设为默认
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => onTest(it.id)} disabled={testing === it.id}>
                        {testing === it.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />}
                        测试
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(it); setOpen(true); }}>
                        <Pencil className="h-3.5 w-3.5" /> 编辑
                      </Button>
                      <Button size="sm" variant="ghost" className="text-red-500 hover:bg-red-50" onClick={() => onDelete(it.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <ApiDialog open={open} editing={editing} onClose={() => setOpen(false)} onSave={onSave} />

      <Card className="bg-zinc-50/60">
        <CardContent className="p-4 text-xs text-zinc-500">
          <p className="font-medium text-zinc-600">关于 API Key 安全</p>
          <p className="mt-1">
            所有 API Key 在入库前均经过 AES-256-GCM 加密，前端只展示掩码（如 <code>sk-••••abcd</code>），
            不会被明文暴露到浏览器。调用时由后端解密后直连模型服务。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function ApiDialog({
  open,
  editing,
  onClose,
  onSave,
}: {
  open: boolean;
  editing: ApiItem | null;
  onClose: () => void;
  onSave: (data: any) => void;
}) {
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("custom");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [isDefault, setIsDefault] = useState(false);
  const [maxTokens, setMaxTokens] = useState(4096);
  const [temperature, setTemperature] = useState(0.2);
  const [timeout, setTimeout] = useState(120);

  useEffect(() => {
    if (editing) {
      setName(editing.name);
      setProvider(editing.provider);
      setBaseUrl(editing.base_url);
      setApiKey("");
      setModel(editing.model);
      setEnabled(editing.enabled === 1);
      setIsDefault(editing.is_default === 1);
      setMaxTokens(editing.max_tokens);
      setTemperature(editing.temperature);
      setTimeout(editing.timeout);
    } else {
      setName(""); setProvider("custom"); setBaseUrl(""); setApiKey(""); setModel("");
      setEnabled(true); setIsDefault(false); setMaxTokens(4096); setTemperature(0.2); setTimeout(120);
    }
  }, [editing, open]);

  const onSelectProvider = (id: string) => {
    setProvider(id);
    const p = PROVIDERS.find((x) => x.id === id);
    if (p && !baseUrl) setBaseUrl(p.base);
    if (p?.id === "openai") { if (!model) setModel("gpt-4o"); }
    if (p?.id === "glm") { if (!model) setModel("glm-4v"); }
    if (p?.id === "qwen") { if (!model) setModel("qwen-vl-max"); }
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogHeader title={editing ? "编辑 API 配置" : "新增 API 配置"} />
      <DialogContent>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>名称</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：主力 GLM-4V" />
          </div>
          <div>
            <Label>提供商</Label>
            <Select value={provider} onChange={(e) => onSelectProvider(e.target.value)}>
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>模型名称</Label>
            <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="gpt-4o / glm-4v / qwen-vl-max" />
          </div>
          <div className="sm:col-span-2">
            <Label>Base URL</Label>
            <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.openai.com/v1" />
          </div>
          <div className="sm:col-span-2">
            <Label>API Key{editing ? "（留空则不修改）" : ""}</Label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={editing ? editing.api_key_masked : "sk-..."}
            />
          </div>
          <div>
            <Label>Max Tokens</Label>
            <Input type="number" value={maxTokens} onChange={(e) => setMaxTokens(Number(e.target.value))} />
          </div>
          <div>
            <Label>Temperature</Label>
            <Input type="number" step="0.1" min="0" max="2" value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} />
          </div>
          <div>
            <Label>Timeout (秒)</Label>
            <Input type="number" value={timeout} onChange={(e) => setTimeout(Number(e.target.value))} />
          </div>
          <div className="flex items-end gap-4">
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4 rounded text-orange-500" />
              启用
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="h-4 w-4 rounded text-orange-500" />
              设为默认
            </label>
          </div>
        </div>
      </DialogContent>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>取消</Button>
        <Button
          onClick={() => onSave({
            id: editing?.id, name, provider, base_url: baseUrl,
            api_key: apiKey || undefined, model, enabled, is_default: isDefault,
            max_tokens: maxTokens, temperature, timeout,
          })}
          disabled={!name || !model || (!apiKey && !editing)}
        >
          保存
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
