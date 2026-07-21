import exifr from "exifr";

export interface ExifSummary {
  hasGps: boolean;
  latitude?: number;
  longitude?: number;
  dateTimeOriginal?: string;
  make?: string;
  model?: string;
  software?: string;
  lensModel?: string;
  iso?: number;
  fNumber?: number;
  exposureTime?: number;
  focalLength?: number;
  raw: Record<string, unknown>;
}

/** 读取图片 buffer 的 EXIF, 返回摘要 + 全量 raw。不抛错。 */
export async function readExif(
  buffer: Buffer,
  allowed: boolean,
): Promise<ExifSummary | null> {
  if (!allowed) return null;
  try {
    const all = (await exifr.parse(buffer, true)) as any;
    if (!all) return { hasGps: false, raw: {} };
    const lat = typeof all.latitude === "number" ? all.latitude : undefined;
    const lon = typeof all.longitude === "number" ? all.longitude : undefined;
    return {
      hasGps: lat != null && lon != null,
      latitude: lat,
      longitude: lon,
      dateTimeOriginal: all.DateTimeOriginal
        ? new Date(all.DateTimeOriginal).toISOString()
        : all.CreateDate
          ? new Date(all.CreateDate).toISOString()
          : undefined,
      make: all.Make,
      model: all.Model,
      software: all.Software,
      lensModel: all.LensModel,
      iso: all.ISO,
      fNumber: all.FNumber,
      exposureTime: all.ExposureTime,
      focalLength: all.FocalLength,
      raw: all as Record<string, unknown>,
    };
  } catch {
    return null;
  }
}

/** 把 ExifSummary 渲染成给模型看的人类可读文字。 */
export function formatExifForPrompt(e: ExifSummary | null): string {
  if (!e) return "（用户未允许读取 EXIF，或图片无 EXIF 元数据）";
  const lines: string[] = [];
  if (e.hasGps && e.latitude != null && e.longitude != null) {
    lines.push(`GPS: ${e.latitude.toFixed(5)}, ${e.longitude.toFixed(5)} (这是最可靠的线索)`);
  }
  if (e.dateTimeOriginal) lines.push(`拍摄时间: ${e.dateTimeOriginal}`);
  if (e.make || e.model) lines.push(`设备: ${[e.make, e.model].filter(Boolean).join(" ")}`);
  if (e.software) lines.push(`软件: ${e.software}`);
  if (e.lensModel) lines.push(`镜头: ${e.lensModel}`);
  if (e.iso) lines.push(`ISO: ${e.iso}`);
  if (e.fNumber) lines.push(`光圈: f/${e.fNumber}`);
  if (e.exposureTime) lines.push(`快门: ${e.exposureTime}s`);
  if (e.focalLength) lines.push(`焦距: ${e.focalLength}mm`);
  return lines.length ? lines.join("\n") : "（图片存在 EXIF 段但无关键字段）";
}
