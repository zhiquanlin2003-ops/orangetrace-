"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge, ConfidenceBadge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Input";
import { formatDateTime } from "@/lib/utils";
import { ScrollText, Loader2, Eye, ExternalLink, Clock, Cpu, Hash } from "lucide-react";

interface LogItem {
  id: string;
  created_at: string;
  status: string;
  filename: string;
  thumb_path?: string;
  options: any;
  exif_summary?: any;
  model_name?: string;
  api_id?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  duration_ms?: number;
  confidence?: number;
  error?: string;
  result: any;
}

export default function LogsPage() {
  const [items, setItems] = useState<LogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [active, setActive] = useState<LogItem | null>(null);

  const load = (s?: string) => {
    setLoading(true);
    const q = s ? `?status=${s}` : "";
    fetch(`/api/admin/logs${q}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setItems(j.items ?? []))
      .finally(() => setLoading(false));
  };
  useEffect(() => load(), []);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-zinc-900">
            <ScrollText className="h-5 w-5 text-orange-500" /> 分析日志
          </h1>
          <p className="mt-1 text-sm text-zinc-500">记录每次分析的上传、模型、Token、结果与错误。</p>
        </div>
        <div className="w-44">
          <Select value={status} onChange={(e) => { setStatus(e.target.value); load(e.target.value); }}>
            <option value="">全部状态</option>
            <option value="success">成功</option>
            <option value="failed">失败</option>
            <option value="running">运行中</option>
            <option value="pending">等待</option>
          </Select>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 p-12 text-zinc-400">
              <Loader2 className="h-5 w-5 animate-spin" /> 加载中…
            </div>
          ) : items.length === 0 ? (
            <div className="p-12 text-center text-sm text-zinc-500">暂无日志</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-zinc-100 bg-zinc-50/60 text-xs text-zinc-500">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium">时间</th>
                    <th className="px-4 py-2.5 text-left font-medium">文件</th>
                    <th className="px-4 py-2.5 text-left font-medium">状态</th>
                    <th className="px-4 py-2.5 text-left font-medium">模型</th>
                    <th className="px-4 py-2.5 text-left font-medium">置信度</th>
                    <th className="px-4 py-2.5 text-left font-medium">Token</th>
                    <th className="px-4 py-2.5 text-left font-medium">耗时</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {items.map((it) => (
                    <tr key={it.id} className="hover:bg-orange-50/30">
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-zinc-500">
                        {formatDateTime(it.created_at)}
                      </td>
                      <td className="max-w-[180px] truncate px-4 py-3 text-zinc-700">{it.filename}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={it.status} />
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-500">{it.model_name || "—"}</td>
                      <td className="px-4 py-3">{it.confidence != null ? <ConfidenceBadge score={it.confidence} /> : <span className="text-xs text-zinc-400">—</span>}</td>
                      <td className="px-4 py-3 text-xs tabular-nums text-zinc-500">{it.total_tokens ?? "—"}</td>
                      <td className="px-4 py-3 text-xs text-zinc-500">{it.duration_ms != null ? `${(it.duration_ms / 1000).toFixed(1)}s` : "—"}</td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="ghost" onClick={() => setActive(it)}>
                          <Eye className="h-3.5 w-3.5" /> 详情
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm" onClick={() => setActive(null)} />
          <Card className="relative z-10 max-h-[85vh] w-full max-w-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-3">
              <h3 className="font-semibold text-zinc-900">分析详情 · {active.id}</h3>
              <div className="flex gap-2">
                <Link href={`/result/${active.id}`}>
                  <Button size="sm" variant="ghost">
                    <ExternalLink className="h-3.5 w-3.5" /> 结果页
                  </Button>
                </Link>
                <Button size="sm" variant="ghost" onClick={() => setActive(null)}>关闭</Button>
              </div>
            </div>
            <div className="max-h-[70vh] overflow-y-auto p-5">
              <DetailRow label="文件名" value={active.filename} />
              <DetailRow label="时间" value={formatDateTime(active.created_at)} icon={Clock} />
              <DetailRow label="状态" value={active.status} />
              <DetailRow label="模型" value={active.model_name || "—"} icon={Cpu} />
              <DetailRow
                label="Token"
                value={
                  active.total_tokens != null
                    ? `${active.total_tokens} (prompt ${active.prompt_tokens ?? 0} / completion ${active.completion_tokens ?? 0})`
                    : "—"
                }
                icon={Hash}
              />
              <DetailRow label="耗时" value={active.duration_ms != null ? `${(active.duration_ms / 1000).toFixed(1)}s` : "—"} icon={Clock} />
              <DetailRow label="置信度" value={active.confidence != null ? `${active.confidence}` : "—"} />

              <div className="mt-4">
                <p className="mb-1 text-xs font-medium text-zinc-500">用户补充信息</p>
                <pre className="overflow-x-auto rounded-lg bg-zinc-50 p-3 text-xs text-zinc-600">{JSON.stringify(active.options, null, 2)}</pre>
              </div>

              {active.exif_summary && (
                <div className="mt-3">
                  <p className="mb-1 text-xs font-medium text-zinc-500">EXIF 摘要</p>
                  <pre className="overflow-x-auto rounded-lg bg-zinc-50 p-3 text-xs text-zinc-600">{JSON.stringify(active.exif_summary, null, 2)}</pre>
                </div>
              )}

              {active.error && (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50/60 p-3 text-sm text-red-700">
                  <p className="font-medium">错误信息</p>
                  <p className="mt-1 text-red-600">{active.error}</p>
                </div>
              )}

              {active.result && (
                <div className="mt-3">
                  <p className="mb-1 text-xs font-medium text-zinc-500">模型返回结果</p>
                  <pre className="max-h-64 overflow-auto rounded-lg bg-zinc-50 p-3 text-xs text-zinc-600">{JSON.stringify(active.result, null, 2)}</pre>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value, icon: Icon }: { label: string; value: string; icon?: any }) {
  return (
    <div className="flex items-center gap-2 border-b border-zinc-50 py-2 text-sm">
      <span className="w-24 shrink-0 text-xs text-zinc-400">{label}</span>
      {Icon && <Icon className="h-3.5 w-3.5 text-zinc-300" />}
      <span className="text-zinc-700">{value}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "success") return <Badge tone="green">成功</Badge>;
  if (status === "failed") return <Badge tone="red">失败</Badge>;
  if (status === "running") return <Badge tone="yellow">运行中</Badge>;
  return <Badge tone="zinc">等待</Badge>;
}
