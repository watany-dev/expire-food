import { getCookie, setCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";

import { spaceId as spaceIdSchema } from "./domain/schema";
import { createSpace, spaceExists } from "./platform/db";

export type AppEnv = { Bindings: Env; Variables: { spaceId: string } };

const SPACE_COOKIE = "space_id";

const knownSpace = async (db: D1Database, candidate: unknown): Promise<string | undefined> => {
  const parsed = spaceIdSchema.safeParse(candidate);
  return parsed.success && (await spaceExists(db, parsed.data)) ? parsed.data : undefined;
};

/**
 * URL（`/s/:spaceId`）→ Cookie の順でスペースを解決する。D1 に存在しない ID は使わず、
 * どちらも無ければ新しいスペースを発行する。Cookie は毎回書き直して有効期限を 1 年に延ばす
 */
export const resolveSpace = createMiddleware<AppEnv>(async (c, next) => {
  let id =
    (await knownSpace(c.env.DB, c.req.param("spaceId"))) ??
    (await knownSpace(c.env.DB, getCookie(c, SPACE_COOKIE)));
  if (id === undefined) {
    id = crypto.randomUUID();
    await createSpace(c.env.DB, id);
  }
  setCookie(c, SPACE_COOKIE, id, {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  c.set("spaceId", id);
  await next();
});
