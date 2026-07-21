"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea, Select } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/Dialog";
import {
  BookOpen,
  Upload,
  Pencil,
  Trash2,
  Plus,
  Loader2,
  FileUp,
  Sparkles,
} from "lucide-react";

interface Skill {
  id: number;
  name: string;
  description: string;
  scenario: string;
  key_clues: string;
  recommended_tools: string;
  caveats: string;
  category: string;
  priority: number;
  enabled: number;
  version: string;
  source?: string | null;
}

export default function SkillsPage() {
  const [items, setItems] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Skill | null>(null);
  const [filter, setFilter] = useState("");
  const [uploadInfo, setUploadInfo] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => {
    setLoading(true);
    fetch("/api/admin/skills")
      .then((r) => r.json())
      .then((j) => setItems(j.items ?? []))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const onSave = async (data: any) => {
    await fetch("/api/admin/skills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setOpen(false);
    setEditing(null);
    load();
  };

  const onDelete = async (id: number) => {
    if (!confirm("确认删除该条方法？")) return;
    await fetch("/api/admin/skills", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  };

  const toggleEnabled = async (s: Skill) => {
    await fetch("/api/admin/skills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...s, enabled: s.enabled !== 1 }),
    });
    load();
  };

  const onUpload = async (file: File) => {
    setUploading(true);
    setUploadInfo(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/admin/skills", { method: "PUT", body: fd });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        setUploadInfo(`解析失败: ${data.error || r.statusText}`);
      } else {
        setUploadInfo(`成功解析《${data.title}》→ 新增 ${data.created} 条方法`);
        load();
      }
    } catch (e) {
      setUploadInfo(`上传失败: ${(e as Error).message}`);
    }
    setUploading(false);
  };

  const filtered = items.filter(
    (s) =>
      !filter ||
      s.name.includes(filter) ||
      s.category.includes(filter) ||
      s.description.includes(filter),
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-zinc-900">
            <BookOpen className="h-5 w-5 text-orange-500" /> 方法库 / SKILL
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            上传 HTML / Markdown 方法论文件，自动解析为结构化知识库，作为模型分析的上下文。
          </p>
        </div>
        <div className="flex gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".html,.htm,.md,.markdown,.txt"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f);
              e.target.value = "";
            }}
          />
          <Button
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
            上传方法文件
          </Button>
          <Button onClick={() => { setEditing(null); setOpen(true); }}>
            <Plus className="h-4 w-4" /> 新增方法
          </Button>
        </div>
      </div>

      {uploadInfo && (
        <Card className="border-orange-200 bg-orange-50/40">
          <CardContent className="flex items-center gap-2 p-3 text-sm text-orange-700">
            <Sparkles className="h-4 w-4" /> {uploadInfo}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-3">
          <Input
            placeholder="搜索方法名 / 分类 / 描述…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 p-12 text-zinc-400">
              <Loader2 className="h-5 w-5 animate-spin" /> 加载中…
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-zinc-500">
              暂无方法。点「上传方法文件」批量导入，或「新增方法」手动添加。
            </div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {filtered.map((s) => (
                <div key={s.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium text-zinc-900">{s.name}</span>
                      <Badge tone="orange">{s.category}</Badge>
                      <Badge tone="zinc">优先级 {s.priority}</Badge>
                      <Badge tone="zinc">{s.version}</Badge>
                      {s.source && <Badge tone="blue">{s.source}</Badge>}
                      <button
                        onClick={() => toggleEnabled(s)}
                        className={`rounded-full px-2 py-0.5 text-xs ${s.enabled === 1 ? "bg-green-50 text-green-600" : "bg-zinc-100 text-zinc-400"}`}
                      >
                        {s.enabled === 1 ? "● 已启用" : "○ 已停用"}
                      </button>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-zinc-600">{s.description}</p>
                    {(s.key_clues || s.recommended_tools) && (
                      <p className="mt-1 line-clamp-1 text-xs text-zinc-400">
                        {s.key_clues && <>线索: {s.key_clues.replace(/\n/g, " / ")} </>}
                        {s.recommended_tools && <>· 工具: {s.recommended_tools.replace(/\n/g, " / ")}</>}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(s); setOpen(true); }}>
                      <Pencil className="h-3.5 w-3.5" /> 编辑
                    </Button>
                    <Button size="sm" variant="ghost" className="text-red-500 hover:bg-red-50" onClick={() => onDelete(s.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <SkillDialog open={open} editing={editing} onClose={() => setOpen(false)} onSave={onSave} />
    </div>
  );
}

function SkillDialog({
  open,
  editing,
  onClose,
  onSave,
}: {
  open: boolean;
  editing: Skill | null;
  onClose: () => void;
  onSave: (data: any) => void;
}) {
  const [f, setF] = useState<any>({});

  useEffect(() => {
    setF(
      editing
        ? { ...editing }
        : {
            name: "", description: "", scenario: "", key_clues: "",
            recommended_tools: "", caveats: "", category: "自定义",
            priority: 50, enabled: true, version: "v1",
          },
    );
  }, [editing, open]);

  return (
    <Dialog open={open} onClose={onClose} className="max-w-2xl">
      <DialogHeader title={editing ? "编辑方法" : "新增方法"} />
      <DialogContent>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>方法名称</Label>
            <Input value={f.name ?? ""} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </div>
          <div>
            <Label>分类</Label>
            <Input value={f.category ?? ""} onChange={(e) => setF({ ...f, category: e.target.value })} />
          </div>
          <div>
            <Label>优先级</Label>
            <Input type="number" value={f.priority ?? 50} onChange={(e) => setF({ ...f, priority: Number(e.target.value) })} />
          </div>
          <div className="sm:col-span-2">
            <Label>说明</Label>
            <Textarea rows={2} value={f.description ?? ""} onChange={(e) => setF({ ...f, description: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Label>适用场景</Label>
            <Input value={f.scenario ?? ""} onChange={(e) => setF({ ...f, scenario: e.target.value })} />
          </div>
          <div>
            <Label>关键线索 (每行一条)</Label>
            <Textarea rows={3} value={f.key_clues ?? ""} onChange={(e) => setF({ ...f, key_clues: e.target.value })} />
          </div>
          <div>
            <Label>推荐工具 (每行一条)</Label>
            <Textarea rows={3} value={f.recommended_tools ?? ""} onChange={(e) => setF({ ...f, recommended_tools: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Label>注意事项</Label>
            <Textarea rows={2} value={f.caveats ?? ""} onChange={(e) => setF({ ...f, caveats: e.target.value })} />
          </div>
          <div>
            <Label>版本</Label>
            <Input value={f.version ?? "v1"} onChange={(e) => setF({ ...f, version: e.target.value })} />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input type="checkbox" checked={f.enabled ?? true} onChange={(e) => setF({ ...f, enabled: e.target.checked })} className="h-4 w-4 rounded text-orange-500" />
              启用
            </label>
          </div>
        </div>
      </DialogContent>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>取消</Button>
        <Button onClick={() => onSave(f)} disabled={!f.name}>保存</Button>
      </DialogFooter>
    </Dialog>
  );
}
