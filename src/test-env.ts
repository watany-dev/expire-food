import { readdir, readFile } from "node:fs/promises";

import { getPlatformProxy } from "wrangler";

/**
 * 結合テスト用に、インメモリの D1 に migrations/ を適用したバインディングを用意する。
 * vitest-pool-workers が Vitest 5 に未対応のための代替（ROADMAP「Vitest の実行環境について」）
 */
export const createTestEnv = async () => {
  const proxy = await getPlatformProxy<Env>({ persist: false, remoteBindings: false });
  // vp test はリポジトリのルートで実行する
  for (const file of (await readdir("migrations")).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = (await readFile(`migrations/${file}`, "utf8")).replace(/^--.*$/gm, "");
    const statements = sql
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    await proxy.env.DB.batch(statements.map((s) => proxy.env.DB.prepare(s)));
  }
  // スペースの発行の制限はキーが同じ（cf-connecting-ip が無い）だと数回で掛かるので、既定では通す
  const env: Env = { ...proxy.env, SPACE_RATE_LIMITER: { limit: async () => ({ success: true }) } };
  return { env, dispose: proxy.dispose };
};

/** 作り直し（`batch()`）の直前に、別の端末が先に作り直して `spaceId` を消した状態を作る */
export const withRotatedAway = (env: Env, spaceId: string): Env => ({
  ...env,
  DB: new Proxy(env.DB, {
    get: (db, key) =>
      key === "batch"
        ? async (statements: D1PreparedStatement[]) => {
            await db.prepare("DELETE FROM spaces WHERE id = ?").bind(spaceId).run();
            return db.batch(statements);
          }
        : (Reflect.get(db, key) as () => unknown).bind(db),
  }),
});

/** スペースの存在確認（resolveSpace）の直後に、別の端末が先に作り直して `spaceId` を消した状態を作る */
export const withRemovedAfterCheck = (env: Env, spaceId: string): Env => {
  const prepare = (sql: string) => {
    const statement = env.DB.prepare(sql);
    if (!sql.startsWith("SELECT 1 FROM spaces")) return statement;
    return {
      bind: (...values: unknown[]) => ({
        first: async () => {
          const row = await statement.bind(...values).first();
          await env.DB.prepare("DELETE FROM spaces WHERE id = ?").bind(spaceId).run();
          return row;
        },
      }),
    };
  };
  // この経路で使うのは prepare だけ
  return { ...env, DB: { prepare } as unknown as D1Database };
};

/** 件数の上限の確認用に、スペースに商品かタグを `count` 件、1 文で直接入れる */
export const fillSpace = async (
  env: Env,
  table: "items" | "tags",
  spaceId: string,
  count: number,
) => {
  const statement =
    table === "items"
      ? env.DB.prepare(
          `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ?3)
          INSERT INTO items (id, space_id, name, expires_on, kind, created_at)
          SELECT lower(hex(randomblob(16))), ?1, '商品' || i, '2026-10-05', 'best_by', ?2 FROM n`,
        )
      : env.DB.prepare(
          `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ?3)
          INSERT INTO tags (id, space_id, name, created_at)
          SELECT lower(hex(randomblob(16))), ?1, 'タグ' || i, ?2 FROM n`,
        );
  await statement.bind(spaceId, new Date().toISOString(), count).run();
};
