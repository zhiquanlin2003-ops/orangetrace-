import { Navbar, Footer } from "@/components/layout/Navbar";
import { Card, CardContent } from "@/components/ui/Card";
import {
  ShieldCheck,
  Lock,
  Trash2,
  EyeOff,
  Scale,
  HeartHandshake,
  AlertTriangle,
} from "lucide-react";

const SECTIONS = [
  {
    icon: HeartHandshake,
    title: "请只上传你有权分析的图片",
    body: "请确保你拥有图片的使用与分析权限。橙迹 OrangeTrace 不鼓励、也不协助用于人肉搜索、骚扰、跟踪或任何侵犯个人隐私的用途。",
  },
  {
    icon: EyeOff,
    title: "降级私人地点的输出精度",
    body: "对于居住地、学校、医院、办公室等私人场所，系统会主动降低定位精度，通常只输出到「城市」或「大区域」，而不会精确到门牌号。",
  },
  {
    icon: Lock,
    title: "不输出敏感个人信息",
    body: "结果不会显示个人姓名、电话、身份证号、车主信息等 PII。结果以「候选地点」和「推理依据」的形式呈现，绝不伪装成绝对事实。",
  },
  {
    icon: Trash2,
    title: "原图自动删除策略",
    body: "为降低风险，上传的原图默认会在一定时间（如 24 小时）后被自动删除。管理员可在后台「设置」中调整保留时长，或关闭原图保存。",
  },
  {
    icon: AlertTriangle,
    title: "AI 推理结果仅供参考",
    body: "图片地理定位本质上是概率推理，结果不保证 100% 准确。请务必结合地图、街景、公开资料进行人工复核后再做判断。",
  },
  {
    icon: Scale,
    title: "遵守当地法律法规",
    body: "使用本工具前，请了解并遵守你所在地区的隐私与数据保护法律。对因不当使用造成的后果，由使用者本人承担。",
  },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-orange-600 ring-1 ring-orange-100">
              <ShieldCheck className="h-7 w-7" />
            </div>
            <h1 className="text-2xl font-bold text-zinc-900 sm:text-3xl">隐私与安全说明</h1>
            <p className="mt-2 text-zinc-500">
              橙迹 OrangeTrace 是一个 AI 辅助的推理工具，优先尊重隐私与合规。
            </p>
          </div>

          <div className="space-y-4">
            {SECTIONS.map((s) => (
              <Card key={s.title}>
                <CardContent className="flex items-start gap-4 p-5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                    <s.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-zinc-900">{s.title}</h2>
                    <p className="mt-1 text-sm leading-relaxed text-zinc-600">{s.body}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="mt-6 border-amber-200 bg-amber-50/50">
            <CardContent className="p-5 text-sm text-amber-800">
              <p className="font-semibold">如发现滥用</p>
              <p className="mt-1">
                如果有人利用本工具进行骚扰、跟踪或其他侵犯隐私的行为，请立即停止使用并联系站点管理员。
                本工具提供所有能力仅用于研究、学习与合法用途。
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
}
