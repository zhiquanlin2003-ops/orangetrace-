"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Logo } from "@/components/widgets/Logo";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  KeyRound,
  BookOpen,
  MessageSquareCode,
  Wrench,
  ScrollText,
  Home,
  LogOut,
  Settings,
} from "lucide-react";

const NAV = [
  { href: "/admin", label: "仪表盘", icon: LayoutDashboard, exact: true },
  { href: "/admin/apis", label: "API 配置", icon: KeyRound },
  { href: "/admin/skills", label: "方法库 / SKILL", icon: BookOpen },
  { href: "/admin/prompts", label: "Prompt 模板", icon: MessageSquareCode },
  { href: "/admin/tools", label: "工具与数据源", icon: Wrench },
  { href: "/admin/logs", label: "分析日志", icon: ScrollText },
  { href: "/admin/settings", label: "站点设置", icon: Settings },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const logout = async () => {
    await fetch("/api/admin/auth", { method: "DELETE" });
    router.push("/admin/login");
    router.refresh();
  };

  // 登录页不套侧边栏外壳
  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen bg-zinc-50">
      {/* 侧边栏 */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-zinc-200 bg-white lg:flex">
        <div className="flex h-16 items-center border-b border-zinc-100 px-5">
          <Logo size={26} />
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV.map((n) => {
            const active = n.exact ? pathname === n.href : pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-orange-50 text-orange-700"
                    : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
                )}
              >
                <n.icon className="h-4 w-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-zinc-100 p-3">
          <Link
            href="/"
            className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
          >
            <Home className="h-4 w-4" /> 回到前台
          </Link>
          <button
            onClick={logout}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-red-500 hover:bg-red-50"
          >
            <LogOut className="h-4 w-4" /> 退出登录
          </button>
        </div>
      </aside>

      {/* 移动端顶栏 */}
      <div className="flex flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-zinc-200 bg-white/90 px-4 backdrop-blur lg:px-8">
          <div className="flex items-center gap-2 lg:hidden">
            <Logo size={24} />
          </div>
          <span className="hidden text-sm font-medium text-zinc-500 lg:block">
            橙迹 OrangeTrace · 管理后台
          </span>
          <button
            onClick={logout}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-red-500 hover:bg-red-50"
          >
            <LogOut className="h-4 w-4" /> 退出
          </button>
        </header>

        {/* 移动端横向导航 */}
        <div className="border-b border-zinc-200 bg-white lg:hidden">
          <nav className="flex gap-1 overflow-x-auto px-3 py-2">
            {NAV.map((n) => {
              const active = n.exact ? pathname === n.href : pathname.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={cn(
                    "shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium",
                    active ? "bg-orange-50 text-orange-700" : "text-zinc-600",
                  )}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <main className="flex-1 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
