import { cn } from "@/lib/utils";

/** 橙迹品牌 logo: 一个橙色定位针 + 内嵌放大镜/搜索轨迹。 */
export function Logo({
  className,
  size = 32,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={cn(className)}
      aria-hidden
    >
      <defs>
        <linearGradient id="ot-logo-g" x1="0" y1="0" x2="48" y2="48">
          <stop stopColor="#fb923c" />
          <stop offset="1" stopColor="#ea580c" />
        </linearGradient>
      </defs>
      {/* 外圈地图弧线 */}
      <circle cx="24" cy="24" r="22" stroke="#fed7aa" strokeWidth="1.5" strokeDasharray="2 3" fill="none" />
      {/* 定位针 */}
      <path
        d="M24 6c-7.2 0-13 5.7-13 12.8 0 9.1 11.3 21.4 12.1 22.2.5.5 1.3.5 1.8 0C26.7 40.2 37 28 37 18.8 37 11.7 31.2 6 24 6z"
        fill="url(#ot-logo-g)"
      />
      {/* 内圆 */}
      <circle cx="24" cy="18.5" r="5.5" fill="#fff" />
      <circle cx="24" cy="18.5" r="2.6" fill="url(#ot-logo-g)" />
    </svg>
  );
}

export function Brand({
  className,
  size = 32,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Logo size={size} />
      <span className="font-semibold tracking-tight">
        <span className="text-zinc-900">橙迹</span>{" "}
        <span className="text-orange-600">OrangeTrace</span>
      </span>
    </span>
  );
}
