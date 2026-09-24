import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

import { todayJst } from "../domain/date";
import { parseExtraction } from "../domain/extract";
import { extractForm } from "../domain/schema";
import { runExtraction } from "../platform/ai";
import { findSpace } from "../space";

// 読み取りは書き込みではないのでスペースを発行しない（ADR 0003）。
// 発行すると Cookie を付けないだけで毎回新しいスペース = 新しいレート制限の枠が得られてしまう
export const extract = new Hono<{ Bindings: Env }>().post(
  "/",
  findSpace,
  // 本文を読む前に数える（要件 8.2: space_id ごとに 1 分 10 回。スペースが無ければ IP ごと）
  async (c, next) => {
    const key = c.var.spaceId ?? `ip:${c.req.header("cf-connecting-ip") ?? ""}`;
    const { success } = await c.env.EXTRACT_RATE_LIMITER.limit({ key });
    if (!success) return c.json({ error: "rate_limited" }, 429);
    await next();
  },
  zValidator("form", extractForm),
  async (c) => {
    try {
      const response = await runExtraction(c.env.AI, c.req.valid("form").image);
      return c.json(parseExtraction(response, todayJst()));
    } catch (error) {
      // 画像は出さない（要件 8.1）。クライアントは手入力にフォールバックする
      console.error("extract failed", error);
      return c.json({ error: "extract_failed" }, 502);
    }
  },
);
