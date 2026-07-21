import Link from "next/link";
import { Navbar, Footer } from "@/components/layout/Navbar";
import { MapBackdrop } from "@/components/widgets/MapBackdrop";
import { Logo } from "@/components/widgets/Logo";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  ScanLine,
  FileText,
  Image as ImageIcon,
  Car,
  Mountain,
  Sun,
  Map,
  Sparkles,
  Tag,
  ArrowRight,
  ShieldCheck,
  Clock,
} from "lucide-react";

const CAPABILITIES = [
  {
    icon: FileText,
    title: "文字信息识别",
    desc: "招牌、路牌、电话、门牌、车牌等 OCR 提取与翻译推断。",
  },
  {
    icon: ImageIcon,
    title: "图片反搜思路",
    desc: "地标、建筑外形、局部特征比对与相似图匹配思路。",
  },
  {
    icon: Car,
    title: "基础设施分析",
    desc: "道路标线、路灯、公交、铁路、车牌样式与建筑风格。",
  },
  {
    icon: Mountain,
    title: "自然地理分析",
    desc: "山脉、植被、光影、水体、土壤与气候带的特征识别。",
  },
  {
    icon: Sun,
    title: "几何与光影推理",
    desc: "依据太阳方位、影长反推拍摄时间与纬度区间。",
  },
  {
    icon: Map,
    title: "地图与 POI 筛查",
    desc: "用可见线索在地图上逐步缩小到城市 / 街道范围。",
  },
  {
    icon: Sparkles,
    title: "AI 多模态推理",
    desc: "由大模型综合图片细节进行可解释的逐步推理。",
  },
  {
    icon: Tag,
    title: "EXIF 元数据分析",
    desc: "若图片含 GPS / 时间 / 设备等元数据，优先可靠提取。",
  },
];

const STEPS = [
  { n: "01", title: "上传图片", desc: "拖拽或选择一张图片, 可选填补充信息。" },
  { n: "02", title: "AI 侦查线索", desc: "逐项识别文字、建筑、道路、自然环境与光影。" },
  { n: "03", title: "候选地点推理", desc: "给出多个候选, 标注支持与反对证据。" },
  { n: "04", title: "侦探报告", desc: "结构化线索拆解 + 推理链路 + 验证建议。" },
];

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-orange-50/70 via-white to-white" />
          <MapBackdrop />
          <div className="relative mx-auto max-w-7xl px-4 pb-16 pt-16 sm:px-6 sm:pt-24 lg:px-8 lg:pt-28">
            <div className="mx-auto max-w-3xl text-center">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-orange-200 bg-white/70 px-3.5 py-1.5 text-xs font-medium text-orange-700 shadow-sm backdrop-blur">
                <Sparkles className="h-3.5 w-3.5" />
                多模态 AI · OSINT · 地理定位推理
              </div>
              <div className="mb-5 flex items-center justify-center">
                <Logo size={56} />
              </div>
              <h1 className="text-4xl font-bold tracking-tight text-zinc-900 sm:text-6xl">
                <span className="text-gradient-brand">橙迹</span> OrangeTrace
              </h1>
              <p className="mt-3 text-base font-medium text-orange-600 sm:text-lg">
                用一张图片，寻找世界的线索
              </p>
              <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-zinc-600 sm:text-lg">
                上传一张图片，让多模态模型 + OSINT 方法帮你推理它可能的拍摄地点。
                像侦探一样拆解每一条线索，给出可解释的候选与验证建议。
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link href="/analyze">
                  <Button size="lg" className="w-full sm:w-auto">
                    <ScanLine className="h-5 w-5" />
                    上传图片开始分析
                  </Button>
                </Link>
                <Link href="/history">
                  <Button size="lg" variant="outline" className="w-full sm:w-auto">
                    查看历史记录
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
              <div className="mt-6 flex items-center justify-center gap-5 text-xs text-zinc-400">
                <span className="inline-flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5 text-orange-500" /> 隐私优先
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5 text-orange-500" /> 24h 自动清理原图
                </span>
                <span className="inline-flex items-center gap-1">
                  <Sparkles className="h-3.5 w-3.5 text-orange-500" /> 保守置信度
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* 能力展示 */}
        <section className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-bold text-zinc-900 sm:text-3xl">
              它能从一张图片里提取哪些线索？
            </h2>
            <p className="mt-2 text-zinc-500">
              结合多模态大模型与 OSINT 地理定位方法论，逐项侦查图片细节。
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {CAPABILITIES.map((c) => (
              <Card key={c.title} className="card-hover p-5">
                <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-orange-50 text-orange-600 ring-1 ring-orange-100">
                  <c.icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold text-zinc-900">{c.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-zinc-500">{c.desc}</p>
              </Card>
            ))}
          </div>
        </section>

        {/* 工作流 */}
        <section className="relative overflow-hidden border-y border-zinc-100 bg-zinc-50/50 py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-10 text-center">
              <h2 className="text-2xl font-bold text-zinc-900 sm:text-3xl">四步获得侦探报告</h2>
              <p className="mt-2 text-zinc-500">从上传到结论，每一步都看得见。</p>
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((s, i) => (
                <div key={s.n} className="relative">
                  <Card className="h-full p-6">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-3xl font-bold text-orange-200">{s.n}</span>
                      {i < STEPS.length - 1 && (
                        <ArrowRight className="hidden h-5 w-5 text-orange-300 lg:block" />
                      )}
                    </div>
                    <h3 className="mt-3 text-lg font-semibold text-zinc-900">{s.title}</h3>
                    <p className="mt-1 text-sm text-zinc-500">{s.desc}</p>
                  </Card>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <Card className="relative overflow-hidden border-orange-200 bg-gradient-to-br from-orange-500 to-orange-600 p-8 text-center text-white sm:p-12">
            <div className="absolute inset-0 bg-grid opacity-20" />
            <div className="relative">
              <h2 className="text-2xl font-bold sm:text-3xl">准备好寻找线索了吗？</h2>
              <p className="mx-auto mt-2 max-w-xl text-orange-50">
                上传一张你有权分析的图片，让 AI 帮你推理它可能的拍摄地点。
              </p>
              <div className="mt-6 flex justify-center">
                <Link href="/analyze">
                  <Button size="lg" className="bg-white text-orange-600 hover:bg-orange-50">
                    <ScanLine className="h-5 w-5" />
                    立即开始
                  </Button>
                </Link>
              </div>
              <p className="mt-4 text-xs text-orange-100">
                请只上传你有权分析的图片 · 不鼓励人肉搜索或侵犯隐私
              </p>
            </div>
          </Card>
        </section>
      </main>
      <Footer />
    </div>
  );
}
