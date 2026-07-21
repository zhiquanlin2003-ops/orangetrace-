import type Database from "better-sqlite3";
import { createHash } from "crypto";
import { defaultPrompts } from "./defaults";

/** 简单 SHA-256 密码哈希 (本地 MVP 用). */
export function hashPassword(p: string): string {
  return "sha256:" + createHash("sha256").update(p).digest("hex");
}

type Db = Database.Database;

export function seedDatabase(db: Db) {
  /* --- 管理员账号 --- */
  const adminUser = process.env.ADMIN_USERNAME || "admin";
  const adminPass = process.env.ADMIN_PASSWORD || "admin123";
  const existing = db
    .prepare("SELECT id FROM admin_users WHERE username = ?")
    .get(adminUser);
  if (!existing) {
    db.prepare(
      "INSERT INTO admin_users (username, password_hash) VALUES (?, ?)",
    ).run(adminUser, hashPassword(adminPass));
  }

  /* --- 默认站点设置 --- */
  const setSetting = db.prepare(
    "INSERT OR IGNORE INTO settings (k, v) VALUES (?, ?)",
  );
  setSetting.run("save_original_image", "1");
  setSetting.run("auto_delete_hours", "24");

  /* --- Prompt 模板 --- */
  const upsertPrompt = db.prepare(
    `INSERT INTO prompt_templates (key, label, content) VALUES (?, ?, ?)
     ON CONFLICT(key) DO NOTHING`,
  );
  for (const p of defaultPrompts) {
    upsertPrompt.run(p.key, p.label, p.content);
  }

  /* --- 外部工具默认列表 --- */
  const toolCount = db
    .prepare("SELECT COUNT(*) as c FROM external_tools")
    .get() as { c: number };
  if (toolCount.c === 0) {
    const ins = db.prepare(
      `INSERT INTO external_tools (name, description, url, category, applies_to, enabled, icon)
       VALUES (?, ?, ?, ?, ?, 1, ?)`,
    );
    const tools: Array<[string, string, string, string, string, string]> = [
      ["Google Maps", "全球地图与街景, 用于候选地点可视化与轮廓比对", "https://www.google.com/maps", "地图", "建筑/道路/POI 校验", "map"],
      ["Google Earth", "全球卫星影像, 用于地形/植被/水体大范围比对", "https://earth.google.com", "地图", "自然地理/地形验证", "globe"],
      ["OpenStreetMap", "开源地图数据, 包含丰富 POI / 道路细节", "https://www.openstreetmap.org", "地图", "POI/道路风格筛查", "map"],
      ["Overpass Turbo", "对 OSM 数据进行结构化查询 (POI/道路/路灯)", "https://overpass-turbo.eu", "地图", "POI 精确筛查", "database"],
      ["高德地图", "中国大陆详细地图与街景", "https://gaode.com", "地图", "中国地区 POI 校验", "map"],
      ["百度地图", "中国大陆地图与全景街景", "https://map.baidu.com", "地图", "中国地区街景验证", "map"],
      ["Google Lens", "图片反搜与相似图片/ landmark 识别", "https://lens.google", "反搜", "landmark/相似图片匹配", "search"],
      ["Mapillary", "全球众包街景, 可与拍摄角度比对", "https://www.mapillary.com", "街景", "街景/路侧视角验证", "image"],
      ["Suncalc", "根据日期/地点计算太阳方位与影长, 反推可能拍摄时间", "https://www.suncalc.org", "光影", "光影/拍摄时间推理", "sun"],
      ["SunPosition", "精确太阳位置计算, 用于交叉验证光影线索", "https://www.sunposition.ch", "光影", "光影方向推理", "sun"],
      ["FlightRadar24", "历史航班轨迹, 用于比对天空中的飞机/尾迹", "https://www.flightradar24.com", "轨迹", "飞机/尾迹交叉验证", "plane"],
      ["WorldLicensePlates", "全球车牌样式图鉴", "http://www.worldlicenseplates.com", "车牌", "车牌区域识别", "car"],
      ["Wikipedia", "查询地标/建筑/历史/区域背景", "https://www.wikipedia.org", "资料", "地标/历史背景验证", "book"],
      ["EXIF Tool (在线)", "在线查看图片 EXIF 元数据", "https://exifdata.com", "EXIF", "元数据提取", "code"],
    ];
    for (const t of tools) ins.run(...t);
  }

  /* --- SKILL 方法库默认条目 --- */
  const skillCount = db.prepare("SELECT COUNT(*) as c FROM skills").get() as {
    c: number;
  };
  if (skillCount.c === 0) {
    seedDefaultSkills(db);
  }

  /* --- 验证工具运营配置 (verification_tool_configs) --- */
  seedVerificationToolConfigs(db);
}

/** 默认验证工具配置: 仅 db 层存一份默认 enabled / 字段; Key 留空。 */
function seedVerificationToolConfigs(db: Db) {
  const upsert = db.prepare(
    `INSERT INTO verification_tool_configs
       (k, label, tool_type, enabled, config_json, last_test_at, last_test_status, sort_order, updated_at)
     VALUES (@k, @label, @tool_type, @enabled, @config_json, NULL, NULL, @sort_order, datetime('now'))
     ON CONFLICT(k) DO UPDATE SET
       label=excluded.label,
       tool_type=excluded.tool_type,
       sort_order=excluded.sort_order`,
  );

  // 注意: env 默认值通过 ENABLE_* 环境变量与 AMAP_* 环境变量动态判定。
  // 这里只写"没配 key"时的默认开关与默认参数。
  type Row = {
    k: string;
    label: string;
    tool_type: string;
    enabled: number;
    config_json: string;
    sort_order: number;
  };

  const enableExif = (process.env.ENABLE_EXIF ?? "true") === "false" ? 0 : 1;
  const enableAmap = (process.env.ENABLE_AMAP_POI ?? "true") === "false" ? 0 : 1;
  const enableOverpass = (process.env.ENABLE_OVERPASS ?? "true") === "false" ? 0 : 1;
  const enableSuncalc = (process.env.ENABLE_SUNCALC ?? "true") === "false" ? 0 : 1;
  const enableMap = (process.env.ENABLE_MAP_VISUALIZATION ?? "true") === "false" ? 0 : 1;

  const rows: Row[] = [
    {
      k: "amap_web",
      label: "高德地图 Web 服务",
      tool_type: "verifier",
      enabled: enableAmap,
      // config_json: 存超时/重试/最大调用/默认半径/已加密的 key
      config_json: JSON.stringify({
        key_enc: "",
        base_url: "https://restapi.amap.com",
        timeout_ms: 8000,
        max_calls_per_analysis: 6,
        max_calls_per_candidate: 3,
        default_radius_m: 1000,
        description: "国内 POI 搜索 / 地理编码 / 逆地理编码 / 周边搜索 (中国大陆优先)",
      }),
      sort_order: 10,
    },
    {
      k: "amap_js",
      label: "高德地图前端 (结果页地图)",
      tool_type: "map",
      enabled: enableMap,
      config_json: JSON.stringify({
        js_key: "",
        security_js_code: "",
        description: "在结果页渲染候选地点地图。仅 NEXT_PUBLIC_* 前缀变量会进入前端。",
      }),
      sort_order: 20,
    },
    {
      k: "overpass",
      label: "OpenStreetMap / Overpass",
      tool_type: "verifier",
      enabled: enableOverpass,
      config_json: JSON.stringify({
        endpoint: process.env.OVERPASS_API_URL || "https://overpass-api.de/api/interpreter",
        timeout_ms: 15000,
        default_radius_m: 1000,
        max_radius_m: 5000,
        max_calls_per_analysis: 4,
        max_calls_per_candidate: 2,
        description: "候选地点附近的道路/铁路/桥梁/河流/POI 等公开地理要素查询",
      }),
      sort_order: 30,
    },
    {
      k: "suncalc",
      label: "SunCalc 光影验证",
      tool_type: "verifier",
      enabled: enableSuncalc,
      config_json: JSON.stringify({
        description: "根据候选坐标 + 拍摄时间本地计算太阳方位/高度角、日出日落; 辅助验证光影方向。无需 API Key。",
        timeout_ms: 1000,
      }),
      sort_order: 40,
    },
    {
      k: "exif",
      label: "EXIF 解析",
      tool_type: "verifier",
      enabled: enableExif,
      config_json: JSON.stringify({
        description: "本地解析图片 EXIF: GPS / 拍摄时间 / 设备型号 / 焦距 / 方向。无需 API Key。",
      }),
      sort_order: 5,
    },
    {
      k: "google_maps",
      label: "Google Maps (预留)",
      tool_type: "verifier",
      enabled: 0,
      config_json: JSON.stringify({
        key_enc: "",
        description: "本轮仅保留配置项与适配器骨架, 未完整接入。",
      }),
      sort_order: 90,
    },
    {
      k: "baidu_map",
      label: "百度地图 (预留)",
      tool_type: "verifier",
      enabled: 0,
      config_json: JSON.stringify({
        key_enc: "",
        description: "本轮仅保留配置项与适配器骨架, 未完整接入。",
      }),
      sort_order: 91,
    },
    {
      k: "mapillary",
      label: "Mapillary (预留)",
      tool_type: "verifier",
      enabled: 0,
      config_json: JSON.stringify({
        key_enc: "",
        description: "本轮仅保留配置项, 街景截图自动比对未接入。",
      }),
      sort_order: 92,
    },
  ];

  for (const r of rows) {
    upsert.run(r);
  }
}

function seedDefaultSkills(db: Db) {
  const ins = db.prepare(
    `INSERT INTO skills
      (name, description, scenario, key_clues, recommended_tools, caveats,
       category, priority, enabled, version, source)
     VALUES (@name, @description, @scenario, @key_clues, @recommended_tools,
             @caveats, @category, @priority, 1, 'v1', 'builtin')`,
  );
  const skills = [
    {
      name: "文字与符号 OCR",
      description:
        "提取图片中所有可见文字: 招牌、广告、路牌、门牌、菜单、包装、车牌、铭牌等。文字通常是最强线索。",
      scenario: "包含可见文字、招牌、路牌、车牌的图片",
      key_clues: "语言/字符集\n招牌品牌\n电话区号\n货币符号\n门牌编号\n车牌字符样式",
      recommended_tools: "Google Lens\nGoogle Translate\nWorldLicensePlates",
      caveats: "注意区分本地语言与外语标识; AI 模型可能识别错字符, 需人工复核",
      category: "文字线索",
      priority: 95,
    },
    {
      name: "车牌与车辆风格",
      description:
        "通过车牌颜色/格式/字体、车辆型号、转向灯位置(左舵/右舵)缩小国家或地区范围。",
      scenario: "图片中清晰可见车辆或车牌",
      key_clues: "车牌底色与字符布局\n车牌字体\n车型/品牌\n转向灯/方向盘位置\n出租车涂装",
      recommended_tools: "WorldLicensePlates\nGoogle Lens",
      caveats: "车牌可能为外交/特种车牌; 部分地区车牌格式相似",
      category: "基础设施",
      priority: 88,
    },
    {
      name: "道路与交通设施",
      description:
        "道路标线颜色(黄/白)、车道方向、交通信号灯位置与样式、交通标志体系(维也纳公约 vs 美国 MUTCD)、环岛、铁路电气化方式。",
      scenario: "包含道路、街景、交通设施的图片",
      key_clues: "路标体系\n标线颜色\n信号灯位置\n路缘样式\n铁路/电车线缆\n环岛",
      recommended_tools: "Google Street View\nMapillary\nOpenStreetMap",
      caveats: "同一国家不同地区可能有差异; 殖民历史会影响路标体系",
      category: "基础设施",
      priority: 82,
    },
    {
      name: "建筑风格与材料",
      description:
        "建筑屋顶形状、窗框、阳台、外立面材料、颜色倾向、典型本土建筑范式(如葡萄牙石拼路、北欧红木屋、地中海白墙)。",
      scenario: "包含建筑外观的图片",
      key_clues: "屋顶类型\n窗框与百叶\n外立面颜色/材料\n阳台样式\n宗教建筑特征",
      recommended_tools: "Google Earth\nWikipedia",
      caveats: "现代建筑全球趋同, 传统建筑更具地域特征",
      category: "建筑线索",
      priority: 75,
    },
    {
      name: "植被与自然地理",
      description:
        "植被种类(棕榈/松/竹/仙人掌)、土壤颜色、地形(平原/丘陵/高山)、水体颜色、海岸线形态。",
      scenario: "包含自然环境、山体、植被的图片",
      key_clues: "植被种类\n土壤颜色\n地形起伏\n水体颜色\n海拔线索",
      recommended_tools: "Google Earth\nOpenStreetMap",
      caveats: "相似气候带(如地中海气候)植被可能相似, 需结合其它线索",
      category: "自然地理",
      priority: 70,
    },
    {
      name: "光影与拍摄时间推断",
      description:
        "通过阴影方向与长度推断太阳方位、大致拍摄时间与纬度区间。结合日期可进一步缩小经度。",
      scenario: "有明显阴影或阳光方向线索的图片",
      key_clues: "阴影方向/长度\n太阳高度角\n窗户光线\n雪/雨/雾气候线索",
      recommended_tools: "Suncalc\nSunPosition",
      caveats: "无日期时只能给出纬度区间; 阴天/室内无阴影则无法推断",
      category: "光影线索",
      priority: 68,
    },
    {
      name: "电线杆/路灯/护栏体系",
      description:
        "电线杆材质(木/混凝土/钢)、路灯造型、护栏样式、井盖标识往往是强烈的地区特征。",
      scenario: "城市街景图片",
      key_clues: "电线杆材质\n路灯造型\n护栏颜色/样式\n井盖标识",
      recommended_tools: "Google Street View\nMapillary",
      caveats: "需多角度交叉验证, 单一设施可重复出现于多国",
      category: "基础设施",
      priority: 60,
    },
    {
      name: "EXIF 元数据优先",
      description:
        "若用户允许且图片含 EXIF, 优先提取 GPS、拍摄时间、设备型号。EXIF 是最可靠线索(若未被剥离)。",
      scenario: "原图/未压缩图片 (非社交媒体转发)",
      key_clues: "GPS 经纬度\n拍摄时间\n设备型号\n焦距/曝光",
      recommended_tools: "EXIF Tool\nexiftool",
      caveats: "社交媒体平台通常剥离 EXIF; GPS 可能被篡改",
      category: "EXIF",
      priority: 100,
    },
    {
      name: "地图与 POI 筛查",
      description:
        "基于已提取线索(招牌品牌、基站、特定连锁店)在地图上做 POI 检索, 精确到街道。",
      scenario: "已获得具体线索需精确定位",
      key_clues: "招牌品牌门店分布\n特色 POI\n独特的路口布局",
      recommended_tools: "Google Maps\nOverpass Turbo\n高德/百度地图",
      caveats: "POI 数据可能过时; 需结合街景最终确认",
      category: "地图与POI",
      priority: 78,
    },
    {
      name: "天气与气候推断",
      description:
        "通过可见天气(雪、季风、干旱)、植被状态、衣物厚度推断气候带与季节, 排除不可能区域。",
      scenario: "可见明显天气或季节线索",
      key_clues: "积雪\n衣物厚度\n降雨强度\n植被季节状态",
      recommended_tools: "Wikipedia\nGoogle Earth",
      caveats: "只能排除不能定位, 需配合其它线索",
      category: "自然地理",
      priority: 55,
    },
    {
      name: "图像反向搜索",
      description:
        "用 Google Lens / TinEye / Yandex 反向搜索, 查找相似图片或已知拍摄地。对知名地标尤其有效。",
      scenario: "疑似地标或网络已有相似图片",
      key_clues: "相似图片来源\nlandmark 匹配结果",
      recommended_tools: "Google Lens\nYandex Images\nTinEye",
      caveats: "结果可能误导(相似但不同地点); 注意版权与隐私",
      category: "反搜",
      priority: 80,
    },
    {
      name: "隐私与精度降级",
      description:
        "对居住地/学校/医院/办公室等私人场所强制降低精度, 只输出到城市或大区域, 不得输出私人住址或个人身份。",
      scenario: "任何疑似私人场所的图片",
      key_clues: "住宅外观\n私家车辆\n儿童/隐私场景",
      recommended_tools: "—",
      caveats: "重要: 不鼓励人肉搜索或跟踪; 必须遵守当地隐私法律",
      category: "安全",
      priority: 99,
    },
  ];
  for (const s of skills) ins.run(s);
}
