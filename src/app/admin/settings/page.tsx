"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Progress";
import { Settings, Loader2, Save, CheckCircle2, Trash2 } from "lucide-react";

export default function SettingsPage() {
  const [saveOriginal, setSaveOriginal] = useState(true);
  const [autoDeleteHours, setAutoDeleteHours] = useState(24);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((d) => {
        setSaveOriginal(d.save_original_image === 1);
        setAutoDeleteHours(d.auto_delete_hours ?? 24);
      })
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        save_original_image: saveOriginal,
        auto_delete_hours: autoDeleteHours,
      }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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
          <Settings className="h-5 w-5 text-orange-500" /> 站点设置
        </h1>
        <p className="mt-1 text-sm text-zinc-500">控制原图保留与自动删除策略。</p>
      </div>

      <Card>
        <CardContent className="space-y-5 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4 rounded-xl border border-zinc-100 p-4">
            <div>
              <p className="font-medium text-zinc-800">保存原图</p>
              <p className="mt-0.5 text-sm text-zinc-500">
                关闭后，每次分析完成会立即删除上传的原始图片（仅保留缩略图）。默认建议关闭以增强隐私。
              </p>
            </div>
            <Switch checked={saveOriginal} onCheckedChange={setSaveOriginal} />
          </div>

          <div className="rounded-xl border border-zinc-100 p-4">
            <Label htmlFor="h">原图自动删除时长（小时）</Label>
            <div className="flex items-center gap-3">
              <Input
                id="h"
                type="number"
                min={0}
                max={720}
                value={autoDeleteHours}
                onChange={(e) => setAutoDeleteHours(Number(e.target.value))}
                className="w-40"
              />
              <span className="text-sm text-zinc-400">
                设为 0 表示不自动删除（不推荐）
              </span>
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-zinc-400">
              <Trash2 className="h-3.5 w-3.5" />
              该策略由后台定时任务执行；当前 MVP 版本需要手动清理或重启时清理。
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              保存设置
            </Button>
            {saved && (
              <span className="flex items-center gap-1 text-sm text-green-600">
                <CheckCircle2 className="h-4 w-4" /> 已保存
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
