"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { AmapConfigCard } from "./_components/AmapConfigCard";
import {
  Activity,
  CheckCircle2,
  XCircle,
  Loader2,
  Cpu,
  BookOpen,
  KeyRound,
  Gauge,
  TrendingUp,
  ArrowRight,
} from "lucide-react";

interface Stats {
  total: number;
  success: number;
  failed: number;
  running: number;
  avgConfidence: number | null;
  totalTokens: number;
  skills: number;
  enabledSkills: number;
  apis: number;
  enabledApis: number;
  trend: { d: string; c: number }[];
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/admin/stats", { cache: "no-store" })
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
  }, []);

  const cards = stats
    ? [
        { label: "总分析数", value: stats.total, icon: Activity, tone: "orange" as const },
        { label: "成功", value: stats.success, icon: CheckCircle2, tone: "green" as const },
        { label: "失败", value: stats.failed, icon: XCircle, tone: "red" as const },
        { label: "进行中", value: stats.running, icon: Loader2, tone: "yellow" as const },
        {
          label: "平均置信度",
          value: stats.avgConfidence != null ? `${stats.avgConfidence}` : "—",
          icon: Gauge,
          tone: "blue" as const,
        },
        { label: "累计 Token", value: stats.totalTokens.toLocaleString(), icon: Cpu, tone: "purple" as const },
        {
          label: "方法库",
          value: `${stats.enabledSkills} / ${stats.skills}`,
          icon: BookOpen,
          tone: "orange" as const,
        },
        {
          label: "API 配置",
          value: `${stats.enabledApis} / ${stats.apis}`,
          icon: KeyRound,
          tone: "zinc" as const,
        },
      ]
    : [];

  const maxTrend = Math.max(1, ...(stats?.trend.map((t) => t.c) ?? [1]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-zinc-900">仪表盘</h1>
        <p className="mt-1 text-sm text-zinc-500">橙迹 OrangeTrace 后台总览。</p>
      </div>

      {!stats && (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 p-12 text-zinc-400">
            <Loader2 className="h-5 w-5 animate-spin" /> 加载中…
          </CardContent>
        </Card>
      )}

      {stats && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {cards.map((c) => (
              <Card key={c.label}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-zinc-500">{c.label}</span>
                    <c.icon className="h-4 w-4 text-orange-400" />
                  </div>
                  <p className="mt-1.5 text-2xl font-bold tabular-nums text-zinc-900">{c.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {/* 趋势 */}
            <Card className="lg:col-span-2">
              <CardContent className="p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-700">
                    <TrendingUp className="h-4 w-4 text-orange-500" /> 最近 14 天分析趋势
                  </h2>
                  <Link href="/admin/logs">
                    <Button variant="ghost" size="sm">
                      查看日志 <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                </div>
                <div className="flex h-44 items-end gap-1.5">
                  {stats.trend.length === 0 && (
                    <p className="m-auto text-sm text-zinc-400">暂无数据</p>
                  )}
                  {stats.trend.map((t) => (
                    <div key={t.d} className="flex flex-1 flex-col items-center gap-1">
                      <div
                        className="w-full rounded-t-md bg-gradient-to-t from-orange-400 to-orange-300 transition-all"
                        style={{ height: `${(t.c / maxTrend) * 100}%`, minHeight: t.c ? 4 : 0 }}
                        title={`${t.d}: ${t.c} 次`}
                      />
                      <span className="hidden text-[10px] text-zinc-400 sm:block">
                        {t.d.slice(5)}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* 快速入口 */}
            <Card>
              <CardContent className="space-y-2 p-5">
                <h2 className="mb-2 text-sm font-semibold text-zinc-700">快速入口</h2>
                <QuickLink href="/admin/apis" icon={KeyRound} label="配置多模态模型 API" desc="OpenAI / GLM / 通义 / 自定义" />
                <QuickLink href="/admin/skills" icon={BookOpen} label="上传/管理方法库" desc="HTML / Markdown 自动解析" />
                <QuickLink href="/admin/prompts" icon={Cpu} label="编辑 Prompt 模板" desc="系统 / 安全 / 输出格式" />
                <QuickLink href="/admin/tools" icon={Activity} label="工具与数据源" desc="推荐验证工具维护" />
              </CardContent>
            </Card>
          </div>

          {/* 高德地图 API 一键配置卡 */}
          <AmapConfigCard />

          {stats.enabledApis === 0 && (
            <Card className="border-amber-200 bg-amber-50/50">
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div className="flex items-center gap-2.5">
                  <Badge tone="yellow">提示</Badge>
                  <span className="text-sm text-amber-800">
                    尚未启用任何多模态模型 API，前台分析将无法执行。
                  </span>
                </div>
                <Link href="/admin/apis">
                  <Button size="sm" variant="outline">前往配置</Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function QuickLink({
  href,
  icon: Icon,
  label,
  desc,
}: {
  href: string;
  icon: any;
  label: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl border border-zinc-100 p-3 transition-colors hover:border-orange-200 hover:bg-orange-50/40"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-zinc-800">{label}</p>
        <p className="truncate text-xs text-zinc-500">{desc}</p>
      </div>
      <ArrowRight className="h-4 w-4 text-zinc-300" />
    </Link>
  );
}
