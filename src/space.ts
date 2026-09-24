import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";

import { spaceId as spaceIdSchema } from "./domain/schema";
import { createSpace, spaceExists } from "./platform/db";

export type AppEnv = { Bindings: Env; Variables: { spaceId: string } };
type PageEnv = {
  Bindings: Env;
  Variables: { spaceId: string | undefined; lostSpace: boolean };
};

const SPACE_COOKIE = "space_id";

// 形式を先に確かめ、Cookie の無いリクエスト（クローラー・Lighthouse）では D1 に触れない
const knownSpace = async <E extends { Bindings: Env }>(c: Context<E>, candidate: unknown) => {
  const parsed = spaceIdSchema.safeParse(candidate);
  return parsed.success && (await spaceExists(c.env.DB, parsed.data)) ? parsed.data : undefined;
};

// 使い続けている端末でスペースが消えないよう、毎回書き直して有効期限を 1 年に延ばす
const saveSpaceCookie = (c: Context, id: string) => {
  setCookie(c, SPACE_COOKIE, id, {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    maxAge: 60 * 60 * 24 * 365,
  });
};

export const openSharedSpace = async (c: Context<{ Bindings: Env }>, candidate: string) => {
  const id = await knownSpace(c, candidate);
  if (id !== undefined) saveSpaceCookie(c, id);
  return id !== undefined;
};

/** Cookie のスペースを解決し、見つからなければ新しく発行する（API と書き込み系の画面） */
export const resolveSpace = createMiddleware<AppEnv>(async (c, next) => {
  let id = await knownSpace(c, getCookie(c, SPACE_COOKIE));
  if (id === undefined) {
    id = crypto.randomUUID();
    await createSpace(c.env.DB, id);
  }
  c.set("spaceId", id);
  await next();
  // ハンドラーの後で書く。共有 URL の作り直し（ADR 0004）でハンドラーが `spaceId` を差し替えるため
  saveSpaceCookie(c, c.var.spaceId);
});

/**
 * Cookie のスペースを解決するが発行はしない（閲覧系の画面）。見つからなければ `spaceId` は undefined。
 * Cookie があるのに見つからない（共有 URL が作り直された）ときは `lostSpace` を立てる
 */
export const findSpace = createMiddleware<PageEnv>(async (c, next) => {
  const cookie = getCookie(c, SPACE_COOKIE);
  const id = await knownSpace(c, cookie);
  c.set("spaceId", id);
  c.set("lostSpace", id === undefined && cookie !== undefined);
  await next();
  if (c.var.spaceId !== undefined) saveSpaceCookie(c, c.var.spaceId);
});
