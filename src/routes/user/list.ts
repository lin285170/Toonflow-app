import express from "express";
import u from "@/utils";
import { success } from "@/lib/responseFormat";
import { requireAdmin } from "@/middleware/middleware";
const router = express.Router();

// 用户列表（仅管理员）
export default router.post("/", requireAdmin, async (_req, res) => {
  const list = await u.db("o_user").select("id", "name", "role", "createTime").orderBy("id", "asc");
  res.status(200).send(success(list));
});
