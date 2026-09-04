import express from "express";
import u from "@/utils";
import { success, error } from "@/lib/responseFormat";
import { requireAdmin, validateFields } from "@/middleware/middleware";
import { z } from "zod";
const router = express.Router();

// 管理员创建用户
export default router.post(
  "/",
  requireAdmin,
  validateFields({
    username: z.string(),
    password: z.string(),
  }),
  async (req, res) => {
    const { username, password } = req.body;
    if (typeof username !== "string" || username.trim().length < 2 || username.trim().length > 20) {
      return res.status(400).send(error("用户名长度为 2-20 个字符"));
    }
    if (typeof password !== "string" || password.length < 6 || password.length > 20) {
      return res.status(400).send(error("密码长度为 6-20 个字符"));
    }
    const name = username.trim();
    const exists = await u.db("o_user").where("name", name).first();
    if (exists) return res.status(400).send(error("用户名已存在"));

    const maxIdRow = await u.db("o_user").max("id as maxId").first();
    const newId = ((maxIdRow as any)?.maxId ?? 0) + 1;
    await u.db("o_user").insert({ id: newId, name, password, role: "user", createTime: Date.now() });
    await u.vendor.initUserVendors(newId);

    return res.status(200).send(success({ id: newId, name }, "创建成功"));
  },
);
