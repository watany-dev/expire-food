import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";

import { clientKey } from "../domain/client-key";
import { todayJst } from "../domain/date";
import { extractItem } from "../domain/pipeline";
import { extractForm, MAX_IMAGE_BYTES } from "../domain/schema";
import { runJudge, runReading } from "../platform/ai";
import { listItemNames } from "../platform/db";
import { findSpace } from "../space";

// 読み取りは書き込みではないのでスペースを発行しない（ADR 0003）。
// 発行すると Cookie を付けないだけで毎回新しいスペース = 新しいレート制限の枠が得られてしまう
export const extract = new Hono<{ Bindings: Env }>().post(
  "/",
  findSpace,
  // 本文を読む前に数える（要件 8.2: space_id ごとに 1 分 10 回。スペースが無ければ IP ごと）。
  // スペースは無料で作れるので、量産して枠を増やせないよう接続元ごとにも数え、両方の枠があるときだけ通す
  async (c, next) => {
    const ip = clientKey(c.req.header("cf-connecting-ip"));
    const allowed =
      (await c.env.EXTRACT_RATE_LIMITER.limit({ key: c.var.spaceId ?? ip })).success &&
      (await c.env.EXTRACT_IP_RATE_LIMITER.limit({ key: ip })).success;
    if (!allowed) return c.json({ error: "rate_limited" }, 429);
    await next();
  },
  // multipart は全部読んでから検証されるので、読む前に止める。余裕は part と区切り線の分
  bodyLimit({ maxSize: MAX_IMAGE_BYTES + 16 * 1024 }),
  zValidator("form", extractForm),
  async (c) => {
    const { image, part } = c.req.valid("form");
    const spaceId = c.var.spaceId;
    try {
      return c.json(
        await extractItem({
          part,
          today: todayJst(),
          read: () => runReading(c.env.AI, image, part),
          // 判定に失敗しても候補を返してユーザーに選ばせる
          judge: (input) =>
            runJudge(c.env.AI, input).catch((error: unknown) => {
              console.error("judge failed", error);
              return null;
            }),
          knownNames: async () => (spaceId ? listItemNames(c.env.DB, spaceId) : []),
        }),
      );
    } catch (error) {
      // 画像は出さない（要件 8.1）。クライアントは手入力にフォールバックする
      console.error("extract failed", error);
      return c.json({ error: "extract_failed" }, 502);
    }
  },
);
