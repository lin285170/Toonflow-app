import express from "express";
import u from "@/utils";
import { success, error } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { z } from "zod";
const router = express.Router();

// 重置密码（管理员可重置任意用户；普通用户仅可改自己）
export default router.post(
  "/",
  validateFields({
    id: z.number(),
    password: z.string(),
  }),
  async (req, res) => {
    const { id, password } = req.body;
    if (typeof password !== "string" || password.length < 6 || password.length > 20) {
      return res.status(400).send(error("密码长度为 6-20 个字符"));
    }
    const curUser = (req as any).user;
    const curDbUser = await u.db("o_user").where("id", curUser.id).first();
    if (!curDbUser) return res.status(401).send(error("用户不存在"));

    // 非管理员只能改自己的密码
    if (curDbUser.role !== "admin" && id !== curUser.id) {
      return res.status(403).send(error("无权限，仅管理员可重置他人密码"));
    }

    const target = await u.db("o_user").where("id", id).first();
    if (!target) return res.status(400).send(error("用户不存在"));

    await u.db("o_user").where("id", id).update({ password });
    return res.status(200).send(success(null, "密码已重置"));
  },
);
