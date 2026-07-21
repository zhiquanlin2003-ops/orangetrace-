import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "橙迹 OrangeTrace · 用一张图片，寻找世界的线索",
    template: "%s · 橙迹 OrangeTrace",
  },
  description:
    "上传一张图片，让多模态模型 + OSINT 方法帮你推理它可能的拍摄地点。侦探报告式结果，可解释、保守、尊重隐私。",
  keywords: [
    "图片地理定位",
    "OSINT",
    "多模态",
    "AI 推理",
    "拍摄地点",
    "OrangeTrace",
    "橙迹",
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-white antialiased">
        {children}
      </body>
    </html>
  );
}
