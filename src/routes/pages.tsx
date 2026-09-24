import { Hono } from "hono";
import type { Context } from "hono";
import type { Child } from "hono/jsx";

import { daysUntil, todayJst } from "../domain/date";
import { DEFAULT_WARN_DAYS, itemInput, spacePatch } from "../domain/schema";
import {
  deleteItem,
  getItem,
  getWarnDays,
  insertItem,
  listItems,
  setWarnDays,
  updateItem,
} from "../platform/db";
import { findSpace, resolveSpace } from "../space";
import { Layout } from "../views/layout";
import { type ItemField, ItemForm, ItemList, NotFound, Settings } from "../views/pages";

const render = (c: Context, title: string, children: Child, status: 200 | 400 | 404 = 200) =>
  c.html(
    <Layout title={title} nonce={c.get("secureHeadersNonce")}>
      {children}
    </Layout>,
    status,
  );

// フォームは文字列だけを受け取る（File は不正な値として扱う）
const formValues = async (c: Context): Promise<Record<string, string>> =>
  Object.fromEntries(
    Object.entries(await c.req.parseBody()).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );

const invalidFields = (issues: readonly { path: readonly PropertyKey[] }[]) =>
  new Set(issues.map((issue) => issue.path[0] as ItemField));

// 閲覧系（GET）はスペースを発行しない。書き込み系（POST）で初めて発行する（ADR 0002）
export const pages = new Hono<{ Bindings: Env }>()
  .get("/", findSpace, async (c) => {
    const spaceId = c.var.spaceId;
    if (spaceId === undefined) {
      return render(c, "期限メモ", <ItemList items={[]} warnDays={DEFAULT_WARN_DAYS} />);
    }
    const today = todayJst();
    const [items, warnDays] = await Promise.all([
      listItems(c.env.DB, spaceId),
      getWarnDays(c.env.DB, spaceId),
    ]);
    const listed = items.map((item) => ({ ...item, days_left: daysUntil(item.expires_on, today) }));
    return render(c, "期限メモ", <ItemList items={listed} warnDays={warnDays} />);
  })
  .get("/items/new", (c) =>
    render(c, "追加", <ItemForm title="追加" action="/items" values={{}} errors={new Set()} />),
  )
  .post("/items", resolveSpace, async (c) => {
    const values = await formValues(c);
    const parsed = itemInput.safeParse(values);
    if (!parsed.success) {
      const errors = invalidFields(parsed.error.issues);
      return render(
        c,
        "追加",
        <ItemForm title="追加" action="/items" values={values} errors={errors} />,
        400,
      );
    }
    await insertItem(c.env.DB, c.var.spaceId, parsed.data);
    return c.redirect("/", 303);
  })
  .get("/items/:id/edit", findSpace, async (c) => {
    const spaceId = c.var.spaceId;
    const item = spaceId === undefined ? null : await getItem(c.env.DB, spaceId, c.req.param("id"));
    if (item === null) return render(c, "見つかりません", <NotFound />, 404);
    const values = { ...item, memo: item.memo ?? "" };
    return render(
      c,
      "編集",
      <ItemForm title="編集" action={`/items/${item.id}`} values={values} errors={new Set()} />,
    );
  })
  .post("/items/:id", resolveSpace, async (c) => {
    const values = await formValues(c);
    const parsed = itemInput.safeParse(values);
    const action = `/items/${c.req.param("id")}`;
    if (!parsed.success) {
      const errors = invalidFields(parsed.error.issues);
      return render(
        c,
        "編集",
        <ItemForm title="編集" action={action} values={values} errors={errors} />,
        400,
      );
    }
    const item = await updateItem(c.env.DB, c.var.spaceId, c.req.param("id"), parsed.data);
    return item ? c.redirect("/", 303) : render(c, "見つかりません", <NotFound />, 404);
  })
  // 別の端末で先に削除されていても結果は同じなので、常に一覧へ戻す
  .post("/items/:id/delete", resolveSpace, async (c) => {
    await deleteItem(c.env.DB, c.var.spaceId, c.req.param("id"));
    return c.redirect("/", 303);
  })
  .get("/settings", findSpace, async (c) => {
    const spaceId = c.var.spaceId;
    const warnDays =
      spaceId === undefined ? DEFAULT_WARN_DAYS : await getWarnDays(c.env.DB, spaceId);
    return render(c, "設定", <Settings warnDays={String(warnDays)} invalid={false} />);
  })
  .post("/settings", resolveSpace, async (c) => {
    const { warn_days = "" } = await formValues(c);
    const parsed = spacePatch.safeParse({ warn_days: Number(warn_days) });
    if (!parsed.success) return render(c, "設定", <Settings warnDays={warn_days} invalid />, 400);
    await setWarnDays(c.env.DB, c.var.spaceId, parsed.data.warn_days);
    return c.redirect("/", 303);
  });
