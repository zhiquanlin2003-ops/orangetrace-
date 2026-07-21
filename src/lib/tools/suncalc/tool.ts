import type {
  ToolInput,
  ToolResult,
  VerificationEvidence,
  VerificationTool,
} from "@/lib/tools/types";
import { decodeConfig } from "@/lib/tools/store";

/**
 * SunCalc 光影验证 (本地计算, 无需 API Key)。
 * 依赖: suncalc npm 包。若未安装, 自动 fallback 为 skipped。
 */
export class SuncalcTool implements VerificationTool {
  readonly name = "suncalc";
  readonly label = "SunCalc 光影计算";

  isEnabled(): boolean {
    if ((process.env.ENABLE_SUNCALC ?? "true") === "false") return false;
    return Boolean(decodeConfig("suncalc"));
  }
  isConfigured(): boolean {
    return true; // 不需要 Key
  }

  async execute(input: ToolInput): Promise<ToolResult> {
    const startedAt = new Date().toISOString();
    if (!this.isEnabled()) {
      return skip(this, startedAt, "SunCalc 工具未启用 (ENABLE_SUNCALC=false)");
    }
    const coords = input.coordinates;
    if (!coords || !Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude)) {
      return skip(this, startedAt, "候选无坐标, 无法计算太阳位置");
    }
    const when = input.capturedAt ? parseDate(input.capturedAt) : null;
    if (!when) {
      return skip(this, startedAt, "缺少拍摄时间, 无法精确验证光影 (可作为辅助, 但不单独定位)");
    }

    let SunCalc: any;
    try {
      // 动态加载, 避免包未安装导致整个流水线崩溃
      SunCalc = await import("suncalc");
    } catch {
      SunCalc = null;
    }
    if (!SunCalc || !SunCalc.getPosition) {
      return skip(this, startedAt, "SunCalc 库未安装 (npm i suncalc 后可用)");
    }

    const pos = SunCalc.getPosition(when, coords.latitude, coords.longitude);
    const azimuthDeg = (pos.azimuth * 180) / Math.PI; // 0=N, 顺时针
    const altitudeDeg = (pos.altitude * 180) / Math.PI;
    const times = SunCalc.getTimes(when, coords.latitude, coords.longitude);

    const evidence: VerificationEvidence[] = [{
      type: altitudeDeg > 0 ? "support" : "neutral",
      title: `候选地太阳位置: 方位 ${azimuthDeg.toFixed(1)}°, 高度 ${altitudeDeg.toFixed(1)}°`,
      description:
        `日出约 ${fmtTime(times.sunrise)} / 日落约 ${fmtTime(times.sunset)}; ` +
        `当前太阳在 ${describeAzimuth(azimuthDeg)} 方位, ${altitudeDeg > 0 ? "高于地平线 (影像中应有清晰阴影)" : "低于地平线 (不建议依据阴影判断)"}.`,
      candidateId: input.candidateId,
      confidence: Math.max(20, Math.min(45, 30 + Math.round(altitudeDeg))),
      source: "SunCalc (本地算法)",
      coordinates: coords,
    }];

    let summary = `(${coords.latitude.toFixed(3)}, ${coords.longitude.toFixed(3)}) @ ${when.toISOString()}: 太阳方位 ${azimuthDeg.toFixed(0)}°, 高度 ${altitudeDeg.toFixed(0)}°`;
    if (altitudeDeg <= 0) {
      summary += `; 当地处于夜间, 影像中阴影信息不可靠`;
    }
    return {
      tool: this.name, label: this.label, status: "success",
      summary,
      evidence,
      rawData: {
        azimuth_deg: Number(azimuthDeg.toFixed(2)),
        altitude_deg: Number(altitudeDeg.toFixed(2)),
        sunrise: times.sunrise,
        sunset: times.sunset,
      },
      startedAt, finishedAt: new Date().toISOString(),
    };
  }
}

function parseDate(s?: string): Date | null {
  if (!s) return null;
  // 兼容 datetime-local 字符串 (例 "2024-12-31T18:30")
  const d = new Date(s.includes("T") && !s.endsWith("Z") && !/[+-]\d\d:?\d\d$/.test(s) ? s : s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtTime(d?: Date): string {
  if (!d || Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(11, 16) + "Z";
}

function describeAzimuth(deg: number): string {
  const d = ((deg % 360) + 360) % 360;
  const dirs = ["北", "东北", "东", "东南", "南", "西南", "西", "西北"];
  return dirs[Math.round(d / 45) % 8];
}

function skip(t: VerificationTool, startedAt: string, reason: string): ToolResult {
  return {
    tool: t.name, label: t.label, status: "skipped",
    summary: reason, evidence: [], startedAt,
    finishedAt: new Date().toISOString(),
  };
}
