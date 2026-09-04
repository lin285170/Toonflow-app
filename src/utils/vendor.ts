import { transform } from "sucrase";
import fs from "fs";
import path from "path";
import u from "@/utils";
import rawVendorData from "@/lib/vendor.json";

const vendorData = rawVendorData as Record<string, string>;

// 为新用户初始化内置供应商配置（完全隔离：每个用户有独立的供应商配置行）
export async function initUserVendors(userId: number) {
  const defList = Object.keys(vendorData).map((filename) => filename.replace(/\.ts$/, ""));
  for (const id of defList) {
    const exists = await u.db("o_vendorConfig").where("id", id).andWhere("userId", userId).first();
    if (exists) continue;
    await u.db("o_vendorConfig").insert({
      id,
      userId,
      inputValues: "{}",
      models: "[]",
      enable: id == "toonflow" ? 1 : 0,
    });
  }
  // Agent 配置：从 admin 复制默认配置
  const adminAgents = await u.db("o_agentDeploy").where("userId", 1).select("*");
  for (const agent of adminAgents) {
    const exists = await u.db("o_agentDeploy").where("key", agent.key).andWhere("userId", userId).first();
    if (exists) continue;
    const { id, ...rest } = agent;
    await u.db("o_agentDeploy").insert({ ...rest, userId });
  }
  // 提示词：从 admin 复制默认提示词
  const adminPrompts = await u.db("o_prompt").where("userId", 1).select("*");
  for (const p of adminPrompts) {
    const exists = await u.db("o_prompt").where("type", p.type).andWhere("userId", userId).first();
    if (exists) continue;
    const { id, ...rest } = p;
    await u.db("o_prompt").insert({ ...rest, userId });
  }
}

export function writeCode(id: string | number, tsCode: string) {
  const rootDir = u.getPath("vendor")
  fs.mkdirSync(rootDir, { recursive: true })
  if (fs.existsSync(path.join(rootDir,  `${id}.ts`))) {
    fs.writeFileSync(path.join(rootDir,  `${id}.ts`), tsCode);
  }
  fs.writeFileSync(path.join(rootDir,  `${id}.ts`), tsCode);
}

export function getCode(id: string): string {
  const rootDir = u.getPath("vendor");
  const targetFile = path.join(rootDir, `${id}.ts`);
  if (!fs.existsSync(targetFile)) return "";
  return fs.readFileSync(targetFile, "utf-8");
}

export async function getModelList(id: string, userId?: number): Promise<Array<any>> {
  let query = u.db("o_vendorConfig").where("id", id);
  if (userId != null) query = query.andWhere("userId", userId);
  const models = await query.select("models").first();
  if (!models || !models.models) return [];
  const code = getCode(id);
  const jsCode = transform(code, { transforms: ["typescript"] }).code;
  const vendorData = u.vm(jsCode);
  if(!vendorData || !vendorData.vendor || !vendorData.vendor.models) return [];
  const combined = [...JSON.parse(JSON.stringify(vendorData.vendor.models)), ...JSON.parse(models?.models ?? "[]")];
  const map = new Map<string, any>();
  for (const m of combined) {
    map.set(m.modelName, m);
  }
  return [...map.values()];
}

export function getVendor(id: string) {
  const code = getCode(id);
  const jsCode = transform(code, { transforms: ["typescript"] }).code;
  const vendorData = u.vm(jsCode);
  return vendorData.vendor;
}
