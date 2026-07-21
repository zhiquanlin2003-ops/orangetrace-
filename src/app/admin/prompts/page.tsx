"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Loader2, Save, RotateCcw, MessageSquareCode, CheckCircle2 } from "lucide-react";
import type { PromptKey, PromptTemplate } from "@/lib/types";

export default function PromptsPage() {
  const [items, setItems] = useState<PromptTemplate[]>([]);
  const [active, setActive] = useState<PromptKey>("system");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/admin/prompts")
      .then((r) => r.json())
      .then((j) => {
        setItems(j.items ?? []);
        const cur = (j.items as PromptTemplate[]).find((p) => p.key === active);
        setDraft(cur?.content ?? "");
      })
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const current = items.find((p) => p.key === active);
  useEffect(() => {
    setDraft(current?.content ?? "");
    setSaved(false);
  }, [active, current?.content]);

  const save = async () => {
    setSaving(true);
    await fetch("/api/admin/prompts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: active, content: draft }),
    });
    setSaving(false);
    setSaved(true);
    // 刷新列表
    const r = await fetch("/api/admin/prompts");
    const j = await r.json();
    setItems(j.items ?? []);
    setTimeout(() => setSaved(false), 2000);
  };

  const reset = async () => {
    if (!confirm("恢复该模板到默认值？当前修改将丢失。")) return;
    const r = await fetch("/api/admin/prompts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: active }),
    });
    const data = await r.json();
    if (data.ok) {
      setDraft(data.content);
      const r2 = await fetch("/api/admin/prompts");
      const j2 = await r2.json();
      setItems(j2.items ?? []);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 p-12 text-zinc-400">
        <Loader2 className="h-5 w-5 animate-spin" /> 加载中…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-zinc-900">
          <MessageSquareCode className="h-5 w-5 text-orange-500" /> Prompt 模板
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          编辑模型分析的提示词模板。这些内容会与方法库一起，作为系统提示词提供给多模态模型。
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
        {/* 列表 */}
        <Card className="h-fit">
          <CardContent className="space-y-1 p-2">
            {items.map((p) => (
              <button
                key={p.key}
                onClick={() => setActive(p.key)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  active === p.key
                    ? "bg-orange-50 text-orange-700"
                    : "text-zinc-600 hover:bg-zinc-100"
                }`}
              >
                <span className="font-medium">{p.label}</span>
              </button>
            ))}
          </CardContent>
        </Card>

        {/* 编辑器 */}
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-3">
              <div className="flex items-center gap-2">
                <span className="font-medium text-zinc-800">{current?.label}</span>
                <Badge tone="orange">{current?.key}</Badge>
                {saved && (
                  <span className="flex items-center gap-1 text-xs text-green-600">
                    <CheckCircle2 className="h-3.5 w-3.5" /> 已保存
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={reset}>
                  <RotateCcw className="h-3.5 w-3.5" /> 恢复默认
                </Button>
                <Button size="sm" onClick={save} disabled={saving}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  保存
                </Button>
              </div>
            </div>
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={22}
              className="rounded-none border-0 font-mono text-[13px] leading-relaxed shadow-none focus-visible:ring-0"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
