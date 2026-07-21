import { cn } from "@/lib/utils";

/**
 * 抽象地图背景: 网格 + 经纬弧线 + 坐标点 + 连线。
 * 纯 SVG, 用于首页 hero 和上传仪式感画面。
 */
export function MapBackdrop({ className }: { className?: string }) {
  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <svg
        className="absolute inset-0 h-full w-full opacity-[0.55]"
        preserveAspectRatio="xMidYMid slice"
        viewBox="0 0 800 600"
        fill="none"
      >
        {/* 经纬度弧线 */}
        <g stroke="rgba(249,115,22,0.18)" strokeWidth="1">
          {Array.from({ length: 9 }).map((_, i) => (
            <ellipse
              key={`v-${i}`}
              cx="400"
              cy="300"
              rx={60 + i * 50}
              ry={40 + i * 36}
            />
          ))}
          {Array.from({ length: 9 }).map((_, i) => (
            <line
              key={`h-${i}`}
              x1="0"
              y1={80 + i * 55}
              x2="800"
              y2={80 + i * 55}
            />
          ))}
        </g>
        {/* 飞行轨迹 (虚线弧) */}
        <path
          d="M90 470 Q 400 60 720 430"
          stroke="rgba(249,115,22,0.45)"
          strokeWidth="1.5"
          strokeDasharray="4 6"
          fill="none"
        />
        <path
          d="M140 130 Q 500 360 690 150"
          stroke="rgba(234,88,12,0.3)"
          strokeWidth="1.2"
          strokeDasharray="3 7"
          fill="none"
        />
        {/* 坐标点 */}
        <g fill="rgba(249,115,22,0.85)">
          <circle cx="120" cy="160" r="3.5" />
          <circle cx="680" cy="120" r="3.5" />
          <circle cx="200" cy="460" r="3.5" />
          <circle cx="640" cy="430" r="3.5" />
          <circle cx="400" cy="230" r="4.5" className="animate-pulse-soft" />
        </g>
        {/* 中心瞄准框 */}
        <g stroke="rgba(249,115,22,0.5)" strokeWidth="1.4">
          <rect x="376" y="206" width="48" height="48" rx="4" />
          <line x1="400" y1="190" x2="400" y2="206" />
          <line x1="400" y1="254" x2="400" y2="270" />
          <line x1="360" y1="230" x2="376" y2="230" />
          <line x1="424" y1="230" x2="440" y2="230" />
        </g>
      </svg>
    </div>
  );
}

/** 单纯的网格点背景, 用于其他区块。 */
export function DotsBackdrop({ className }: { className?: string }) {
  return <div className={cn("pointer-events-none absolute inset-0 bg-dots opacity-60", className)} />;
}
