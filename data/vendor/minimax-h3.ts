/**
 * Toonflow AI供应商模板 - MiniMax-H3 (本地部署)
 * @version 3.11
 * 仅支持视频生成：minimax-h3-fl2va / minimax-h3-ref2va
 * modelName 格式：{实际模型名}:{模式后缀}，用于同模型多模式去重
 *
 * API 端点（MaaS /v1/videos 格式）：
 *   提交任务: POST /v1/videos
 *     请求体: {model, group:"default", prompt, metadata:{task_type, ratio, ...}, size, duration, [image|images]}
 *     metadata.task_type: t2v(文生) / i2v(图生) / flf2v(首尾帧) / r2va(参考生)
 *     注意: task_type 必须放在 metadata 内，放在顶层服务端不识别（ref2va 模型除外，会从模型名自动推断）
 *   查询状态: GET  /v1/videos/{task_id}
 *     成功时: status="completed", metadata.url=视频下载地址
 *   下载视频: GET  /v1/videos/{task_id}/content  (302重定向)
 */

// ============================================================
// 类型定义（仅视频相关）
// ============================================================

type VideoMode =
  | "singleImage"
  | "startEndRequired"
  | "endFrameOptional"
  | "startFrameOptional"
  | "text"
  | (`videoReference:${number}` | `imageReference:${number}` | `audioReference:${number}`)[];

interface VideoModel {
  name: string;
  modelName: string;
  type: "video";
  mode: VideoMode[];
  associationSkills?: string;
  audio: "optional" | false | true;
  durationResolutionMap: { duration: number[]; resolution: string[] }[];
  /** 每种尺寸支持的宽高比列表，未声明则不限制 */
  aspectRatioMap?: { resolution: string; ratios: string[] }[];
}

interface VendorConfig {
  id: string;
  version: string;
  name: string;
  author: string;
  description?: string;
  icon?: string;
  inputs: { key: string; label: string; type: "text" | "password" | "url"; required: boolean; placeholder?: string }[];
  inputValues: Record<string, string>;
  models: VideoModel[];
}

type ReferenceList =
  | { type: "image"; sourceType: "base64"; base64: string }
  | { type: "audio"; sourceType: "base64"; base64: string }
  | { type: "video"; sourceType: "base64"; base64: string };

interface VideoConfig {
  duration: number;
  resolution: string;
  aspectRatio: string;
  prompt: string;
  referenceList?: ReferenceList[];
  audio?: boolean;
  mode: VideoMode[];
}

interface PollResult {
  completed: boolean;
  data?: string;
  error?: string;
}

// ============================================================
// 全局声明
// ============================================================

declare const axios: any;
declare const logger: (msg: string) => void;
declare const zipImage: (base64: string, size: number) => Promise<string>;
declare const urlToBase64: (url: string) => Promise<string>;
declare const pollTask: (fn: () => Promise<PollResult>, interval?: number, timeout?: number) => Promise<PollResult>;

// ============================================================
// 供应商配置
// ============================================================

const vendor: VendorConfig = {
  id: "minimax-h3",
  version: "3.11",
  author: "Toonflow",
  name: "MiniMax-H3",
  description: "MiniMax-H3 视频生成接口适配，支持文生视频、图生视频、首尾帧生视频、参考生视频（声音+图片参考）能力",
  inputs: [
    { key: "apiKey", label: "API密钥", type: "password", required: true },
    { key: "baseUrl", label: "请求地址", type: "url", required: true, placeholder: "https://maas.ovaijisuan.com" },
  ],
  inputValues: { apiKey: "", baseUrl: "https://maas.ovaijisuan.com" },
  models: [
    // ===== minimax-h3-fl2va：文生视频 =====
    {
      name: "MiniMax-H3 文生视频",
      modelName: "minimax-h3-fl2va:text",
      type: "video",
      mode: ["text"],
      audio: false,
      durationResolutionMap: [
        { duration: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], resolution: ["480P", "768P"] },
      ],
      // 文生视频：480P/768P 均支持 1:1, 3:4, 9:16, 4:3, 16:9
      aspectRatioMap: [
        { resolution: "480P", ratios: ["1:1", "3:4", "9:16", "4:3", "16:9"] },
        { resolution: "768P", ratios: ["1:1", "3:4", "9:16", "4:3", "16:9"] },
      ],
    },
    // ===== minimax-h3-fl2va：单图生视频 =====
    {
      name: "MiniMax-H3 图生视频",
      modelName: "minimax-h3-fl2va:singleImage",
      type: "video",
      mode: ["singleImage"],
      audio: false,
      durationResolutionMap: [
        { duration: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], resolution: ["768P"] },
      ],
      // 单图生视频：仅 768P，仅支持 9:16, 16:9
      aspectRatioMap: [
        { resolution: "768P", ratios: ["9:16", "16:9"] },
      ],
    },
    // ===== minimax-h3-fl2va：首尾帧生视频 =====
    {
      name: "MiniMax-H3 首尾帧生视频",
      modelName: "minimax-h3-fl2va:startEnd",
      type: "video",
      mode: ["startEndRequired"],
      audio: false,
      durationResolutionMap: [
        { duration: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], resolution: ["768P"] },
      ],
      // 首尾帧生视频：仅 768P，仅支持 9:16, 16:9
      aspectRatioMap: [
        { resolution: "768P", ratios: ["9:16", "16:9"] },
      ],
    },
    // ===== minimax-h3-ref2va：参考生视频（3张图片 + 声音参考） =====
    {
      name: "MiniMax-H3 参考生视频",
      modelName: "minimax-h3-ref2va:ref",
      type: "video",
      mode: [["imageReference:3", "audioReference:1"]],
      audio: true,
      durationResolutionMap: [
        { duration: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], resolution: ["480P", "768P"] },
      ],
      // 参考生视频：480P/768P，宽高比沿用文生视频（全支持）
      aspectRatioMap: [
        { resolution: "480P", ratios: ["1:1", "3:4", "9:16", "4:3", "16:9"] },
        { resolution: "768P", ratios: ["1:1", "3:4", "9:16", "4:3", "16:9"] },
      ],
    },
  ],
};

// ============================================================
// 辅助工具
// ============================================================

/** 获取请求头 */
const getHeaders = (): Record<string, string> => {
  const apiKey = vendor.inputValues.apiKey.replace(/^Bearer\s+/i, "");
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
};

/** 获取基础请求地址（去掉末尾斜杠） */
const getBaseUrl = (): string => {
  return vendor.inputValues.baseUrl.replace(/\/$/, "");
};

/** 从 ReferenceList 中提取带 MIME 头的 base64 */
const extractBase64WithHead = (ref: ReferenceList): string => {
  if (ref.base64.startsWith("data:")) return ref.base64;
  if (ref.type === "image") return `data:image/png;base64,${ref.base64}`;
  if (ref.type === "audio") return `data:audio/wav;base64,${ref.base64}`;
  return `data:video/mp4;base64,${ref.base64}`;
};

/** 从 modelName 中解析出实际模型名（去掉冒号后缀） */
const parseModelName = (modelName: string): string => {
  const colonIdx = modelName.indexOf(":");
  return colonIdx > -1 ? modelName.substring(0, colonIdx) : modelName;
};

// ============================================================
// 适配器函数
// ============================================================

/** 上传引用资源（图片压缩，音频/视频原样返回） */
const uploadReference = async (base64: string, fileType: "image" | "audio" | "video"): Promise<ReferenceList> => {
  if (fileType === "image") {
    const compressed = await zipImage(base64, 20 * 1024); // 压缩到 20MB
    return { type: "image", sourceType: "base64", base64: compressed };
  }
  return { type: fileType, sourceType: "base64", base64 } as ReferenceList;
};

/** 视频生成主函数 */
const videoRequest = async (config: VideoConfig, model: VideoModel): Promise<string> => {
  if (!vendor.inputValues.apiKey) throw new Error("缺少API Key");
  const baseUrl = getBaseUrl();
  const headers = getHeaders();

  // 解析出实际模型名（去掉冒号模式后缀）
  const actualModelName = parseModelName(model.modelName);

  // ---------- 判断模式，映射到 API task_type ----------
  // API task_type（metadata 内）: t2v(文生) / i2v(图生) / flf2v(首尾帧) / r2va(参考生)
  // 注意：服务端允许的 task_type 列表中是 r2va，不是 ref2va
  const currentMode = config.mode;
  const isSingleImage = currentMode.includes("singleImage");
  const isStartEndRequired = currentMode.includes("startEndRequired");
  // 检测多参考模式：config.mode 可能是扁平数组如 ["imageReference:3", "audioReference:1"]
  // 也可能是嵌套数组如 [["imageReference:3", "audioReference:1"]]
  const hasMultiRef = Array.isArray(currentMode) && currentMode.some((m) =>
    typeof m === "string" && (
      m.startsWith("imageReference:") ||
      m.startsWith("videoReference:") ||
      m.startsWith("audioReference:")
    ) || Array.isArray(m)
  );

  let taskType: string;
  if (hasMultiRef) {
    taskType = "r2va";
  } else if (isStartEndRequired) {
    taskType = "flf2v";
  } else if (isSingleImage) {
    taskType = "i2v";
  } else {
    taskType = "t2v";
  }

  // ---------- 提取图片/音频引用 ----------
  const imageRefs = (config.referenceList || []).filter((r) => r.type === "image");

  // ---------- 宽高比校验 ----------
  const ratio = config.aspectRatio || "16:9";
  const sizeConfig = config.resolution || "480P";
  if (model.aspectRatioMap) {
    const ratioEntry = model.aspectRatioMap.find((m) => m.resolution === sizeConfig);
    if (ratioEntry && !ratioEntry.ratios.includes(ratio)) {
      throw new Error(`当前模式在 ${sizeConfig} 下不支持宽高比 ${ratio}，支持的宽高比：${ratioEntry.ratios.join(", ")}`);
    }
  }

  // ---------- 完整构建 metadata（task_type + ratio + 模式特定字段） ----------
  // 关键：task_type 必须放在 metadata 内，不能放在请求体顶层
  // fl2va 模型支持多种 task，服务端只从 metadata.task_type 读取
  // ref2va 模型从模型名自动推断，但放 metadata 里也兼容
  const metadata: any = { task_type: taskType, ratio };
  // 顶层图片/图片数组字段（i2v/flf2v 用，不放 metadata）
  let topLevelImage: string | undefined;
  let topLevelImages: string[] | undefined;

  if (taskType === "i2v" && imageRefs.length > 0) {
    // 单图生视频：image 顶层字段
    topLevelImage = await zipImage(extractBase64WithHead(imageRefs[0]), 20 * 1024);
  } else if (taskType === "flf2v") {
    // 首尾帧生视频：images 顶层数组 [首帧, 尾帧]
    if (imageRefs.length < 2) throw new Error("首尾帧模式需要上传两张图片");
    topLevelImages = [
      await zipImage(extractBase64WithHead(imageRefs[0]), 20 * 1024),
      await zipImage(extractBase64WithHead(imageRefs[1]), 20 * 1024),
    ];
  } else if (taskType === "r2va") {
    // 参考生视频：最多 3 张图片 + 1 个声音参考
    if (imageRefs.length === 0) throw new Error("参考生视频需要至少上传一张图片");
    const refImages: string[] = [];
    for (const ref of imageRefs.slice(0, 3)) {
      refImages.push(await zipImage(extractBase64WithHead(ref), 20 * 1024));
    }
    // 始终用数组格式
    metadata.src_ref_images = refImages;

    // 声音参考
    const audioRefs = (config.referenceList || []).filter((r) => r.type === "audio");
    if (audioRefs.length > 0) {
      metadata.src_ref_audio = extractBase64WithHead(audioRefs[0]);
    }
  }

  // ---------- 构建请求体（MaaS API 格式） ----------
  // task_type 在 metadata 内，不放顶层
  const reqBody: any = {
    model: actualModelName,
    group: "default",
    prompt: config.prompt,
    metadata,
    size: config.resolution || "480P",
    duration: config.duration,
  };
  if (topLevelImage) reqBody.image = topLevelImage;
  if (topLevelImages) reqBody.images = topLevelImages;

  // ---------- 提交任务 ----------
  logger("开始提交 MiniMax-H3 视频生成任务");
  logger(`请求参数: task_type=${taskType}, ratio=${ratio}, size=${reqBody.size}, duration=${config.duration}s`);
  logger(`metadata: ${JSON.stringify(Object.keys(metadata))}`);
  logger(`imageRefs: ${imageRefs.length}, referenceList: ${(config.referenceList || []).length}`);

  const submitResp = await axios.post(`${baseUrl}/v1/videos`, reqBody, { headers });

  // 提取 task_id
  const taskId = submitResp.data.task_id || submitResp.data.id;
  if (!taskId) {
    const errMsg = submitResp.data.message || submitResp.data.error ||
      JSON.stringify(submitResp.data);
    throw new Error(`任务提交失败：${errMsg}`);
  }
  logger(`视频任务提交成功，任务ID: ${taskId}`);

  // ---------- 轮询任务状态 ----------
  const queryUrl = `${baseUrl}/v1/videos/${taskId}`;
  logger(`轮询URL: ${queryUrl}`);

  let videoUrl = ""; // 从轮询响应中提取视频下载地址

  const pollResult = await pollTask(
    async () => {
      try {
        const queryResp = await axios.get(queryUrl, { headers });
        const data = queryResp.data;
        logger(`轮询响应: ${JSON.stringify(data)}`);

        const status = data.status;
        const lowerStatus = String(status || "").toLowerCase();

        // 成功
        if (lowerStatus === "completed" || lowerStatus === "success" ||
          lowerStatus === "succeed" || lowerStatus === "succeeded" ||
          lowerStatus === "done" || lowerStatus === "finished") {
          // 视频URL在 metadata.url 中
          videoUrl = data.metadata?.url || "";
          return { completed: true, data: taskId };
        }

        // 失败
        if (lowerStatus === "failed" || lowerStatus === "fail" ||
          lowerStatus === "failure" || lowerStatus === "error") {
          const errMsg = data.metadata?.url || data.error || data.message ||
            data.fail_reason || "未知错误";
          return { completed: true, error: `视频生成失败：${errMsg}` };
        }

        logger(`视频任务生成中，状态：${status || "Unknown"}，进度：${data.progress ?? 0}%`);
        return { completed: false };
      } catch (e: any) {
        logger(`轮询请求异常: ${e.message || e}`);
        return { completed: false };
      }
    },
    5000,    // 每 5 秒轮询
    600000,  // 超时 10 分钟
  );

  if (pollResult.error) throw new Error(pollResult.error);
  if (!pollResult.completed) throw new Error("视频生成超时，请稍后重试");
  logger("视频任务生成成功");

  // ---------- 获取视频下载地址 ----------
  // 优先使用轮询响应中的 metadata.url
  let downloadUrl: string | undefined;

  if (videoUrl && videoUrl.startsWith("http")) {
    downloadUrl = videoUrl;
    logger(`从轮询响应获取下载地址: ${downloadUrl}`);
  } else {
    // 备选：通过 content 端点 302 重定向获取
    const contentUrl = `${baseUrl}/v1/videos/${taskId}/content`;
    logger(`通过 content 端点获取下载地址: ${contentUrl}`);

    try {
      const contentResp = await axios.get(contentUrl, {
        headers: getHeaders(),
        maxRedirects: 0,
        validateStatus: (s: number) => s >= 200 && s < 400,
      });

      if ((contentResp.status === 301 || contentResp.status === 302) && contentResp.headers.location) {
        downloadUrl = contentResp.headers.location;
        logger(`${contentResp.status}重定向地址: ${downloadUrl}`);
      } else if (contentResp.data?.url) {
        downloadUrl = contentResp.data.url;
      } else if (contentResp.data?.download_url) {
        downloadUrl = contentResp.data.download_url;
      }
    } catch (e: any) {
      logger(`content 端点请求异常: ${e.message || e}`);
    }
  }

  if (!downloadUrl) {
    throw new Error("获取视频下载地址失败，请检查任务状态");
  }
  logger("视频下载地址获取成功，开始转 Base64");

  return await urlToBase64(downloadUrl);
};

// ============================================================
// 非视频功能桩函数（系统兼容）
// ============================================================

const textRequest = (): never => {
  throw new Error("MiniMax-H3 供应商仅支持视频生成，不支持文本模型");
};

const imageRequest = async (): Promise<never> => {
  throw new Error("MiniMax-H3 供应商仅支持视频生成，不支持图片模型");
};

const ttsRequest = async (): Promise<never> => {
  throw new Error("MiniMax-H3 供应商仅支持视频生成，不支持语音合成");
};

// ============================================================
// 导出
// ============================================================

exports.vendor = vendor;
exports.textRequest = textRequest;
exports.uploadReference = uploadReference;
exports.imageRequest = imageRequest;
exports.videoRequest = videoRequest;
exports.ttsRequest = ttsRequest;

// 确保当前文件被识别为模块
export { };
