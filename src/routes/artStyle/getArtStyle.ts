import express from "express";
import u from "@/utils";
import { success } from "@/lib/responseFormat";
const router = express.Router();

export default router.post("/", async (req, res) => {
  const list = await u.db("o_artStyle").where("userId", (req as any).user.id).select("*");
  const data = await Promise.all(
    list.map(async (item: any) => {
      const fileUrl = await u.oss.getSmallImageUrl(item.fileUrl);
      return { ...item, fileUrl };
    }),
  );
  res.status(200).send(success(data));
});
