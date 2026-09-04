import express from "express";
import u from "@/utils";
import { success, error } from "@/lib/responseFormat";
import { requireAdmin, validateFields } from "@/middleware/middleware";
import { z } from "zod";
const router = express.Router();

// 删除用户（仅管理员；不能删除 admin 和当前登录用户）
export default router.post(
  "/",
  requireAdmin,
  validateFields({
    id: z.number(),
  }),
  async (req, res) => {
    const { id } = req.body;
    const curUser = (req as any).user;
    if (id === curUser.id) return res.status(400).send(error("不能删除当前登录用户"));

    const target = await u.db("o_user").where("id", id).first();
    if (!target) return res.status(400).send(error("用户不存在"));
    if (target.role === "admin") return res.status(400).send(error("不能删除管理员账号"));

    await u.db("o_user").where("id", id).delete();
    // 将该用户的项目等业务数据一并删除（完全隔离）
    await u.db("o_project").where("userId", id).delete();
    await u.db("o_vendorConfig").where("userId", id).delete();
    await u.db("o_agentDeploy").where("userId", id).delete();
    await u.db("o_artStyle").where("userId", id).delete();
    await u.db("o_prompt").where("userId", id).delete();
    await u.db("o_tasks").where("userId", id).delete();

    return res.status(200).send(success(null, "删除成功"));
  },
);
