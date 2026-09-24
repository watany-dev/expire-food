import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

import { daysUntil, todayJst } from "../domain/date";
import { itemInput, itemPatch, spacePatch } from "../domain/schema";
import {
  deleteItem,
  getWarnDays,
  insertItem,
  listItems,
  rotateSpace,
  setWarnDays,
  updateItem,
} from "../platform/db";
import { type AppEnv, findSpace } from "../space";

const notFound = { error: "not_found" } as const;

export const api = new Hono<AppEnv>()
  .get("/items", async (c) => {
    const today = todayJst();
    const items = await listItems(c.env.DB, c.var.spaceId);
    return c.json(items.map((item) => ({ ...item, days_left: daysUntil(item.expires_on, today) })));
  })
  .post("/items", zValidator("json", itemInput), async (c) =>
    c.json(await insertItem(c.env.DB, c.var.spaceId, c.req.valid("json")), 201),
  )
  .patch("/items/:id", zValidator("json", itemPatch), async (c) => {
    const item = await updateItem(c.env.DB, c.var.spaceId, c.req.param("id"), c.req.valid("json"));
    return item ? c.json(item) : c.json(notFound, 404);
  })
  .delete("/items/:id", async (c) =>
    (await deleteItem(c.env.DB, c.var.spaceId, c.req.param("id")))
      ? c.body(null, 204)
      : c.json(notFound, 404),
  )
  .get("/space", async (c) => c.json({ warn_days: await getWarnDays(c.env.DB, c.var.spaceId) }))
  .patch("/space", zValidator("json", spacePatch), async (c) => {
    const { warn_days } = c.req.valid("json");
    await setWarnDays(c.env.DB, c.var.spaceId, warn_days);
    return c.json({ warn_days });
  });

// 作り直しでは新しいスペースを発行しない（ADR 0004）。旧 Cookie の端末が空の一覧を作り直して、案内なしに別の一覧へ移るのを防ぐ
export const rotate = new Hono<{ Bindings: Env }>().post("/", findSpace, async (c) => {
  const old = c.var.spaceId;
  const id = crypto.randomUUID();
  if (old === undefined || !(await rotateSpace(c.env.DB, old, id))) return c.json(notFound, 404);
  c.set("spaceId", id);
  return c.json({ space_id: id });
});
