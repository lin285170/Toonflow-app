/**
 * Toonflow AI供应商模板 - ComfyUI (Krea2 4K 文生图)
 * @version 1.0
 *
 * 说明：
 * 1) 调用本地/远程 ComfyUI 服务器的 HTTP API（/prompt、/history、/view）
 * 2) 内置 Krea2 Turbo 文生图 + SeedVR2 4K 放大工作流
 * 3) 用户提示词注入工作流节点 30:19，分辨率/尺寸/种子自动映射
 */

// ============================================================
// 类型定义
// ============================================================

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

type VideoMode =
  | "singleImage"
  | "startEndRequired"
  | "endFrameOptional"
  | "startFrameOptional"
  | "text"
  | (`videoReference:${number}` | `imageReference:${number}` | `audioReference:${number}`)[];

interface TTSModel {
  name: string;
  modelName: string;
  type: "tts";
  voices: { title: string; voice: string }[];
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

declare const fetch: any;
declare const logger: (msg: string) => void;
declare const pollTask: (fn: () => Promise<PollResult>, interval?: number, timeout?: number) => Promise<PollResult>;
declare const exports: {
  vendor: VendorConfig;
  textRequest: (m: TextModel, t: boolean, tl: 0 | 1 | 2 | 3) => any;
  imageRequest: (c: ImageConfig, m: ImageModel) => Promise<string>;
  videoRequest: (c: VideoConfig, m: VideoModel) => Promise<string>;
  ttsRequest: (c: TTSConfig, m: TTSModel) => Promise<string>;
};

// ============================================================
// Krea2 4K 文生图工作流（来自 API-krea2_4k.json，base64 内联）
// ============================================================

const KREA2_WORKFLOW_B64 = "eyI0OSI6eyJpbnB1dHMiOnsiYXNwZWN0X3JhdGlvIjoiMTY6OSAoV2lkZXNjcmVlbikiLCJtZWdhcGl4ZWxzIjoxLCJtdWx0aXBsZSI6OH0sImNsYXNzX3R5cGUiOiJSZXNvbHV0aW9uU2VsZWN0b3IiLCJfbWV0YSI6eyJ0aXRsZSI6IuWIhui+qOeOh+mAieaLqeWZqCJ9fSwiNTEiOnsiaW5wdXRzIjp7InNlZWQiOjc5NjkzMTAwNzQ1NDY3OH0sImNsYXNzX3R5cGUiOiJlYXN5IHNlZWQiLCJfbWV0YSI6eyJ0aXRsZSI6Iumaj+acuuenjSJ9fSwiNTgiOnsiaW5wdXRzIjp7Im1vZGVsIjoic2VlZHZyMl9lbWFfN2JfZnAxNi5zYWZldGVuc29ycyIsImRldmljZSI6ImN1ZGE6MCIsImJsb2Nrc190b19zd2FwIjozNiwic3dhcF9pb19jb21wb25lbnRzIjp0cnVlLCJvZmZsb2FkX2RldmljZSI6ImNwdSIsImNhY2hlX21vZGVsIjoic2RwYSIsImF0dGVudGlvbl9tb2RlIjoic2RwYSJ9LCJjbGFzc190eXBlIjoiU2VlZFZSMkxvYWREaVRNb2RlbCIsIl9tZXRhIjp7InRpdGxlIjoiU2VlZFZSMiAoRG93bilMb2FkIERpVCBNb2RlbCJ9fSwiNTkiOnsiaW5wdXRzIjp7Im1vZGVsIjoiZW1hX3ZhZV9mcDE2LnNhZmV0ZW5zb3JzIiwiZGV2aWNlIjoiY3VkYTowIiwiZW5jb2RlX3RpbGVkIjp0cnVlLCJlbmNvZGVfdGlsZV9zaXplIjoxMDI0LCJlbmNvZGVfdGlsZV9vdmVybGFwIjoxMjgsImRlY29kZV90aWxlZCI6dHJ1ZSwiZGVjb2RlX3RpbGVfc2l6ZSI6MTAyNCwiZGVjb2RlX3RpbGVfb3ZlcmxhcCI6MTI4LCJ0aWxlX2RlYnVnIjoiZmFsc2UiLCJvZmZsb2FkX2RldmljZSI6ImNwdSIsImNhY2hlX21vZGVsIjpmYWxzZX0sImNsYXNzX3R5cGUiOiJTZWVkVlIyTG9hZFZBRU1vZGVsIiwiX21ldGEiOnsidGl0bGUiOiJTZWVkVlIyIChEb3duKUxvYWQgVkFFIE1vZGVsIn19LCI2MCI6eyJpbnB1dHMiOnsic2VlZCI6MTU3MDc4MTI2NSwicmVzb2x1dGlvbiI6MjE2MCwibWF4X3Jlc29sdXRpb24iOjAsImJhdGNoX3NpemUiOjEsInVuaWZvcm1fYmF0Y2hfc2l6ZSI6ZmFsc2UsImNvbG9yX2NvcnJlY3Rpb24iOiJub25lIiwidGVtcG9yYWxfb3ZlcmxhcCI6MCwicHJlcGVuZF9mcmFtZXMiOjAsImlucHV0X25vaXNlX3NjYWxlIjowLCJsYXRlbnRfbm9pc2Vfc2NhbGUiOjAsIm9mZmxvYWRfZGV2aWNlIjoiY3B1IiwiZW5hYmxlX2RlYnVnIjpmYWxzZSwiaW1hZ2UiOlsiMzA6OCIsMF0sImRpdCI6WyI1OCIsMF0sInZhZSI6WyI1OSIsMF19LCJjbGFzc190eXBlIjoiU2VlZFZSMlZpZGVvVXBzY2FsZXIiLCJfbWV0YSI6eyJ0aXRsZSI6IlNlZWRWUjIgVmlkZW8gVXBzY2FsZXIgKHYyLjUuMjIpIn19LCI2MSI6eyJpbnB1dHMiOnsiZmlsZW5hbWVfcHJlZml4IjoiQ29tZnlVSSIsImltYWdlcyI6WyI2MCIsMF19LCJjbGFzc190eXBlIjoiU2F2ZUltYWdlIiwiX21ldGEiOnsidGl0bGUiOiLkv53lrZjlm77lg48ifX0sIjYyIjp7ImlucHV0cyI6eyJpbWFnZXMiOlsiMzA6OCIsMF19LCJjbGFzc190eXBlIjoiUHJldmlld0ltYWdlIiwiX21ldGEiOnsidGl0bGUiOiLpooTop4jlm77lg48ifX0sIjMwOjYiOnsiaW5wdXRzIjp7InRleHQiOlsiMzA6MjgiLDBdLCJjbGlwIjpbIjMwOjExIiwwXX0sImNsYXNzX3R5cGUiOiJDTElQVGV4dEVuY29kZSIsIl9tZXRhIjp7InRpdGxlIjoiQ0xJUOaWh+acrOe8lueggSJ9fSwiMzA6NSI6eyJpbnB1dHMiOnsid2lkdGgiOlsiNDkiLDBdLCJoZWlnaHQiOlsiNDkiLDFdLCJiYXRjaF9zaXplIjoxfSwiY2xhc3NfdHlwZSI6IkVtcHR5TGF0ZW50SW1hZ2UiLCJfbWV0YSI6eyJ0aXRsZSI6IuepukxhdGVudOWbvuWDjyJ9fSwiMzA6OCI6eyJpbnB1dHMiOnsic2FtcGxlcyI6WyIzMDozIiwwXSwidmFlIjpbIjMwOjEyIiwwXX0sImNsYXNzX3R5cGUiOiJWQUVEZWNvZGUiLCJfbWV0YSI6eyJ0aXRsZSI6IlZBReino+eggSJ9fSwiMzA6MTAiOnsiaW5wdXRzIjp7InVuZXRfbmFtZSI6ImtyZWEyX3R1cmJvX2JmMTYuc2FmZXRlbnNvcnMiLCJ3ZWlnaHRfZHR5cGUiOiJkZWZhdWx0In0sImNsYXNzX3R5cGUiOiJVTkVUTG9hZGVyIiwiX21ldGEiOnsidGl0bGUiOiJVTmV05Yqg6L295ZmoIn19LCIzMDoxMSI6eyJpbnB1dHMiOnsiY2xpcF9uYW1lIjoicXdlbjN2bF80Yl9iZjE2LnNhZmV0ZW5zb3JzIiwidHlwZSI6ImtyZWEyIiwiZGV2aWNlIjoiZGVmYXVsdCJ9LCJjbGFzc190eXBlIjoiQ0xJUExvYWRlciIsIl9tZXRhIjp7InRpdGxlIjoi5Yqg6L29Q0xJUCJ9fSwiMzA6MTIiOnsiaW5wdXRzIjp7InZhZV9uYW1lIjoicXdlbl9pbWFnZV92YWUuc2FmZXRlbnNvcnMifSwiY2xhc3NfdHlwZSI6IlZBRUxvYWRlciIsIl9tZXRhIjp7InRpdGxlIjoi5Yqg6L29VkFFIn19LCIzMDoxMyI6eyJpbnB1dHMiOnsiY29uZGl0aW9uaW5nIjpbIjMwOjYiLDBdfSwiY2xhc3NfdHlwZSI6IkNvbmRpdGlvbmluZ1plcm9PdXQiLCJfbWV0YSI6eyJ0aXRsZSI6IuadoeS7tumbtuWMliJ9fSwiMzA6MTUiOnsiaW5wdXRzIjp7ImxvcmFfbmFtZSI6IktyZWEtMi1UdXJib19YaWFuWGlhX0ZhaXJ5X011Z2lfdjEuMF9jMS1zdDEwMDAwLnNhZmV0ZW5zb3JzIiwic3RyZW5ndGhfbW9kZWwiOjAuOCwibW9kZWwiOlsiMzA6MTAiLDBdfSwiY2xhc3NfdHlwZSI6IkxvcmFMb2FkZXJNb2RlbE9ubHkiLCJfbWV0YSI6eyJ0aXRsZSI6IkxvUkHliqDovb3lmajvvIjku4XmqKHlnovvvIkifX0sIjMwOjE2Ijp7ImlucHV0cyI6eyJwcm9tcHQiOlsiMzA6MTciLDBdLCJtYXhfbGVuZ3RoIjo1MTIsInNhbXBsaW5nX21vZGUiOiJvbiIsInNhbXBsaW5nX21vZGUudGVtcGVyYXR1cmUiOjAuNywic2FtcGxpbmdfbW9kZS50b3BfayI6NjQsInNhbXBsaW5nX21vZGUudG9wX3AiOjAuOTUsInNhbXBsaW5nX21vZGUubWluX3AiOjAuMDUsInNhbXBsaW5nX21vZGUucmVwZXRpdGlvbl9wZW5hbHR5IjoxLjA1LCJzYW1wbGluZ19tb2RlLnNlZWQiOjAsInNhbXBsaW5nX21vZGUucHJlc2VuY2VfcGVuYWx0eSI6MCwidGhpbmtpbmciOmZhbHNlLCJ1c2VfZGVmYXVsdF90ZW1wbGF0ZSI6dHJ1ZSwiY2xpcCI6WyIzMDoxMSIsMF19LCJjbGFzc190eXBlIjoiVGV4dEdlbmVyYXRlIiwiX21ldGEiOnsidGl0bGUiOiJUZXh0R2VuZXJhdGUifX0sIjMwOjE3Ijp7ImlucHV0cyI6eyJzdHJpbmdfYSI6WyIzMDoxOCIsMF0sInN0cmluZ19iIjpbIjMwOjE5IiwwXSwiZGVsaW1pdGVyIjoiIn0sImNsYXNzX3R5cGUiOiJTdHJpbmdDb25jYXRlbmF0ZSIsIl9tZXRhIjp7InRpdGxlIjoi6L+e5o6lIn19LCIzMDoxOCI6eyJpbnB1dHMiOnsidmFsdWUiOiJZb3UgYXJlIGFuIGV4cGVydCBwcm9tcHQgZW5naW5lZXIgZm9yIHRleHQtdG8taW1hZ2UgbW9kZWxzLiBZb3VyIHRhc2sgaXMgdG8gZXhwYW5kIHRoZSB1c2VyJ3MgcHJvbXB0IGludG8gYSBoaWdobHkgZWZmZWN0aXZlIGltYWdlLWdlbmVyYXRpb24gcHJvbXB0LlxuXG5UaGluayBzdGVwIGJ5IHN0ZXAgYWJvdXQgdGhlIHJlcXVlc3QgYmVmb3JlIHdyaXRpbmcgdGhlIGFuc3dlcjpcbi0gV2hhdCBpcyB0aGUgc3ViamVjdCBhbmQgbW9vZD9cbi0gV2hhdCB2aXN1YWwgc3R5bGVzLCBtZWRpdW1zLCBhbmQgbGlnaHRpbmcgb3B0aW9ucyB3b3VsZCBmaXQ/IENvbnNpZGVyIHR3byBvciB0aHJlZSBhbHRlcm5hdGl2ZXMgYW5kIHBpY2sgdGhlIG9uZSB0aGF0IGJlc3Qgc2VydmVzIHRoZSBjYXB0aW9uLlxuLSBXaGF0IGNvbXBvc2l0aW9uLCBmcmFtaW5nLCBhbmQgZ3JvdW5kZWQgZGV0YWlscyB3aWxsIGhlbHAgdGhlIHRleHQtdG8taW1hZ2UgbW9kZWw/XG5cblRoZW4gb3V0cHV0IGEgc2luZ2xlIGV4cGFuZGVkIHByb21wdCBwYXJhZ3JhcGguXG5cbkZvbGxvdyB0aGVzZSBydWxlcyBzdHJpY3RseTpcbjEuICoqRmFpdGhmdWxuZXNzIEZpcnN0OioqIFByZXNlcnZlIGFsbCBvcmlnaW5hbCBzdWJqZWN0cywgYWN0aW9ucywgY29sb3JzLCBhbmQgc3BhdGlhbCByZWxhdGlvbnNoaXBzLiBEbyBub3QgYWRkIG5ldyBvYmplY3RzLCBwcm9wcywgY2hhcmFjdGVycywgb3IgYW5pbWFscyB1bmxlc3MgdGhlIHVzZXIgY2xlYXJseSBpbXBsaWVzIHRoZW0uXG4yLiAqKlByYWN0aWNhbCBUMkkgU3RydWN0dXJlOioqIFdyaXRlIGEgcHJvbXB0IHRoYXQgYSB0ZXh0LXRvLWltYWdlIG1vZGVsIGNhbiBwYXJzZSBjbGVhbmx5LiBHcm91cCBzdWJqZWN0cyB3aXRoIHRoZWlyIG93biBhdHRyaWJ1dGVzIGFuZCBhY3Rpb25zLiBVc2UgZ3JvdW5kZWQgcGhyYXNpbmcgZm9yIHBvc2VzLCBpbnRlcmFjdGlvbnMsIGFuZCBzcGF0aWFsIGxheW91dC5cbjMuICoqU3R5bGUgUGxhbm5pbmcgU3RheXMgSW50ZXJuYWw6KiogVXNlIHlvdXIgaW50ZXJuYWwgcmVhc29uaW5nIHRvIGNob29zZSBzdHlsZSwgbWVkaXVtLCBmcmFtaW5nLCBhbmQgbGlnaHRpbmcuIERvIG5vdCBlbWl0IHBsYW5uaW5nIHRhZ3Mgb3Igd3JhcHBlcnMgaW4gdGhlIHZpc2libGUgYW5zd2VyIGJvZHkuXG40LiAqKlRleHQgUmVuZGVyaW5nOioqIElmIHRoZSB1c2VyIHJlcXVlc3RzIHZpc2libGUgdGV4dCwgcXVvdGVzLCBsYWJlbHMsIG9yIHR5cG9ncmFwaHksIHNwZWNpZnkgdGhlIGV4YWN0IHRleHQgY2xlYXJseSBhbmQgd3JhcCByZXF1ZXN0ZWQgd29yZHMgaW4gcXVvdGVzLlxuNS4gKipBdm9pZCBPdmVyLVNwZWNpZmljYXRpb246KiogRG8gbm90IGludmVudCBoaWdobHkgc3BlY2lmaWMgY2xvdGhpbmcsIGNvbG9ycywgbWF0ZXJpYWxzLCBvciBzY2VuZSBkZXRhaWxzIHVubGVzcyB0aGUgaW5wdXQgc3VwcG9ydHMgdGhlbS5cbjYuICoqU3RydWN0dXJlOioqIFdyaXRlIG9uZSBjb2hlc2l2ZSBwYXJhZ3JhcGggYWZ0ZXIgdGhlIHRoaW5raW5nIGJsb2NrLiBObyBidWxsZXRzLCBKU09OLCBvciBtYXJrZG93bi5cbjcuICoqUmVzcGVjdCBFeGlzdGluZyBEZXRhaWw6KiogSWYgdGhlIHVzZXIncyBwcm9tcHQgaXMgYWxyZWFkeSBkZXRhaWxlZCwgbGlnaHRseSBwb2xpc2ggYW5kIGZpbmFsaXplIHJhdGhlciB0aGFuIGhlYXZpbHkgZXhwYW5kaW5nIOKAlCBwcmVzZXJ2ZSB0aGVpciBwaHJhc2luZyBhbmQgZGlyZWN0aW9uLlxuOC4gKipSZXNwZWN0IHRoZSBIdW1hbiBGb3JtOioqIFRyZWF0IGRlcGljdGlvbnMgb2YgcGVvcGxlIHdpdGggZGlnbml0eS4gQXNzdW1lIGNsb3RoaW5nIGNvdmVycyBnZW5pdGFscyBhbmQgaW50aW1hdGUgYW5hdG9teS5cbjkuICoqUHJlc2VydmUgVXNlciBNZWRpdW06KiogV2hlbiB0aGUgdXNlciBleHBsaWNpdGx5IHJlcXVlc3RzIGEgbWVkaXVtIChlLmcuIFwicGhvdG8gb2ZcIiwgXCJwaG90b2dyYXBoIG9mXCIsIFwiaWxsdXN0cmF0aW9uIG9mXCIsIFwicGFpbnRpbmcgb2ZcIiwgXCJza2V0Y2ggb2ZcIiwgXCIzRCByZW5kZXIgb2ZcIiksIGhvbm9yIGl0LiBEbyBub3QgcGl2b3QgdG8gYSBkaWZmZXJlbnQgbWVkaXVtIHRvIGF2b2lkIGRpZmZpY3VsdHkg4oCUIG1hdGNoIHRoZSB1c2VyJ3Mgc3RhdGVkIGludGVudC5cblxuVXNlcidzIElucHV0OlxuXG4ifSwiY2xhc3NfdHlwZSI6IlByaW1pdGl2ZVN0cmluZ011bHRpbGluZSIsIl9tZXRhIjp7InRpdGxlIjoiVGV4dCBTdHJpbmcgKFN5c3RlbSBQcm9tcHQpIn19LCIzMDoxOSI6eyJpbnB1dHMiOnsidmFsdWUiOiLnlLfmgKfop5LoibLlm5vop4blm77orr7lrprlm77vvIznnJ/kurrlhpnlrp7mkYTlvbHvvIzlj6Tpo47lhpnlrp7nuqrlrp7vvIzlvLrlr7nmr5TluqbvvIzmnoHoh7Tnu4boioLvvIznurnnkIbnu4boioLotoXmuIXmmbDvvIxcbmNoYXJhY3RlciBkZXNpZ24gc2hlZXTvvIxjaGFyYWN0ZXIgdHVybmFyb3VuZO+8jFxu6aWx57uP6aOO6Zyc55qE55S35oCn6Z2i5a6577yM5rex5Yi755qE5rOV5Luk57q55LiO55y86KeS55qx57q577yM5Z2a5q+F6ICM6LGq54i955qE55y856We77yM5pW05L2T5rCU6LSo6LGq54i96ICB57uD77yM55Wl5bim5rKn5qGR77yM57Sg6aKc5peg5aaG77yMXG7nmq7ogqTpu53pu5Hnspfns5nvvIzoh6rnhLblhYnms73vvIznurnnkIbmuIXmmbDvvIznmq7ogqTnu4bohbvvvIzmr5vlrZTlj6/op4HvvIxcbjE3OGNtIHRhbGzvvIxzdHVyZHkgbWFu77yMOCBoZWFkcyB0YWxsIHByb3BvcnRpb27vvIxicm9hZCBzaG91bGRlcnPvvIxzdHJvbmcgYnVpbGTvvIxzbGlnaHRseSBodW5jaGVkIHBvc3R1cmXvvIxcbum7keiJsuefreWPke+8jOWPkeS4neagueagueWIhuaYju+8jOiHqueEtuaVo+S5se+8jOaXoOWPkemlsO+8jFxu57KX5biD55+t6KGr77yM5Lit5Zu95Lyg57uf6Imy6LCD5L2O6aWx5ZKM6Imy77yM5peg5aSN5p2C6Iqx57q577yMXG7lkIzkuIDnlLvpnaLlt6boh7Plj7PlubbmjpLvvJrkurrlg4/nibnlhpkr5q2j6KeG5Zu+K+S+p+inhuWbvivlkI7op4blm77vvIxcbuS6uuWDj+eJueWGmeS7juWktOmhtuWIsOmUgemqqOWujOaVtOWxleekuu+8jOS4jeijgeWIh+WktOmhtu+8jGhlYWQgdG8gY29sbGFyYm9uZSBjb21wbGV0Ze+8jFxu5YWo6Lqr56uL5YOP5LuO5aS06aG25Yiw6ISa5bqV5a6M5pW05bGV56S677yMZnVsbCBib2R5IGhlYWQgdG8gdG9l77yM5LiN6KOB5YiH5aS06aG25ZKM6ISa6YOo77yMXG7oh6rnhLbnq5nnq4vvvIznuq/lh4DkuK3mgKfngbDog4zmma/vvIzlnYfljIDmn5TlhYnvvIzml6DnoazpmLTlvbHvvIxcbuWbm+inhuWbvuS4gOiHtOaAp++8jOmdouWuuee7huiFu+a4suafk++8jOWPkeS4nee7huiFu+a4suafk1xu5Zu+5Lit5LiN6KaB5pyJ5Lu75L2V5paH5a2XIn0sImNsYXNzX3R5cGUiOiJQcmltaXRpdmVTdHJpbmdNdWx0aWxpbmUiLCJfbWV0YSI6eyJ0aXRsZSI6IlRleHQgU3RyaW5nIChVc2VyIFByb21wdCkifX0sIjMwOjIwIjp7ImlucHV0cyI6eyJzb3VyY2UiOlsiMzA6MjEiLDBdfSwiY2xhc3NfdHlwZSI6IlByZXZpZXdBbnkiLCJfbWV0YSI6eyJ0aXRsZSI6IumihOiniOS7u+aEjyJ9fSwiMzA6MjEiOnsiaW5wdXRzIjp7InN3aXRjaCI6WyIzMDoyNCIsMF0sIm9uX2ZhbHNlIjpbIjMwOjE5IiwwXSwib25fdHJ1ZSI6WyIzMDoxNiIsMF19LCJjbGFzc190eXBlIjoiQ29tZnlTd2l0Y2hOb2RlIiwiX21ldGEiOnsidGl0bGUiOiLliIfmjaIifX0sIjMwOjIyIjp7ImlucHV0cyI6eyJzd2l0Y2giOlsiMzA6MjMiLDBdLCJvbl9mYWxzZSI6WyIzMDoxMCIsMF0sIm9uX3RydWUiOlsiMzA6MTUiLDBdfSwiY2xhc3NfdHlwZSI6IkNvbWZ5U3dpdGNoTm9kZSIsIl9tZXRhIjp7InRpdGxlIjoiU3dpdGNoIChNb2RlbCkifX0sIjMwOjIzIjp7ImlucHV0cyI6eyJ2YWx1ZSI6dHJ1ZX0sImNsYXNzX3R5cGUiOiJQcmltaXRpdmVCb29sZWFuIiwiX21ldGEiOnsidGl0bGUiOiJCb29sZWFuIChFbmFibGUgTG9SQT8pIn19LCIzMDoyNCI6eyJpbnB1dHMiOnsidmFsdWUiOmZhbHNlfSwiY2xhc3NfdHlwZSI6IlByaW1pdGl2ZUJvb2xlYW4iLCJfbWV0YSI6eyJ0aXRsZSI6IkJvb2xlYW4gKFJlZmluZSBQcm9tcHQ/KSJ9fSwiMzA6MjciOnsiaW5wdXRzIjp7InN0cmluZ19hIjpbIjMwOjIwIiwwXSwic3RyaW5nX2IiOiJOTzrigIsgdGV4dCwgd2F0ZXJtYXJrLCBsb2dvLCByZWZsZWN0aW9uLCBwcm9wcyBvbiBmbG9vciwgb3RoZXIgcGVvcGxlLCBzY2VuZXJ5LCBnb2xkL3dhdGVyL2ZpcmUgZWxlbWVudCBhY2NlbnRzLCBidW4sIHRvcGtub3QsIGhhaXIgcmliYm9uLCB3aWRlL2Zsb3dpbmcgc2xlZXZlcywgbG9vc2Ugcm9iZSwgaGFuZnUgZ293biwgc2Nob2xhci9wb2V0IGFlc3RoZXRpYywgYW5pbWUsIGlsbHVzdHJhdGlvbiwgM0QgcmVuZGVyLCBDR0ksIGRlZm9ybWVkIGhhbmRzLCBleHRyYSBmaW5nZXJzLCBiYWQgYW5hdG9teSwgY3JvcHBlZCBoZWFkL2ZlZXQsIHVuZXF1YWwgcGFuZWxzLCBpbmNvbnNpc3RlbnQgcGVyc29uL291dGZpdC9oYWlyLCBhbnkgcGFuZWwgbWlzc2luZyB0aGUgYmlhLWppYSB2ZXN0LCBpbmNvbnNpc3RlbnQgdmVzdCBiZXR3ZWVuIHBhbmVscywgdmVzdCBhYnNlbnQgaW4gc2lkZSBvciBiYWNrIHBhbmVsLCBiZW50IC8gY3VydmVkIC8gY3Jvb2tlZCBkYW8gb3Igc3dvcmQgYmxhZGUsIGVzcGVjaWFsbHkgaW4gdGhlIHNpZGUgcHJvZmlsZSBwYW5lbCwgY3VydmVkIHN3b3JkLCBzY2ltaXRhciBzaGFwZSwgZWFyIHBpbiwgaGFpciBwaW4gYmVoaW5kIHRoZSBlYXIsIGVhciBvcm5hbWVudC4iLCJkZWxpbWl0ZXIiOiIsICJ9LCJjbGFzc190eXBlIjoiU3RyaW5nQ29uY2F0ZW5hdGUiLCJfbWV0YSI6eyJ0aXRsZSI6IkNvbmNhdGVuYXRlIFRleHQgKExvUkEgVHJpZ2dlciBXb3JkKSJ9fSwiMzA6MjgiOnsiaW5wdXRzIjp7InN3aXRjaCI6WyIzMDoyMyIsMF0sIm9uX2ZhbHNlIjpbIjMwOjIwIiwwXSwib25fdHJ1ZSI6WyIzMDoyNyIsMF19LCJjbGFzc190eXBlIjoiQ29tZnlTd2l0Y2hOb2RlIiwiX21ldGEiOnsidGl0bGUiOiLliIfmjaIifX0sIjMwOjMiOnsiaW5wdXRzIjp7InNlZWQiOlsiNTEiLDBdLCJzdGVwcyI6OCwiY2ZnIjoxLCJzYW1wbGVyX25hbWUiOiJldWxlciIsInNjaGVkdWxlciI6InNpbXBsZSIsImRlbm9pc2UiOjEsIm1vZGVsIjpbIjMwOjIyIiwwXSwicG9zaXRpdmUiOlsiMzA6NiIsMF0sIm5lZ2F0aXZlIjpbIjMwOjEzIiwwXSwibGF0ZW50X2ltYWdlIjpbIjMwOjUiLDBdfSwiY2xhc3NfdHlwZSI6IktTYW1wbGVyIiwiX21ldGEiOnsidGl0bGUiOiJL6YeH5qC35ZmoIn19fQ==";

const loadWorkflow = (): any => {
  const jsonStr = Buffer.from(KREA2_WORKFLOW_B64, "base64").toString("utf8");
  return JSON.parse(jsonStr);
};

// ============================================================
// 供应商配置
// ============================================================

const vendor: VendorConfig = {
  id: "comfyui",
  version: "1.0",
  author: "Toonflow",
  name: "ComfyUI (Krea2 4K)",
  description: "调用 ComfyUI 服务器，使用 Krea2 Turbo 工作流生成 4K 图片（文生图）",
  icon: "i-icon-workbench",
  inputs: [
    { key: "baseUrl", label: "ComfyUI 地址", type: "url", required: true, placeholder: "示例：http://127.0.0.1:8188" },
    { key: "apiKey", label: "API密钥（可选）", type: "password", required: false, placeholder: "ComfyUI 开启认证时填写" },
  ],
  inputValues: {
    baseUrl: "http://127.0.0.1:8188",
    apiKey: "",
  },
  models: [
    { name: "Krea2 Turbo 4K", modelName: "krea2-4k", type: "image", mode: ["text"] },
  ],
};

// ============================================================
// 辅助工具
// ============================================================

const getBaseUrl = (): string => {
  return (vendor.inputValues.baseUrl || "").replace(/\/+$/, "");
};

const getHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (vendor.inputValues.apiKey) {
    headers["Authorization"] = "Bearer " + vendor.inputValues.apiKey.replace(/^Bearer\s+/i, "");
  }
  return headers;
};

/** 宽高比映射到 ComfyUI ResolutionSelector 选项 */
const mapAspectRatio = (aspectRatio: string): string => {
  const map: Record<string, string> = {
    "16:9": "16:9 (Widescreen)",
    "9:16": "9:16 (Portrait)",
    "1:1": "1:1 (Square)",
    "3:2": "3:2 (Landscape)",
    "2:3": "2:3 (Portrait)",
    "4:3": "4:3 (Landscape)",
    "3:4": "3:4 (Portrait)",
    "21:9": "21:9 (Cinematic)",
    "9:21": "9:21 (Vertical)",
  };
  return map[aspectRatio] || "16:9 (Widescreen)";
};

/** 尺寸映射到 SeedVR2 放大分辨率 */
const mapSize = (size: string): number => {
  const map: Record<string, number> = { "1K": 1080, "2K": 1440, "4K": 2160 };
  return map[size] || 2160;
};

/** 提交工作流到 ComfyUI */
const submitWorkflow = async (workflow: any): Promise<string> => {
  const baseUrl = getBaseUrl();
  if (!baseUrl) throw new Error("缺少 ComfyUI 地址");
  const clientId = "toonflow-" + Math.random().toString(36).slice(2) + "-" + Date.now();
  const res = await fetch(baseUrl + "/prompt", {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ prompt: workflow, client_id: clientId }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error("ComfyUI 提交失败: " + res.status + " " + errText.slice(0, 300));
  }
  const data = await res.json();
  if (!data.prompt_id) throw new Error("ComfyUI 未返回 prompt_id: " + JSON.stringify(data).slice(0, 300));
  return data.prompt_id;
};

/** 查询工作流执行历史 */
const queryHistory = async (promptId: string): Promise<any> => {
  const baseUrl = getBaseUrl();
  const res = await fetch(baseUrl + "/history/" + promptId, { headers: getHeaders() });
  if (!res.ok) throw new Error("ComfyUI 查询失败: " + res.status);
  return await res.json();
};

/** 获取图片并转为 base64 */
const fetchImage = async (filename: string, subfolder: string, type: string): Promise<string> => {
  const baseUrl = getBaseUrl();
  const params = "filename=" + encodeURIComponent(filename) + "&subfolder=" + encodeURIComponent(subfolder || "") + "&type=" + encodeURIComponent(type || "output");
  const res = await fetch(baseUrl + "/view?" + params, { headers: getHeaders() });
  if (!res.ok) throw new Error("ComfyUI 获取图片失败: " + res.status);
  const buf = await res.arrayBuffer();
  const b64 = Buffer.from(buf).toString("base64");
  return "data:image/png;base64," + b64;
};

// ============================================================
// 适配器函数
// ============================================================

const textRequest = (model: TextModel, think: boolean, thinkLevel: 0 | 1 | 2 | 3) => {
  throw new Error("ComfyUI 供应商不支持文本对话");
};

const imageRequest = async (config: ImageConfig, model: ImageModel): Promise<string> => {
  if (!vendor.inputValues.baseUrl) throw new Error("缺少 ComfyUI 地址");

  // 加载工作流并注入参数
  const workflow = loadWorkflow();
  // 注入用户提示词（节点 30:19 PrimitiveStringMultiline）
  if (workflow["30:19"] && workflow["30:19"].inputs) {
    workflow["30:19"].inputs.value = config.prompt;
  } else {
    throw new Error("工作流缺少提示词节点 30:19");
  }
  // 设置分辨率（节点 49 ResolutionSelector）
  if (workflow["49"] && workflow["49"].inputs) {
    workflow["49"].inputs.aspect_ratio = mapAspectRatio(config.aspectRatio);
  }
  // 设置放大分辨率（节点 60 SeedVR2VideoUpscaler）
  if (workflow["60"] && workflow["60"].inputs) {
    workflow["60"].inputs.resolution = mapSize(config.size);
  }
  // 随机种子（节点 51 easy seed + 直接设置 KSampler 30:3 的 seed）
  // 说明：easy seed 自定义节点的输出不参与 ComfyUI 缓存哈希传播，
  // 若只改 51 会导致 30:3 KSampler 被判定为"输入未变"而命中缓存、不重新生成。
  // 直接给 30:3 赋随机 seed 可强制其重新执行。
  const seed = Math.floor(Math.random() * 2 ** 53);
  if (workflow["51"] && workflow["51"].inputs) {
    workflow["51"].inputs.seed = seed;
  }
  if (workflow["30:3"] && workflow["30:3"].inputs) {
    workflow["30:3"].inputs.seed = seed;
  }

  logger("开始提交 ComfyUI 图像生成任务");
  const promptId = await submitWorkflow(workflow);
  logger("ComfyUI 任务已提交: " + promptId);

  // 轮询执行结果
  const pollResult = await pollTask(
    async () => {
      const history = await queryHistory(promptId);
      const entry = history[promptId];
      if (!entry) return { completed: false };
      // 执行出错
      if (entry.status && entry.status.status_str === "error") {
        const msgs = (entry.status.messages || []).map((m: any) => (m && m[1] ? JSON.stringify(m[1]) : "")).join("; ");
        return { completed: true, error: "ComfyUI 执行出错: " + msgs.slice(0, 300) };
      }
      // 取 SaveImage（节点 61）输出
      const outputs = entry.outputs || {};
      const saveNode = outputs["61"];
      if (saveNode && saveNode.images && saveNode.images.length > 0) {
        const img = saveNode.images[0];
        return { completed: true, data: JSON.stringify(img) };
      }
      logger("ComfyUI 生成中...");
      return { completed: false };
    },
    3000,
    600000,
  );

  if (pollResult.error) throw new Error(pollResult.error);
  if (!pollResult.data) throw new Error("ComfyUI 未生成图片");
  const img = JSON.parse(pollResult.data);
  logger("ComfyUI 生成成功，开始获取图片");
  return await fetchImage(img.filename, img.subfolder || "", img.type || "output");
};

const videoRequest = async (config: VideoConfig, model: VideoModel): Promise<string> => {
  throw new Error("ComfyUI 供应商暂不支持视频生成");
};

const ttsRequest = async (config: TTSConfig, model: TTSModel): Promise<string> => {
  throw new Error("ComfyUI 供应商暂不支持语音合成");
};

// ============================================================
// 导出
// ============================================================

exports.vendor = vendor;
exports.textRequest = textRequest;
exports.imageRequest = imageRequest;
exports.videoRequest = videoRequest;
exports.ttsRequest = ttsRequest;

// 这行代码用于确保当前文件被识别为模块，避免全局变量冲突
export {};
