import { v4 as uuid } from "uuid";

// 注册验证码：SVG 图片验证码，内存存储，一次性 + 5 分钟过期
interface CaptchaItem {
  answer: string;
  expireAt: number;
}

const store = new Map<string, CaptchaItem>();
// 去除易混淆字符（0/O、1/I/L 等）
const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const EXPIRE_MS = 5 * 60 * 1000;

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateSvg(code: string): string {
  const w = 130;
  const h = 44;
  // 干扰线
  let lines = "";
  for (let i = 0; i < 4; i++) {
    const x1 = randInt(0, w);
    const y1 = randInt(0, h);
    const x2 = randInt(0, w);
    const y2 = randInt(0, h);
    lines += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#9aa0aa" stroke-width="1" stroke-linecap="round"/>`;
  }
  // 噪点
  let dots = "";
  for (let i = 0; i < 40; i++) {
    dots += `<circle cx="${randInt(0, w)}" cy="${randInt(0, h)}" r="1" fill="#aab2bd"/>`;
  }
  // 字符（随机旋转、颜色）
  const letters = code
    .split("")
    .map((ch, i) => {
      const x = 18 + i * 26;
      const y = randInt(26, 34);
      const rot = randInt(-28, 28);
      const color = `hsl(${randInt(0, 360)}, 62%, 40%)`;
      return `<text x="${x}" y="${y}" transform="rotate(${rot} ${x} ${y})" font-size="26" font-family="Arial, sans-serif" font-weight="bold" fill="${color}" text-anchor="middle">${ch}</text>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${lines}${dots}${letters}</svg>`;
}

export function createCaptcha(): { id: string; svg: string } {
  // 清理过期项
  const now = Date.now();
  for (const [k, v] of store) {
    if (now > v.expireAt) store.delete(k);
  }
  const id = uuid();
  let code = "";
  for (let i = 0; i < 4; i++) code += CHARS[randInt(0, CHARS.length - 1)];
  store.set(id, { answer: code.toLowerCase(), expireAt: now + EXPIRE_MS });
  return { id, svg: generateSvg(code) };
}

export function verifyCaptcha(id: string, answer: string): boolean {
  if (!id || !answer) return false;
  const item = store.get(id);
  if (!item) return false;
  store.delete(id); // 一次性使用
  if (Date.now() > item.expireAt) return false;
  return item.answer === String(answer).toLowerCase().trim();
}
