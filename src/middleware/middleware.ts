import { Request, Response, NextFunction } from "express";
import { z, ZodTypeAny } from "zod";

import { zhCN } from "zod/locales";
import u from "@/utils";

z.config(zhCN());

export function validateFields(
  shape: Record<string, ZodTypeAny>,
  source: "body" | "query" | "params" = "body", // 默认校验 body
) {
  const schema = z.object(shape);

  return (req: Request, res: Response, next: NextFunction) => {
    const data = req[source];
    const parseResult = schema.safeParse(data);
    if (!parseResult.success) {
      const errors = parseResult.error.issues.map((issue) => `字段 ${issue.path.join(".")} ${issue.message}`);
      console.error(errors);
      return res.status(400).json({ message: "参数错误", errors });
    }
    next();
  };
}

// 管理员权限校验（从数据库实时确认角色，兼容旧 token 无 role 字段的情况）
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;
  if (!user?.id) return res.status(401).send({ message: "未登录" });
  const dbUser = await u.db("o_user").where("id", user.id).first();
  if (!dbUser) return res.status(401).send({ message: "用户不存在" });
  if (dbUser.role !== "admin") return res.status(403).send({ message: "无权限，仅管理员可操作" });
  next();
}
