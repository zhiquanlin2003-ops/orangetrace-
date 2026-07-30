/**
 * 中国坐标系转换 (无需 npm 包, 纯 JS).
 *
 * 中国地图服务都用 GCJ-02 ("火星坐标", 即对中国境内 GPS 点做非线性偏移).
 * - WGS-84: 国际标准 GPS, OpenStreetMap, Apple/Google Maps 原始数据用这个
 * - GCJ-02: 高德 / 腾讯 / Google Maps 中国境内 用这个
 * - BD-09:  百度地图自有的额外偏移
 *
 * 当我们在高德瓦片底图上画 WGS-84 坐标的 marker 时, 会有 100~600 米偏移.
 * 解决方案: 渲染前把 WGS-84 转 GCJ-02.
 *
 * 算法来源: gcoord 项目 (https://github.com/hujiulong/gcoord), 系国家测绘局公开偏移算法反推.
 */

const PI = Math.PI;
const A = 6378245.0;             // 长半轴
const EE = 0.00669342162296594323; // 偏心率平方

function outOfChina(lng: number, lat: number): boolean {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function transformLat(x: number, y: number): number {
  let ret =
    -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(y * PI) + 40.0 * Math.sin((y / 3.0) * PI)) * 2.0) / 3.0;
  ret += ((160.0 * Math.sin((y / 12.0) * PI) + 320 * Math.sin((y * PI) / 30.0)) * 2.0) / 3.0;
  return ret;
}

function transformLng(x: number, y: number): number {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(x * PI) + 40.0 * Math.sin((x / 3.0) * PI)) * 2.0) / 3.0;
  ret += ((150.0 * Math.sin((x / 12.0) * PI) + 300.0 * Math.sin((x / 30.0) * PI)) * 2.0) / 3.0;
  return ret;
}

/**
 * WGS-84 (国际标准 GPS) → GCJ-02 (高德/腾讯/Google 中国境内).
 * 国外坐标 (经度 < 72 / > 137 或 纬度 < 0.8 / > 55.8) 直接原样返回 (没偏移).
 */
export function wgs84ToGcj02(lng: number, lat: number): [number, number] {
  if (outOfChina(lng, lat)) return [lng, lat];
  let dLat = transformLat(lng - 105.0, lat - 35.0);
  let dLng = transformLng(lng - 105.0, lat - 35.0);
  const radLat = (lat / 180.0) * PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / ((A * (1 - EE)) / (magic * sqrtMagic) * PI);
  dLng = (dLng * 180.0) / (A / sqrtMagic * Math.cos(radLat) * PI);
  const mgLat = lat + dLat;
  const mgLng = lng + dLng;
  return [mgLng, mgLat];
}

/**
 * GCJ-02 → WGS-84 (近似逆向).
 * 由于偏移非线性, 严格逆算很慢; 实际用迭代近似即可, 国内一般误差 < 5 米.
 */
export function gcj02ToWgs84(lng: number, lat: number): [number, number] {
  if (outOfChina(lng, lat)) return [lng, lat];
  // 单次近似: WGS84 = GCJ02 - (gcj02(WGS84) - WGS84) 同样的差, 用 gcj02 反代
  const [estimatedLng, estimatedLat] = wgs84ToGcj02(lng, lat);
  return [lng * 2 - estimatedLng, lat * 2 - estimatedLat];
}
