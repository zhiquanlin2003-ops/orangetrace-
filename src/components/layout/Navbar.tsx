import Link from "next/link";
import { Brand } from "@/components/widgets/Logo";
import { Button } from "@/components/ui/Button";
import { ScanLine } from "lucide-react";

export function Navbar() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-zinc-200/70 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center">
          <Brand />
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          {/* 历史记录只对管理员开放, 入口从公共 Navbar 移除避免暴露 */}
          <Link href="/privacy" className="hidden sm:inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition-colors">
            隐私与安全
          </Link>
          <Link href="/analyze">
            <Button size="sm">
              <ScanLine className="h-4 w-4" />
              开始分析
            </Button>
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="mt-24 border-t border-zinc-200/70 bg-zinc-50/60">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-3 px-4 py-8 text-center sm:px-6 lg:px-8">
        <Brand size={26} />
        <p className="max-w-xl text-xs text-zinc-500">
          橙迹 OrangeTrace 是一个 AI 图片地理定位推理工具，结果仅供研究与学习，不保证准确。
          请勿用于人肉搜索、跟踪、骚扰或侵犯隐私。请只上传你有权分析的图片。
        </p>
        <div className="flex gap-4 text-xs text-zinc-500">
          <Link href="/" className="hover:text-orange-600">首页</Link>
          <Link href="/analyze" className="hover:text-orange-600">分析</Link>
          <Link href="/privacy" className="hover:text-orange-600">隐私</Link>
          <Link href="/admin" className="hover:text-orange-600">管理后台</Link>
        </div>
        <p className="text-[11px] text-zinc-400">
          © {new Date().getFullYear()} OrangeTrace · 用一张图片，寻找世界的线索
        </p>
      </div>
    </footer>
  );
}
