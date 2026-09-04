/**
 * Toonflow AI供应商模板
 * @version 2.0
 */

// ============================================================
// 类型定义
// ============================================================

type VideoMode =
  | "singleImage" //单图参考
  | "startEndRequired" //首尾帧（两张都得有）
  | "endFrameOptional" //首尾帧（尾帧可选）
  | "startFrameOptional" //首尾帧（首帧可选）
  | "text" //文本
  | (`videoReference:${number}` | `imageReference:${number}` | `audioReference:${number}`)[]; //多参考（数字代表限制数量）

interface TextModel {
  name: string;
  modelName: string;
  type: "text";
  think: boolean;
}

interface ImageModel {
  name: string;
  modelName: string;
  type: "image";
  mode: ("text" | "singleImage" | "multiReference")[];
  associationSkills?: string;
}

interface VideoModel {
  name: string;
  modelName: string;
  type: "video";
  mode: VideoMode[];
  associationSkills?: string;
  audio: "optional" | false | true;
  durationResolutionMap: { duration: number[]; resolution: string[] }[];
}

interface TTSModel {
  name: string;
  modelName: string;
  type: "tts";
  voices: { title: string; voice: string }[];
}

interface VendorConfig {
  id: string; //唯一ID，作为文件名存储用户磁盘上，禁止符号
  version: string; //版本号，格式为x.y，需遵守语义化版本控制
  name: string; //供应商名称
  author: string; //作者
  description?: string; //描述，支持Markdown格式
  icon?: string; //图标，仅支持Base64格式，建议尺寸为128x128像素
  inputs: { key: string; label: string; type: "text" | "password" | "url"; required: boolean; placeholder?: string }[];
  inputValues: Record<string, string>;
  models: (TextModel | ImageModel | VideoModel | TTSModel)[];
}

type ReferenceList =
  | { type: "image"; sourceType: "base64"; base64: string }
  | { type: "audio"; sourceType: "base64"; base64: string }
  | { type: "video"; sourceType: "base64"; base64: string };

interface ImageConfig {
  prompt: string;
  referenceList?: Extract<ReferenceList, { type: "image" }>[];
  size: "1K" | "2K" | "4K";
  aspectRatio: `${number}:${number}`;
}

interface VideoConfig {
  duration: number;
  resolution: string;
  aspectRatio: "16:9" | "9:16";
  prompt: string;
  referenceList?: ReferenceList[];
  audio?: boolean;
  mode: VideoMode[];
}

interface TTSConfig {
  text: string;
  voice: string;
  speechRate: number;
  pitchRate: number;
  volume: number;
  referenceList?: Extract<ReferenceList, { type: "audio" }>[];
}

interface PollResult {
  completed: boolean;
  data?: string;
  error?: string;
}

// ============================================================
// 全局声明
// ============================================================

declare const axios: any; // HTTP请求库
declare const logger: (msg: string) => void; // 日志函数
declare const jsonwebtoken: any; // JWT处理库
declare const zipImage: (base64: string, size: number) => Promise<string>; // 图片压缩函数，返回有头base64字符串
declare const zipImageResolution: (base64: string, w: number, h: number) => Promise<string>; // 图片分辨率调整函数，返回有头base64字符串
declare const mergeImages: (base64Arr: string[], maxSize?: string) => Promise<string>; // 图片合成函数，返回有头base64字符串
declare const urlToBase64: (url: string) => Promise<string>; // URL转Base64函数，返回有头base64字符串
declare const pollTask: (fn: () => Promise<PollResult>, interval?: number, timeout?: number) => Promise<PollResult>; // 轮询函数，fn为异步函数，interval为轮询间隔，timeout为超时时间，返回fn的结果
declare const createOpenAI: any;
declare const createDeepSeek: any;
declare const createZhipu: any;
declare const createQwen: any;
declare const createAnthropic: any;
declare const createOpenAICompatible: any;
declare const createXai: any;
declare const createMinimax: any;
declare const createGoogleGenerativeAI: any;
declare const exports: {
  vendor: VendorConfig;
  textRequest: (m: TextModel, t: boolean, tl: 0 | 1 | 2 | 3) => any; //文本模型
  imageRequest: (c: ImageConfig, m: ImageModel) => Promise<string>; //图片模型，返回有头base64字符串
  videoRequest: (c: VideoConfig, m: VideoModel) => Promise<string>; //视频模型，返回有头base64字符串
  ttsRequest: (c: TTSConfig, m: TTSModel) => Promise<string>; //（暂未开放）语音模型，返回有头base64字符串
  checkForUpdates?: () => Promise<{ hasUpdate: boolean; latestVersion: string; notice: string }>; //检查更新函数，返回是否有更新和最新版本号和更公告（支持Markdown格式）
  updateVendor?: () => Promise<string>; //更新函数，返回最新的代码文本
};

// ============================================================
// 供应商配置
// ============================================================

const vendor: VendorConfig = {
  id: "MaaS",
  version: "2.0",
  author: "Toonflow",
  name: "MaaS",
  description: "## 开发模板，您可以使用此模板进行Vibe Coding",
  inputs: [
    { key: "apiKey", label: "API密钥", type: "password", required: true },
    { key: "baseUrl", label: "请求地址", type: "url", required: true, placeholder: "示例：https://api.openai.com/v1" },
  ],
  inputValues: { apiKey: "", baseUrl: "https://maas.ovaijisuan.com/v1" },
  models: [
    { name: "DeepSeek-V4-Flash-0731", modelName: "deepseek-v4-flash-0731", type: "text", think: false },
    { name: "GLM-5.2-W4A8", modelName: "glm-5.2-w4a8", type: "text", think: false },
    { name: "qwen-image", modelName: "qwen-image", type: "image", mode: ["text"] },
    { name: "ernie-image-turbo", modelName: "ernie-image-turbo", type: "image", mode: ["text"] },
    {
      name: "Hunyuan-Image-3.0",
      modelName: "hunyuan-image-3",
      type: "image",
      mode: ["text", "singleImage"],
    },
    {
      name: "Qwen-Image-Edit",
      modelName: "qwen-image-edit",
      type: "image",
      mode: ["singleImage", "multiReference"],
    },
  ],
};

// ============================================================
// 辅助工具
// ============================================================

const getHeaders = () => {
  if (!vendor.inputValues.apiKey) throw new Error("缺少API Key");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${vendor.inputValues.apiKey.replace(/^Bearer\s+/i, "")}`,
  };
};

const getBaseUrl = () => vendor.inputValues.baseUrl.replace(/\/+$/, "");

// ============================================================
// 适配器函数
// ============================================================

const textRequest = (model: TextModel, think: boolean, thinkLevel: 0 | 1 | 2 | 3) => {
  if (!vendor.inputValues.apiKey) throw new Error("缺少API Key");
  const apiKey = vendor.inputValues.apiKey.replace(/^Bearer\s+/i, "");
  return createOpenAI({ baseURL: vendor.inputValues.baseUrl, apiKey }).chat(model.modelName);
};

const imageRequest = async (config: ImageConfig, model: ImageModel): Promise<string> => {
  const baseUrl = getBaseUrl();
  const headers = getHeaders();

  const hasReference = config.referenceList && config.referenceList.length > 0;
  // 判断是否为纯编辑模型（不支持文生图）
  const isEditOnly = model.mode.includes("singleImage") && !model.mode.includes("text") ||
    model.mode.includes("multiReference") && !model.mode.includes("text");

  // 图生图使用 baseUrl/images/edits，文生图使用 baseUrl/images/generations
  const requestUrl = hasReference
    ? `${baseUrl}/images/edits`
    : `${baseUrl}/images/generations`;

  const body: any = {
    model: model.modelName,
    prompt: config.prompt || "",
  };

  // response_format 和 watermark 仅对 /images/generations 有效
  if (!hasReference) {
    body.response_format = "url";
    body.watermark = false;
  }

  // 参考图片处理
  if (hasReference) {
    // 保留 data URI 头，部分后端需要通过头部识别图片格式
    const images = config.referenceList!.map((ref) => ref.base64);
    body.image = images.length === 1 ? images[0] : images;
    logger(`[图片生成] 参考图片数量: ${images.length}, 首张图片base64长度: ${images[0]?.length || 0}, 首张前50字符: ${images[0]?.substring(0, 50) || "空"}`);
  } else if (isEditOnly) {
    throw new Error(`${model.name} 需要至少一张参考图片`);
  }

  // 尺寸处理：按模型分派不同的分辨率策略
  const [aw, ah] = config.aspectRatio.split(":").map(Number);
  const targetRatio = aw / ah;

  if (model.modelName === "qwen-image") {
    // qwen-image 仅支持固定分辨率
    const qwenResolutions = [
      { size: "1024x1024", ratio: 1 },
      { size: "1280x720", ratio: 16 / 9 },
      { size: "1792x1008", ratio: 16 / 9 },
      { size: "720x1280", ratio: 9 / 16 },
      { size: "1008x1792", ratio: 9 / 19 },
    ];
    let best = qwenResolutions[0];
    let minDiff = Math.abs(best.ratio - targetRatio);
    for (const r of qwenResolutions) {
      const diff = Math.abs(r.ratio - targetRatio);
      if (diff < minDiff) {
        minDiff = diff;
        best = r;
      }
    }
    const sameRatio = qwenResolutions.filter((r) => Math.abs(r.ratio - best.ratio) < 0.01);
    if (sameRatio.length > 1) {
      best = config.size === "1K" ? sameRatio[0] : sameRatio[sameRatio.length - 1];
    }
    body.size = best.size;
  } else if (model.modelName === "ernie-image-turbo") {
    // ernie-image-turbo 支持固定宽高比到分辨率的映射
    const ernieTable: Record<string, string> = {
      "1:1": "1024x1024",
      "3:2": "1280x830",
      "4:3": "1152x896",
      "16:9": "1344x768",
      "2:3": "830x1280",
      "3:4": "896x1152",
      "9:16": "768x1344",
    };
    if (ernieTable[config.aspectRatio]) {
      body.size = ernieTable[config.aspectRatio];
    } else {
      const ernieList = [
        { ratio: 1, size: "1024x1024" },
        { ratio: 3 / 2, size: "1280x830" },
        { ratio: 4 / 3, size: "1152x896" },
        { ratio: 16 / 9, size: "1344x768" },
        { ratio: 2 / 3, size: "830x1280" },
        { ratio: 3 / 4, size: "896x1152" },
        { ratio: 9 / 16, size: "768x1344" },
      ];
      let best = ernieList[0];
      let minDiff = Math.abs(best.ratio - targetRatio);
      for (const r of ernieList) {
        const diff = Math.abs(r.ratio - targetRatio);
        if (diff < minDiff) {
          minDiff = diff;
          best = r;
        }
      }
      body.size = best.size;
    }
  } else if (model.modelName === "hunyuan-image-3") {
    // hunyuan-image-3：文生图和图生图使用不同分辨率策略
    if (hasReference) {
      // 图生图模式：固定 1280x720
      body.size = "1280x720";
    } else {
      // 文生图模式：按宽高比映射固定分辨率
      const hunyuanTextTable: Record<string, string> = {
        "1:1": "1024x1024",
        "3:4": "896x1152",
        "4:3": "1152x896",
        "9:16": "720x1280",
        "16:9": "1280x720",
      };
      if (hunyuanTextTable[config.aspectRatio]) {
        body.size = hunyuanTextTable[config.aspectRatio];
      } else {
        // 不支持的宽高比，找最接近的
        const hunyuanList = [
          { ratio: 1, size: "1024x1024" },
          { ratio: 3 / 4, size: "896x1152" },
          { ratio: 4 / 3, size: "1152x896" },
          { ratio: 9 / 16, size: "720x1280" },
          { ratio: 16 / 9, size: "1280x720" },
        ];
        let best = hunyuanList[0];
        let minDiff = Math.abs(best.ratio - targetRatio);
        for (const r of hunyuanList) {
          const diff = Math.abs(r.ratio - targetRatio);
          if (diff < minDiff) {
            minDiff = diff;
            best = r;
          }
        }
        body.size = best.size;
      }
    }
  } else if (model.modelName === "qwen-image-edit") {
    // qwen-image-edit：图生图/单图参考/多图参考，固定分辨率 1664x928
    body.size = "1664x928";
  } else {
    // 其他模型（如 Seedream-4.0）使用 sizeTable 像素值映射
    const sizeTable: Record<string, Record<string, string>> = {
      "1K": {
        "1:1": "1024x1024",
        "4:3": "1152x864",
        "3:4": "864x1152",
        "16:9": "1280x720",
        "9:16": "720x1280",
        "3:2": "1248x832",
        "2:3": "832x1248",
        "21:9": "1512x648",
      },
      "2K": {
        "1:1": "2048x2048",
        "4:3": "2304x1728",
        "3:4": "1728x2304",
        "16:9": "2848x1600",
        "9:16": "1600x2848",
        "3:2": "2496x1664",
        "2:3": "1664x2496",
        "21:9": "3136x1344",
      },
      "4K": {
        "1:1": "4096x4096",
        "4:3": "4704x3520",
        "3:4": "3520x4704",
        "16:9": "5504x3040",
        "9:16": "3040x5504",
        "3:2": "4992x3328",
        "2:3": "3328x4992",
        "21:9": "6240x2656",
      },
    };
    const sizeKey = config.size || "2K";
    const ratioKey = config.aspectRatio;
    const table = sizeTable[sizeKey];
    if (table && table[ratioKey]) {
      body.size = table[ratioKey];
    } else {
      body.size = sizeKey;
    }
  }

  logger(`[图片生成] 请求模型: ${model.modelName}, 尺寸: ${body.size}, 模式: ${hasReference ? "图生图" : "文生图"}, URL: ${requestUrl}`);
  const res = await fetch(requestUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`图片生成请求失败: ${errorText}`);
  }
  const response = await res.json();
  logger(response);

  if (response?.error) {
    throw new Error(`图片生成失败：${response.error.message || response.error.code}`);
  }

  if (response?.data && response.data.length > 0) {
    for (const item of response.data) {
      if (item.url) {
        return await urlToBase64(item.url);
      }
      if (item.b64_json) {
        return item.b64_json;
      }
      if (item.error) {
        throw new Error(`图片生成失败：${item.error.message || item.error.code}`);
      }
    }
  }

  throw new Error("图片生成失败：未返回有效结果");
};

const videoRequest = async (config: VideoConfig, model: VideoModel): Promise<string> => {
  return "";
};

const ttsRequest = async (config: TTSConfig, model: TTSModel): Promise<string> => {
  return "";
};

const checkForUpdates = async (): Promise<{ hasUpdate: boolean; latestVersion: string; notice: string }> => {
  return { hasUpdate: false, latestVersion: "2.0", notice: "## 新版本更新公告" };
};

const updateVendor = async (): Promise<string> => {
  return "";
};

// ============================================================
// 导出
// ============================================================

exports.vendor = vendor;
exports.textRequest = textRequest;
exports.imageRequest = imageRequest;
exports.videoRequest = videoRequest;
exports.ttsRequest = ttsRequest;
exports.checkForUpdates = checkForUpdates;
exports.updateVendor = updateVendor;

// 这行代码用于确保当前文件被识别为模块，避免全局变量冲突
export { };
