import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

import { daysUntil, todayJst } from "../domain/date";
import { DEFAULT_WARN_DAYS, itemInput, itemPatch, spacePatch, tagInput } from "../domain/schema";
import {
  deleteItem,
  deleteTag,
  getWarnDays,
  insertItem,
  insertTag,
  listItems,
  listTags,
  rotateSpace,
  setWarnDays,
  updateItem,
} from "../platform/db";
import { findSpace, resolveSpace } from "../space";

const notFound = { error: "not_found" } as const;

// 発行するのは追加と設定の書き込みだけ（ADR 0002 の追記）。閲覧は空の一覧・既定値を返し、編集・削除は 404。
// 不正な本文でスペースを作らないよう、検証してから発行する
export const api = new Hono<{ Bindings: Env }>()
  .get("/items", findSpace, async (c) => {
    const today = todayJst();
    const spaceId = c.var.spaceId;
    const items = spaceId === undefined ? [] : await listItems(c.env.DB, spaceId);
    return c.json(items.map((item) => ({ ...item, days_left: daysUntil(item.expires_on, today) })));
  })
  .post("/items", zValidator("json", itemInput), resolveSpace, async (c) => {
    const item = await insertItem(c.env.DB, c.var.spaceId, c.req.valid("json"));
    return item ? c.json(item, 201) : c.json({ error: "too_many_items" }, 409);
  })
  .patch("/items/:id", zValidator("json", itemPatch), findSpace, async (c) => {
    const spaceId = c.var.spaceId;
    const item =
      spaceId === undefined
        ? null
        : await updateItem(c.env.DB, spaceId, c.req.param("id"), c.req.valid("json"));
    return item ? c.json(item) : c.json(notFound, 404);
  })
  .delete("/items/:id", findSpace, async (c) => {
    const spaceId = c.var.spaceId;
    return spaceId !== undefined && (await deleteItem(c.env.DB, spaceId, c.req.param("id")))
      ? c.body(null, 204)
      : c.json(notFound, 404);
  })
  .get("/tags", findSpace, async (c) => {
    const spaceId = c.var.spaceId;
    return c.json(spaceId === undefined ? [] : await listTags(c.env.DB, spaceId));
  })
  .post("/tags", zValidator("json", tagInput), resolveSpace, async (c) => {
    const tag = await insertTag(c.env.DB, c.var.spaceId, c.req.valid("json").name);
    return tag ? c.json(tag, 201) : c.json({ error: "too_many_tags" }, 409);
  })
  .delete("/tags/:id", findSpace, async (c) => {
    const spaceId = c.var.spaceId;
    return spaceId !== undefined && (await deleteTag(c.env.DB, spaceId, c.req.param("id")))
      ? c.body(null, 204)
      : c.json(notFound, 404);
  })
  .get("/space", findSpace, async (c) => {
    const spaceId = c.var.spaceId;
    const warnDays = spaceId === undefined ? null : await getWarnDays(c.env.DB, spaceId);
    return c.json({ warn_days: warnDays ?? DEFAULT_WARN_DAYS });
  })
  .patch("/space", zValidator("json", spacePatch), resolveSpace, async (c) => {
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
