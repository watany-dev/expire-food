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
  return { env: proxy.env, dispose: proxy.dispose };
};
