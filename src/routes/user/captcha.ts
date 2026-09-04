import express from "express";
import { success } from "@/lib/responseFormat";
import { createCaptcha } from "@/utils/captcha";
const router = express.Router();

// 获取注册验证码（白名单接口，无需登录）
export default router.get("/", async (_req, res) => {
  const { id, svg } = createCaptcha();
  res.status(200).send(success({ id, svg }));
});
