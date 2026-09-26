import { Hono } from "hono";
import { etag } from "hono/etag";
import appScript from "../client/app.js?raw";
import extractScript from "../client/extract.js?raw";
import type { Context } from "hono";
import type { Child } from "hono/jsx";

import { daysUntil, todayJst } from "../domain/date";
import {
  DEFAULT_WARN_DAYS,
  itemInput,
  MAX_ITEMS,
  MAX_TAGS,
  spacePatch,
  tagInput,
} from "../domain/schema";
import {
  deleteItem,
  deleteTag,
  getItem,
  getList,
  getWarnDays,
  insertItem,
  insertTag,
  listTags,
  rotateSpace,
  setWarnDays,
  updateItem,
} from "../platform/db";
import {
  findSpace,
  openSharedSpace,
  peekSharedSpace,
  resolveSpace,
  saveSpaceCookie,
  spaceCookie,
} from "../space";
import { Layout } from "../views/layout";
import {
  InvalidShareUrl,
  type ItemField,
  ItemForm,
  ItemList,
  LimitReached,
  NotFound,
  OpenSharedSpace,
  Settings,
  TagSettings,
} from "../views/pages";

const render = (c: Context, title: string, children: Child, status: 200 | 400 | 404 | 409 = 200) =>
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

// バージョンを URL に含めないので、デプロイ後に古いスクリプトが残らないよう毎回確認させる
const script = (c: Context, source: string) =>
  c.body(source, 200, {
    "content-type": "text/javascript; charset=utf-8",
    "cache-control": "no-cache",
  });

const shareUrl = (c: Context, spaceId: string) => new URL(`/s/${spaceId}`, c.req.url).href;

const invalidFields = (issues: readonly { path: readonly PropertyKey[] }[]) =>
  new Set(issues.map((issue) => issue.path[0] as ItemField));

// 閲覧系（GET）はスペースを発行しない。書き込み系（POST）で初めて発行する（ADR 0002）
export const pages = new Hono<{ Bindings: Env }>()
  // 最も開かれる画面なので、スペースの確認と一覧の読み込みを 1 回の往復にまとめる（findSpace を通さない）
  .get("/", async (c) => {
    const { id, present } = spaceCookie(c);
    const list = id === undefined ? null : await getList(c.env.DB, id);
    const today = todayJst();
    if (id === undefined || list === null) {
      return render(
        c,
        "期限メモ",
        <ItemList
          items={[]}
          tags={[]}
          tag={undefined}
          warnDays={DEFAULT_WARN_DAYS}
          today={today}
          lostSpace={present}
        />,
      );
    }
    saveSpaceCookie(c, id);
    // 消されたタグで開かれたら絞り込まずに全件を出す
    const tag = list.tags.find((t) => t.id === c.req.query("tag"));
    const listed = list.items
      .filter((item) => tag === undefined || item.tag_id === tag.id)
      .map((item) => ({ ...item, days_left: daysUntil(item.expires_on, today) }));
    return render(
      c,
      tag?.name ?? "期限メモ",
      <ItemList
        items={listed}
        tags={list.tags}
        tag={tag}
        warnDays={list.warnDays}
        today={today}
        lostSpace={false}
      />,
    );
  })
  // 共有 URL（機種変更・家族共有）。開くだけでは Cookie を変えず、確認画面の POST で切り替える。
  // GET で切り替えると、他人の共有 URL を踏ませるだけでその人の一覧に書き込ませられる（ADR 0004）。
  // 作り直された旧 URL で別の空の一覧に入らないよう、見つからなければエラーにする
  .get("/s/:spaceId", async (c) => {
    const shared = await peekSharedSpace(c, c.req.param("spaceId"));
    if (shared === undefined) return render(c, "共有URLが使えません", <InvalidShareUrl />, 404);
    if (shared.opened) {
      saveSpaceCookie(c, shared.id);
      return c.redirect("/");
    }
    return render(
      c,
      "共有された一覧",
      <OpenSharedSpace action={`/s/${shared.id}`} switching={shared.switching} />,
    );
  })
  .post("/s/:spaceId", async (c) =>
    (await openSharedSpace(c, c.req.param("spaceId")))
      ? c.redirect("/", 303)
      : render(c, "共有URLが使えません", <InvalidShareUrl />, 404),
  )
  .get("/app.js", etag(), (c) => script(c, appScript))
  .get("/extract.js", etag(), (c) => script(c, extractScript))
  // 絞り込み中の一覧から開いたら、そのタグを選んでおく
  .get("/items/new", async (c) => {
    const { id } = spaceCookie(c);
    const tags = id === undefined ? [] : await listTags(c.env.DB, id);
    const values = { tag_id: c.req.query("tag") ?? "" };
    return render(
      c,
      "追加",
      <ItemForm title="追加" action="/items" values={values} errors={new Set()} tags={tags} />,
    );
  })
  .post("/items", resolveSpace, async (c) => {
    const values = await formValues(c);
    const parsed = itemInput.safeParse(values);
    if (!parsed.success) {
      const errors = invalidFields(parsed.error.issues);
      const tags = await listTags(c.env.DB, c.var.spaceId);
      return render(
        c,
        "追加",
        <ItemForm title="追加" action="/items" values={values} errors={errors} tags={tags} />,
        400,
      );
    }
    if (await insertItem(c.env.DB, c.var.spaceId, parsed.data)) return c.redirect("/", 303);
    const message = `1つの一覧に登録できる商品は${MAX_ITEMS}件までです。使い終わった商品を削除してください。`;
    return render(c, "登録できません", <LimitReached message={message} back="/" />, 409);
  })
  .get("/items/:id/edit", findSpace, async (c) => {
    const spaceId = c.var.spaceId;
    const [item, tags] =
      spaceId === undefined
        ? [null, []]
        : await Promise.all([
            getItem(c.env.DB, spaceId, c.req.param("id")),
            listTags(c.env.DB, spaceId),
          ]);
    if (item === null) return render(c, "見つかりません", <NotFound />, 404);
    const values = { ...item, memo: item.memo ?? "", tag_id: item.tag_id ?? "" };
    return render(
      c,
      "編集",
      <ItemForm
        title="編集"
        action={`/items/${item.id}`}
        values={values}
        errors={new Set()}
        tags={tags}
      />,
    );
  })
  // 編集・削除は既存のスペースにしかできないので発行しない
  .post("/items/:id", findSpace, async (c) => {
    const spaceId = c.var.spaceId;
    if (spaceId === undefined) return render(c, "見つかりません", <NotFound />, 404);
    const values = await formValues(c);
    const parsed = itemInput.safeParse(values);
    const action = `/items/${c.req.param("id")}`;
    if (!parsed.success) {
      const errors = invalidFields(parsed.error.issues);
      const tags = await listTags(c.env.DB, spaceId);
      return render(
        c,
        "編集",
        <ItemForm title="編集" action={action} values={values} errors={errors} tags={tags} />,
        400,
      );
    }
    const item = await updateItem(c.env.DB, spaceId, c.req.param("id"), parsed.data);
    return item ? c.redirect("/", 303) : render(c, "見つかりません", <NotFound />, 404);
  })
  // 別の端末で先に削除されていても結果は同じなので、常に一覧へ戻す
  .post("/items/:id/delete", findSpace, async (c) => {
    const spaceId = c.var.spaceId;
    if (spaceId !== undefined) await deleteItem(c.env.DB, spaceId, c.req.param("id"));
    return c.redirect("/", 303);
  })
  .get("/tags", findSpace, async (c) => {
    const spaceId = c.var.spaceId;
    const tags = spaceId === undefined ? [] : await listTags(c.env.DB, spaceId);
    return render(c, "タグ", <TagSettings tags={tags} name="" invalid={false} />);
  })
  .post("/tags", resolveSpace, async (c) => {
    const { name = "" } = await formValues(c);
    const parsed = tagInput.safeParse({ name });
    if (!parsed.success) {
      const tags = await listTags(c.env.DB, c.var.spaceId);
      return render(c, "タグ", <TagSettings tags={tags} name={name} invalid />, 400);
    }
    if (await insertTag(c.env.DB, c.var.spaceId, parsed.data.name)) return c.redirect("/tags", 303);
    const message = `タグは${MAX_TAGS}個までです。使っていないタグを削除してください。`;
    return render(c, "登録できません", <LimitReached message={message} back="/tags" />, 409);
  })
  // 別の端末で先に削除されていても結果は同じなので、常にタグ画面へ戻す
  .post("/tags/:id/delete", findSpace, async (c) => {
    const spaceId = c.var.spaceId;
    if (spaceId !== undefined) await deleteTag(c.env.DB, spaceId, c.req.param("id"));
    return c.redirect("/tags", 303);
  })
  // warn_days の読み込みでスペースの確認を兼ねる（findSpace を通さない）
  .get("/settings", async (c) => {
    const { id } = spaceCookie(c);
    const warnDays = id === undefined ? null : await getWarnDays(c.env.DB, id);
    if (id === undefined || warnDays === null) {
      return render(
        c,
        "設定",
        <Settings warnDays={String(DEFAULT_WARN_DAYS)} invalid={false} shareUrl={undefined} />,
      );
    }
    saveSpaceCookie(c, id);
    return render(
      c,
      "設定",
      <Settings warnDays={String(warnDays)} invalid={false} shareUrl={shareUrl(c, id)} />,
    );
  })
  .post("/settings", resolveSpace, async (c) => {
    const { warn_days = "" } = await formValues(c);
    const parsed = spacePatch.safeParse({ warn_days: Number(warn_days) });
    if (!parsed.success) {
      const url = shareUrl(c, c.var.spaceId);
      return render(c, "設定", <Settings warnDays={warn_days} invalid shareUrl={url} />, 400);
    }
    await setWarnDays(c.env.DB, c.var.spaceId, parsed.data.warn_days);
    return c.redirect("/", 303);
  })
  // 発行はしない。別の端末が先に作り直していたら、一覧の案内（新しい共有 URL を開く）に任せる
  .post("/settings/rotate", findSpace, async (c) => {
    const old = c.var.spaceId;
    const id = crypto.randomUUID();
    if (old === undefined || !(await rotateSpace(c.env.DB, old, id))) return c.redirect("/", 303);
    c.set("spaceId", id);
    return c.redirect("/settings", 303);
  });
