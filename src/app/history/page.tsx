"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Navbar, Footer } from "@/components/layout/Navbar";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge, ConfidenceBadge } from "@/components/ui/Badge";
import { timeAgo } from "@/lib/utils";
import { History as HistoryIcon, ScanLine, ArrowRight, MapPin, Loader2, Trash2 } from "lucide-react";

interface HistoryItem {
  id: string;
  created_at: string;
  status: string;
  filename: string;
  thumb_path?: string;
  model_name?: string;
  confidence?: number;
  place: string;
  error?: string;
}

export default function HistoryPage() {
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = () => {
    fetch("/api/history", { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 401) {
          setNeedLogin(true);
          setItems([]);
          return { items: [] };
        }
        return r.json();
      })
      .then((j) => setItems(j.items ?? []))
      .catch(() => setItems([]));
  };

  useEffect(load, []);

  const handleDelete = async (id: string) => {
    if (!confirm("确认删除这条分析记录? 此操作不可撤销.")) return;
    setDeleting(id);
    try {
      const r = await fetch(`/api/history?id=${id}`, { method: "DELETE" });
      if (r.ok) {
        load();
      } else {
        alert("删除失败, 请检查是否以管理员登录");
      }
    } catch {
      alert("网络错误");
    } finally {
      setDeleting(null);
    }
  };

  if (needLogin) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1">
          <div className="mx-auto max-w-md px-4 py-20 text-center">
            <h1 className="text-2xl font-bold text-zinc-900">需要管理员登录</h1>
            <p className="mt-2 text-sm text-zinc-500">
              历史记录含位置/图片指纹等隐私信息, 仅管理员可看.
            </p>
            <Link href="/admin/login?next=/history">
              <Button className="mt-6">前往登录</Button>
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-bold text-zinc-900 sm:text-3xl">
                <HistoryIcon className="h-7 w-7 text-orange-500" /> 历史记录
              </h1>
              <p className="mt-1.5 text-zinc-500">查看你上传过的图片分析结果。仅本机会话内可见。</p>
            </div>
            <Link href="/analyze">
              <Button size="sm">
                <ScanLine className="h-4 w-4" /> 新的分析
              </Button>
            </Link>
          </div>

          {!items && (
            <Card>
              <CardContent className="flex items-center justify-center gap-2 p-12 text-zinc-400">
                <Loader2 className="h-5 w-5 animate-spin" /> 加载中…
              </CardContent>
            </Card>
          )}

          {items && items.length === 0 && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center gap-3 p-16 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-orange-500">
                  <HistoryIcon className="h-7 w-7" />
                </div>
                <h3 className="text-lg font-semibold text-zinc-800">还没有分析记录</h3>
                <p className="text-sm text-zinc-500">上传一张图片开始你的第一次地理定位推理。</p>
                <Link href="/analyze">
                  <Button className="mt-2">
                    <ScanLine className="h-4 w-4" /> 立即上传
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}

          {items && items.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((it) => (
                <Card key={it.id} className="card-hover group relative h-full overflow-hidden">
                  <Link href={`/result/${it.id}`}>
                    <div className="relative aspect-[16/10] bg-zinc-100">
                      {it.thumb_path ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={it.thumb_path}
                          alt={it.filename}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-zinc-300">
                          <MapPin className="h-8 w-8" />
                        </div>
                      )}
                      <div className="absolute left-3 top-3">
                        <StatusBadge status={it.status} />
                      </div>
                    </div>
                  </Link>
                  {/* 删除按钮 */}
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      handleDelete(it.id);
                    }}
                    disabled={deleting === it.id}
                    className="absolute right-2 top-2 z-10 rounded-lg bg-white/90 p-1.5 text-zinc-400 shadow-sm transition-all hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                    title="删除此记录"
                  >
                    {deleting === it.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                  <Link href={`/result/${it.id}`}>
                    <CardContent className="p-4">
                      <p className="truncate font-medium text-zinc-800">{it.place || "未确定地点"}</p>
                      <p className="mt-0.5 truncate text-xs text-zinc-400">{it.filename}</p>
                      <div className="mt-3 flex items-center justify-between">
                        <ConfidenceBadge score={it.confidence} />
                        <span className="text-xs text-zinc-400">{timeAgo(it.created_at)}</span>
                      </div>
                      <div className="mt-3 flex items-center justify-end text-xs font-medium text-orange-600">
                        查看报告 <ArrowRight className="ml-1 h-3.5 w-3.5" />
                      </div>
                    </CardContent>
                  </Link>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "success") return <Badge tone="green">完成</Badge>;
  if (status === "failed") return <Badge tone="red">失败</Badge>;
  if (status === "running") return <Badge tone="yellow">运行中</Badge>;
  return <Badge tone="zinc">等待</Badge>;
}
