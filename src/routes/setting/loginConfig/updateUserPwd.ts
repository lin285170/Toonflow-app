import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
const router = express.Router();

export default router.post(
  "/",
  validateFields({
    name: z.string(),
    password: z.string(),
    id: z.number(),
  }),
  async (req, res) => {
    const { name, password, id } = req.body;
    // 权限校验：仅允许修改自己的账号（防越权改他人密码）
    const me = (req as any).user?.id;
    if (!me || Number(me) !== Number(id)) {
      return res.status(403).send({ code: 403, message: "无权限，仅可修改自己的密码" });
    }
    await u.db("o_user").where("id", id).update({
      name,
      password,
    });
    res.status(200).send(success("保存设置成功"));
  },
);
