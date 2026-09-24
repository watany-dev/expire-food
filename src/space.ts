import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";

import { spaceId as spaceIdSchema } from "./domain/schema";
import { createSpace, spaceExists } from "./platform/db";

export type AppEnv = { Bindings: Env; Variables: { spaceId: string } };
type PageEnv = { Bindings: Env; Variables: { spaceId: string | undefined } };

const SPACE_COOKIE = "space_id";

// 形式を先に確かめ、Cookie の無いリクエスト（クローラー・Lighthouse）では D1 に触れない
const knownSpace = async <E extends { Bindings: Env }>(c: Context<E>, candidate: unknown) => {
  const parsed = spaceIdSchema.safeParse(candidate);
  return parsed.success && (await spaceExists(c.env.DB, parsed.data)) ? parsed.data : undefined;
};

/** URL（`/s/:spaceId`）→ Cookie の順で、D1 に存在するスペースを探す */
const lookupSpace = async <E extends { Bindings: Env }>(
  c: Context<E>,
): Promise<string | undefined> =>
  (await knownSpace(c, c.req.param("spaceId"))) ??
  (await knownSpace(c, getCookie(c, SPACE_COOKIE)));

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

/** スペースを解決し、見つからなければ新しく発行する（API と書き込み系の画面） */
export const resolveSpace = createMiddleware<AppEnv>(async (c, next) => {
  let id = await lookupSpace(c);
  if (id === undefined) {
    id = crypto.randomUUID();
    await createSpace(c.env.DB, id);
  }
  saveSpaceCookie(c, id);
  c.set("spaceId", id);
  await next();
});

/** スペースを解決するが発行はしない（閲覧系の画面）。見つからなければ `spaceId` は undefined */
export const findSpace = createMiddleware<PageEnv>(async (c, next) => {
  const id = await lookupSpace(c);
  if (id !== undefined) saveSpaceCookie(c, id);
  c.set("spaceId", id);
  await next();
});
