import type {
  ToolInput,
  ToolResult,
  VerificationEvidence,
  VerificationTool,
} from "@/lib/tools/types";
import { decodeConfig } from "@/lib/tools/store";
import { readExif, formatExifForPrompt } from "@/lib/exif";

/**
 * EXIF 工具 - 本地解析, 无需远程 API Key。
 * 用户未允许或图片无 EXIF 时 → skipped (不算失败)。
 */
export class ExifTool implements VerificationTool {
  readonly name = "exif";
  readonly label = "EXIF 解析";

  isEnabled(): boolean {
    if ((process.env.ENABLE_EXIF ?? "true") === "false") return false;
    return Boolean(decodeConfig("exif"));
  }
  isConfigured(): boolean {
    return true;
  }

  async execute(input: ToolInput): Promise<ToolResult> {
    const startedAt = new Date().toISOString();
    if (!this.isEnabled()) {
      return skip(this, startedAt, "EXIF 工具未启用 (ENABLE_EXIF=false)");
    }
    // 优先用上游已解析好的 exifSummary (pipeline 提供), 避免重复解析
    const allowExif = input.exifSummary !== undefined;
    if (!allowExif && !input.imageBuffer) {
      return skip(this, startedAt, "用户未允许读取 EXIF");
    }

    let summary: any = input.exifSummary ?? null;
    let rich = null as any;
    if (input.imageBuffer) {
      rich = await readExif(input.imageBuffer, true);
    } else if (input.exifSummary) {
      rich = summary; // 已经是 ExifSummary 结构
    }

    if (!rich) {
      return skip(this, startedAt, "图片未包含可用 EXIF 元数据 (这不代表原图从未包含定位信息)");
    }

    const evidence: VerificationEvidence[] = [];
    if (rich.hasGps && typeof rich.latitude === "number" && typeof rich.longitude === "number") {
      evidence.push({
        type: "support",
        title: `EXIF GPS: ${rich.latitude.toFixed(5)}, ${rich.longitude.toFixed(5)}`,
        description: "这是最可靠的线索 —— EXIF GPS 直接指向拍摄位置",
        candidateId: input.candidateId,
        confidence: 95,
        source: "图片 EXIF 元数据",
        coordinates: { latitude: rich.latitude, longitude: rich.longitude },
      });
    } else {
      // 无 GPS 但有其他 EXIF 也算一条中性证据(用于核对设备/时间)
      const meta = formatExifForPrompt(rich);
      evidence.push({
        type: "neutral",
        title: "未检测到 GPS, 但有其它 EXIF",
        description: meta ? meta.slice(0, 400) : "",
        candidateId: input.candidateId,
        confidence: 10,
        source: "图片 EXIF 元数据",
      });
    }

    return {
      tool: this.name, label: this.label,
      status: evidence.some((e) => e.type === "support" && e.confidence >= 90)
        ? "success"
        : (rich && rich.hasGps === false ? "skipped" : "success"),
      summary: rich.hasGps
        ? `EXIF 提取到 GPS: (${rich.latitude?.toFixed(5)}, ${rich.longitude?.toFixed(5)})` +
          (rich.dateTimeOriginal ? `; 拍摄时间 ${rich.dateTimeOriginal}` : "")
        : "EXIF 已读取, 但未包含 GPS",
      evidence,
      rawData: {
        hasGps: rich.hasGps,
        latitude: rich.latitude,
        longitude: rich.longitude,
        dateTimeOriginal: rich.dateTimeOriginal,
        make: rich.make,
        model: rich.model,
      },
      startedAt, finishedAt: new Date().toISOString(),
    };
  }
}

function skip(t: VerificationTool, startedAt: string, reason: string): ToolResult {
  return {
    tool: t.name, label: t.label, status: "skipped",
    summary: reason, evidence: [], startedAt,
    finishedAt: new Date().toISOString(),
  };
}
